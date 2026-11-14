/**
 * POST /api/sycapay/status
 *
 * Rattrapage prévu par la doc SycaPay : quand le webhook n'arrive pas (point
 * d'entrée indisponible, notification perdue, réponse non-2xx), on interroge
 * POST /statusV2 avec notre idPartenaire. Il rend exactement le même objet
 * transaction que le webhook — et il déclenche le même règlement.
 *
 * C'est aussi ce que l'écran d'attente appelle en boucle : un client qui a
 * payé mais fermé l'onglet avant d'être redirigé retrouve son abonnement.
 *
 * POST /statusV2 rend ETag et sert depuis un cache : c'est une lecture, la
 * charge est faible, mais on garde une garde-fou anti-boucle côté client.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  call,
  describeError,
  failureMessage,
  isExpiredFailure,
  isRetryableFailure,
  isRetryableCallError,
  isSycaPayConfigured,
  readConfig,
  SycaPayCertificateError,
  SycaPayConfigError,
  SycaPayTransportError,
  type StatusResponse,
} from '../_lib/sycapay.js';
import { settle, type SettleOutcome } from '../_lib/settle.js';
import { requireRole, referenceBelongsTo } from '../_lib/session.js';
import { adminClient, SupabaseAdminConfigError } from '../_lib/supabaseAdmin.js';
import {
  handlePreflight,
  methodNotAllowed,
  readJson,
  sendError,
  sendJson,
} from '../_lib/http.js';

export const config = { runtime: 'nodejs' };

interface StatusBody {
  reference?: unknown;
}

/**
 * Sonde de configuration (GET /api/sycapay/status).
 *
 * Elle vit ici plutôt que dans un fichier séparé : Vercel Hobby plafonne
 * un déploiement à 12 fonctions, et une sonde publique n'a pas besoin
 * d'une fonction à elle seule. Aucun secret n'est révélé — seulement ce
 * qui est configuré ou non.
 */
