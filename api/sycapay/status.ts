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
import {
  call,
  describeError,
  failureMessage,
  isExpiredFailure,
  isRetryableFailure,
  isRetryableCallError,
  isSycaPayConfigured,
  readConfig,
  SycaPayConfigError,
  SycaPayTransportError,
  type StatusResponse,
} from '../_lib/sycapay.js';
import { settle, type SettleOutcome } from '../_lib/settle.js';
import { requireRole, referenceBelongsTo } from '../_lib/session.js';
import {
  handlePreflight,
  methodNotAllowed,
  readJson,
  sendError,
  sendJson,
} from '../_lib/http.js';

interface StatusBody {
  reference?: unknown;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return handlePreflight(req, res);
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

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

  let config;
  try {
    config = readConfig();
  } catch (err) {
    if (err instanceof SycaPayConfigError) return sendError(res, 500, err.message);
    throw err;
  }

  let response: StatusResponse;
  try {
    response = await call<StatusResponse>(config, {
      path: '/statusV2',
      body: { loginApi: config.loginApi, mdpApi: config.mdpApi, idPartenaire: reference },
    });
  } catch (err) {
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
        endpoint: `${config.baseUrl}/statusV2`,
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
