/**
 * GET /api/auth/health-signup
 *
 * Sonde publique : dit si la création de compte parent est opérationnelle.
 * Elle n'expose aucun secret — juste « la clé de service est-elle
 * configurée côté serveur ? ». Utile pour diagnostiquer « impossible de
 * créer un compte » sans accès aux logs Vercel.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminClient, SupabaseAdminConfigError } from '../_lib/supabaseAdmin.js';
import { handlePreflight, methodNotAllowed, sendJson } from '../_lib/http.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return handlePreflight(req, res);
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET']);

  try {
    adminClient();
    return sendJson(res, 200, { ok: true, signup: 'disponible' });
  } catch (e) {
    if (e instanceof SupabaseAdminConfigError) {
      return sendJson(res, 200, { ok: false, signup: 'indisponible', raison: 'cle-service-absente' });
    }
    return sendJson(res, 200, { ok: false, signup: 'indisponible', raison: 'erreur-configuration' });
  }
}