async function handleHealth(res: ServerResponse) {
  let sycapayOk = false;
  let sycapayError: string | undefined;
  try {
    readConfig();
    sycapayOk = true;
  } catch (err) {
    sycapayOk = false;
    sycapayError = err instanceof SycaPayConfigError ? err.message : 'configuration illisible';
  }

  let settlementOk = false;
  let dbError: string | undefined;
  try {
    const { error } = await adminClient().rpc('oresto_settle_payment', {
      p_reference: '__health__',
      p_tag: 'PENDING',
    });
    settlementOk = !error;
    if (error) dbError = error.message;
  } catch (err) {
    settlementOk = false;
    dbError = err instanceof SupabaseAdminConfigError ? err.message : (err as Error).message;
  }

  let paymentSchemaOk = false;
  let unsettledPaidPayments = 0;
  try {
    const db = adminClient();
    const { error } = await db
      .from('oresto_payments')
      .select('settled_at, paid_at')
      .limit(0);
    paymentSchemaOk = !error;
    if (error && !dbError) dbError = 'Colonnes de règlement manquantes : exécutez supabase-o-resto-final-2026.sql.';
    if (paymentSchemaOk) {
      const { count, error: countError } = await db
        .from('oresto_payments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'paid')
        .is('settled_at', null);
      if (countError) {
        if (!dbError) dbError = 'État des anciens paiements impossible à vérifier.';
      } else {
        unsettledPaidPayments = count ?? 0;
      }
    }
  } catch {
    paymentSchemaOk = false;
    if (!dbError) dbError = 'Schéma des paiements inaccessible.';
  }

  let paymentGroupsOk = false;
  try {
    const db = adminClient();
    const groupTable = await db
      .from('oresto_payment_groups')
      .select('payment_reference, subscription_ids, child_ids')
      .limit(0);
    const groupFunction = await db.rpc('oresto_settle_payment_group', {
      p_reference: `__health__${randomUUID()}`,
      p_tag: 'PENDING',
      p_provider_tx: null,
      p_event_id: null,
    });
    paymentGroupsOk = !groupTable.error && !groupFunction.error;
  } catch {
    paymentGroupsOk = false;
  }

  const database = settlementOk && paymentSchemaOk;
  return sendJson(res, 200, {
    ok: sycapayOk && database,
    sycapay: sycapayOk,
    sycapayError: sycapayError ?? null,
    database,
    databaseError: dbError ?? null,
    unsettledPaidPayments,
    paymentGroups: paymentGroupsOk,
    paymentGroupsError: paymentGroupsOk
      ? null
      : 'Paiements de plusieurs enfants non configurés : exécutez supabase-payment-groups.sql.',
    mode: sycapayOk && database ? 'sycapay' : 'demo',
    webhookSignatureRequired: (process.env.SYCAPAY_WEBHOOK_REQUIRE_SIGNATURE ?? 'true').toLowerCase() !== 'false',
    configured: isSycaPayConfigured(),
  });
}

async function handleProbe(_req: IncomingMessage, res: ServerResponse) {
  if (!isSycaPayConfigured()) {
    return sendError(res, 503, 'Passerelle SycaPay non configurée sur ce déploiement.');
  }

  let sycaPayConfig;
  try {
    sycaPayConfig = readConfig();
  } catch (err) {
    if (err instanceof SycaPayConfigError) return sendError(res, 500, err.message);
    throw err;
  }

  try {
    await call(sycaPayConfig, {
      path: '/balance',
      body: { loginApi: sycaPayConfig.loginApi, mdpApi: sycaPayConfig.mdpApi },
      timeoutMs: 15000,
    });
    return sendJson(res, 200, { ok: true, probe: 'success' });
  } catch (err) {
    const isTransport = err instanceof SycaPayTransportError;
    const e = err as NodeJS.ErrnoException;
    return sendJson(res, 502, {
      ok: false,
      probe: 'failed',
      error: isTransport ? err.message : (err as Error).message,
      code: e.code ?? null,
      syscall: e.syscall ?? null,
      address: (e as { address?: string }).address ?? null,
      port: (e as { port?: number }).port ?? null,
    });
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return handlePreflight(req, res);
  // GET = sonde publique ; POST = rattrapage d'une transaction.
  if (req.method === 'GET') {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.searchParams.get('probe') === '1') return handleProbe(req, res);
    return handleHealth(res);
  }
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['GET', 'POST']);

  // statusV2 ne se contente pas de lire : il déclenche le même règlement que
  // le webhook. Un appel anonyme permettrait de solder n'importe quelle commande
  // en connaissant sa simple référence.
  const caller = await requireRole(req, res, ['client', 'personnel', 'gestionnaire', 'admin']);
  if (!caller) return;

  if (!isSycaPayConfigured()) {
    return sendError(res, 503, 'Passerelle SycaPay non configurée sur ce déploiement.');
  }

  let body: StatusBody;
  try {
    body = await readJson<StatusBody>(req);
  } catch {
    return sendError(res, 400, 'Corps JSON invalide.');
  }

  const reference = typeof body.reference === 'string' ? body.reference.trim() : '';
  if (!reference || reference.length > 100) {
    return sendError(res, 400, 'Référence de transaction obligatoire.');
  }

  // Le personnel suit toutes les transactions ; un parent seulement les
  // siennes. Sans ce contrôle, la route resterait ouverte : il suffirait à un
  // parent authentifié de deviner une référence pour solder la commande
  // d'un autre.
  //
  // Une panne de base vaut « accès refusé » : mieux vaut rendre la main que
  // laisser passer une vérification qu'on n'a pas pu faire.
  let ownsReference = false;
  try {
    ownsReference = await referenceBelongsTo(caller, reference);
  } catch {
    ownsReference = false;
  }
  if (!ownsReference) {
    return sendError(res, 403, 'Cette transaction n’est pas la vôtre.');
  }

  let sycaPayConfig;
  try {
    sycaPayConfig = readConfig();
  } catch (err) {
    if (err instanceof SycaPayConfigError) return sendError(res, 500, err.message);
    throw err;
  }

  let response: StatusResponse;
  try {
    response = await call<StatusResponse>(sycaPayConfig, {
      path: '/statusV2',
      body: { loginApi: sycaPayConfig.loginApi, mdpApi: sycaPayConfig.mdpApi, idPartenaire: reference },
    });
  } catch (err) {
    if (err instanceof SycaPayCertificateError) {
      // On ne solde rien : une vérification impossible ne vaut pas un échec
      // définitif. Le message est générique et ne contient aucun secret.
      return sendError(res, 502, err.message, { retryable: false, status: 'unknown' });
    }
    if (err instanceof SycaPayTransportError) {
      // Panne réseau : rien n'est conclu, et surtout rien n'est soldé.
      return sendError(res, 502, err.message, { retryable: true, status: 'unknown' });
    }
    throw err;
  }

  const data = response.data;
  if (!data) {
    // 1114 : partenaire désactivé ou transaction introuvable.
    const message = describeError(response);
    // Une enveloppe sans code ni donnée ne renseigne pas le client, mais
    // elle est précieuse ici : elle trahit une URL de base modifiée ou
    // une réponse que la passerelle n'aurait pas dû rendre.
    if (!response.errorCode) {
      // Ni secret ni donnée personnelle ici : seulement l'endpoint appelé,
      // pour distinguer une URL de base modifiée d'un refus de la passerelle.
      console.warn('[sycapay/status] enveloppe inattendue', JSON.stringify({
        endpoint: `${sycaPayConfig.baseUrl}/statusV2`,
        response: JSON.stringify(response).slice(0, 300),
      }));
    }
    return sendJson(res, response.errorCode === '1114' ? 404 : 502, {
      ok: false,
      error: message,
      errorCode: response.errorCode ?? null,
      status: 'unknown',
      retryable: isRetryableCallError(response.errorCode),
    });
  }

  const tag = typeof data.tag === 'string' ? data.tag : null;
  const statut = typeof data.statut === 'string' ? data.statut : null;
  const errorCode = data.erreur?.code ?? data.reasonForFailure ?? null;

  // Un tag absent = transaction pas encore finalisée. On ne solde rien et on
  // le dit : PENDING est une réponse normale, pas une erreur.
  if (!tag) {
    return sendJson(res, 200, {
      ok: true,
      reference,
      status: 'pending',
      // Un échec peut rester PENDING le temps que SycaPay nomme sa cause
      // (jusqu'à 24 h) : ne rien afficher d'irréversible.
      providerStatus: statut ?? 'PENDING',
      transactionId: data.tokenTX ?? null,
      expiresAt: null,
      error: null,
    });
  }

  let outcome: SettleOutcome;
  try {
    outcome = await settle({
      reference,
      tag,
      providerTx: data.tokenTX ?? null,
      errorCode,
      errorMessage: data.erreur?.message ?? data.reasonForFailure ?? null,
      // Pas d'eventId ici : statusV2 est un appel direct, pas une
      // notification. L'idempotence tient au statut déjà soldé côté SQL.
      eventId: null,
      finalized: statut ? statut.toUpperCase() === 'FINISHED' : true,
      eventType: `${data.typeService ?? 'transaction'}.${tag}`,
    });
  } catch (err) {
    console.error('[sycapay/status] règlement impossible :', (err as Error).message);
    return sendJson(res, 500, { ok: false, error: (err as Error).message, reference });
  }

  const paid = outcome.status === 'paid' || tag === 'SUCCESS';
  return sendJson(res, 200, {
    ok: true,
    reference,
    status: paid ? 'paid' : tag === 'CANCELED' ? 'cancelled' : 'failed',
    // 'already' = le webhook était passé avant : c'est le résultat attendu
    // quand on rattrape, pas une anomalie.
    outcome: outcome.outcome,
    addedMeals: outcome.addedMeals ?? null,
    providerStatus: statut ?? null,
    transactionId: data.tokenTX ?? null,
    errorCode,
    error: paid
      ? null
      : failureMessage(errorCode, data.erreur?.message ?? data.reasonForFailure ?? null),
    // Un abandon n'est pas un refus : on peut le proposer à nouveau.
    expired: isExpiredFailure(errorCode),
    retryable: isRetryableFailure(errorCode),
  });
}
