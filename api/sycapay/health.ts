/**
 * GET /api/sycapay/health
 *
 * Sonde de configuration : le navigateur l'interroge au démarrage pour savoir
 * s'il doit proposer SycaPay ou rester en mode démo. Ne révèle aucun secret —
 * seulement ce qui est présent ou non.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { handlePreflight, methodNotAllowed, sendJson } from '../_lib/http.js';
import { isSycaPayConfigured, readConfig, SycaPayConfigError } from '../_lib/sycapay.js';
import { adminClient, SupabaseAdminConfigError } from '../_lib/supabaseAdmin.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return handlePreflight(req, res);
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET']);

  let sycapayOk = false;
  let sycapayError: string | undefined;
  try {
    readConfig();
    sycapayOk = true;
  } catch (err) {
    sycapayOk = false;
    sycapayError = err instanceof SycaPayConfigError ? err.message : 'configuration illisible';
  }

  let dbOk = false;
  let dbError: string | undefined;
  try {
    const { error } = await adminClient().rpc('oresto_settle_payment', {
      p_reference: '__health__',
      p_tag: 'PENDING',
    });
    // On n'appelle pas le règlement pour de vrai : cette référence n'existe
    // pas, la fonction répond 'unknown' — ce qui suffit à prouver que la clé
    // de service parle à la base et que le SQL est installé.
    dbOk = !error;
    if (error) dbError = error.message;
  } catch (err) {
    dbOk = false;
    dbError = err instanceof SupabaseAdminConfigError ? err.message : (err as Error).message;
  }

  return sendJson(res, 200, {
    ok: sycapayOk && dbOk,
    sycapay: sycapayOk,
    sycapayError: sycapayError ?? null,
    database: dbOk,
    databaseError: dbError ?? null,
    // Le navigateur bascule sur 'demo' quand ce false est vrai : le parcours
    // de démonstration doit survivre à une passerelle non configurée.
    mode: sycapayOk && dbOk ? 'sycapay' : 'demo',
    webhookSignatureRequired: (process.env.SYCAPAY_WEBHOOK_REQUIRE_SIGNATURE ?? 'true').toLowerCase() !== 'false',
    configured: isSycaPayConfigured(),
  });
}
