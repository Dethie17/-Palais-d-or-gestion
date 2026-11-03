import type { IncomingMessage, ServerResponse } from 'node:http';
import { isSycaPayConfigured, readConfig, SycaPayConfigError } from '../_lib/sycapay.js';
import { adminClient, SupabaseAdminConfigError } from '../_lib/supabaseAdmin.js';
import { handlePreflight, methodNotAllowed, sendJson } from '../_lib/http.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return handlePreflight(req, res);
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET', 'OPTIONS']);

  let sycapayOk = false;
  let sycapayError: string | null = null;
  try {
    readConfig();
    sycapayOk = true;
  } catch (error) {
    sycapayError = error instanceof SycaPayConfigError ? error.message : 'configuration illisible';
  }

  let databaseOk = false;
  let databaseError: string | null = null;
  try {
    const { error } = await adminClient().rpc('oresto_settle_payment', {
      p_reference: '__health__',
      p_tag: 'PENDING',
    });
    databaseOk = !error;
    if (error) databaseError = error.message;
  } catch (error) {
    databaseOk = false;
    databaseError = error instanceof SupabaseAdminConfigError
      ? error.message
      : error instanceof Error ? error.message : 'base injoignable';
  }

  return sendJson(res, 200, {
    ok: sycapayOk && databaseOk,
    mode: sycapayOk && databaseOk ? 'sycapay' : 'demo',
    sycapay: sycapayOk,
    sycapayError,
    database: databaseOk,
    databaseError,
    webhookSignatureRequired: (process.env.SYCAPAY_WEBHOOK_REQUIRE_SIGNATURE ?? 'true').toLowerCase() !== 'false',
    configured: isSycaPayConfigured(),
  });
}
