/**
 * POST /api/sycapay/card
 *
 * Crée une session de paiement par carte sur la page hébergée par SycaPay :
 * le client reçoit un lien, saisit sa carte chez nous. Les métadonnées
 * passées ici sont conservées puis reportées sur la transaction au paiement ;
 * la page de paiement ne les affiche jamais.
 *
 * Les contrôles du service et des métadonnées se font ICI, à la création de la
 * session : un lien n'est jamais généré pour un paiement qui serait refusé une
 * fois la carte saisie.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  call,
  describeError,
  isAccepted,
  isRetryableCallError,
  isSycaPayConfigured,
  readConfig,
  SycaPayConfigError,
  SycaPayTransportError,
  type CheckoutSessionResponse,
} from '../_lib/sycapay.js';
import { adminClient } from '../_lib/supabaseAdmin.js';
import { requireRole, STAFF_OR_ADMIN } from '../_lib/session.js';
import {
  handlePreflight,
  methodNotAllowed,
  parseAmount,
  readJson,
  sanitizeMetadata,
  sendError,
  sendJson,
} from '../_lib/http.js';

interface CardBody {
  reference?: unknown;
  amount?: unknown;
  codeService?: unknown;
  urlSuccess?: unknown;
  urlFailed?: unknown;
  payerName?: unknown;
  metadata?: unknown;
}

/** Service carte par défaut de l'API. */
const DEFAULT_CARD_SERVICE = 'SN_CARD_GIMUEMOA';

/** Autorise un service carte explicite sans ouvrir les services _PM_. */
function validCardService(value: unknown): string | undefined {
  if (value == null || value === '') return DEFAULT_CARD_SERVICE;
  const service = String(value).trim();
  return /^[A-Z]{2}_CARD_[A-Z0-9_]+$/.test(service) ? service : undefined;
}

function validHttpsUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('https://');
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return handlePreflight(req, res);
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  // Ouvre une page de paiement carte : même exigence que /initiate.
  const caller = await requireRole(req, res, STAFF_OR_ADMIN);
  if (!caller) return;

  if (!isSycaPayConfigured()) {
    return sendError(res, 503, 'Passerelle SycaPay non configurée sur ce déploiement.');
  }

  let body: CardBody;
  try {
    body = await readJson<CardBody>(req);
  } catch {
    return sendError(res, 400, 'Corps JSON invalide.');
  }

  const reference = typeof body.reference === 'string' ? body.reference.trim() : '';
  if (!reference || reference.length > 100) {
    return sendError(res, 400, 'Référence de commande obligatoire (max 100 caractères).');
  }

  const amount = parseAmount(body.amount);
  if (amount == null) return sendError(res, 400, 'Montant invalide : un entier en XOF, au moins 100.');

  // Sur cet endpoint, 1120 désigne un montant invalide (et non l'absence
  // d'url_success, comme sur l'initiation unitaire).
  const codeService = validCardService(body.codeService);
  if (!codeService) return sendError(res, 400, 'Service carte inconnu.');

  // Les deux adresses sont obligatoires sur /checkout/session.
  if (!validHttpsUrl(body.urlSuccess) || !validHttpsUrl(body.urlFailed)) {
    return sendError(res, 400, 'urlSuccess et urlFailed sont obligatoires et doivent être en https.');
  }

  const payload: Record<string, unknown> = {
    montant: amount,
    urlSuccess: body.urlSuccess,
    urlFailed: body.urlFailed,
    // merchantReference devient l'idPartenaire de la transaction : c'est
    // notre clé de rapprochement.
    merchantReference: reference,
    codeService,
  };
  if (typeof body.payerName === 'string' && body.payerName.trim()) {
    payload.payerName = body.payerName.trim().slice(0, 120);
  }
  const metadata = sanitizeMetadata(body.metadata);
  if (metadata) payload.metadata = metadata;

  let config;
  try {
    config = readConfig();
  } catch (err) {
    if (err instanceof SycaPayConfigError) return sendError(res, 500, err.message);
    throw err;
  }

  let response: CheckoutSessionResponse;
  try {
    response = await call<CheckoutSessionResponse>(config, {
      path: '/checkout/session',
      body: { loginApi: config.loginApi, mdpApi: config.mdpApi, ...payload },
    });
  } catch (err) {
    if (err instanceof SycaPayTransportError) {
      // Aucun lien généré : rien n'est engagé, l'appel peut être renvoyé.
      return sendError(res, 502, err.message, { retryable: true });
    }
    throw err;
  }

  if (!isAccepted(response.errorCode) || !response.checkoutUrl) {
    const message = describeError(response);
    return sendJson(res, 400, {
      ok: false,
      error: message,
      errorCode: response.errorCode ?? null,
      retryable: isRetryableCallError(response.errorCode),
    });
  }

  // On note le lien sur la ligne de commande : merchantReference devient
  // l'idPartenaire, donc /status retrouve cette transaction par notre
  // référence. Le règlement, lui, ne se décide qu'après le webhook.
  await registerCheckout(reference, response.checkoutUrl);

  return sendJson(res, 200, {
    ok: true,
    checkoutUrl: response.checkoutUrl,
    token: response.token ?? null,
    reference,
    // Le lien de paiement n'est PAS un reçu : rien n'est encaissé tant que
    // le webhook n'a pas annoncé la transaction réglée.
    note: 'Aucun montant n’est débité tant que la confirmation SycaPay n’est pas reçue.',
  });
}

async function registerCheckout(reference: string, checkoutUrl: string): Promise<void> {
  try {
    const { error } = await adminClient().rpc('oresto_register_provider_tx', {
      p_reference: reference,
      p_provider: 'sycapay',
      p_provider_tx: reference,
      p_url: checkoutUrl,
      p_qr: null,
      p_deep_links: null,
      p_expires_at: null,
    });
    if (error) console.warn('[sycapay/card] trace impossible :', error.message);
  } catch (err) {
    console.warn('[sycapay/card] trace impossible :', (err as Error).message);
  }
}
