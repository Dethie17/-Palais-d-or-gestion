/**
 * POST /api/auth/set-password
 *
 * Réinitialise le mot de passe d'un compte par la DAF
 * (Paramètres → Comptes → réinitialiser).
 *
 * Passe par la clé de service : un utilisateur ne peut pas changer le mot de
 * passe d'un autre, et un utilisateur authentifié ne peut réécrire que le
 * sien (cas traité en amont, sans cette fonction).
 *
 * Corps : { "username": "awa", "password": "…" }
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminClient } from '../_lib/supabaseAdmin.js';
import { requireRole, ADMIN_ONLY } from '../_lib/session.js';
import {
  handlePreflight,
  methodNotAllowed,
  readJson,
  sendError,
  sendJson,
} from '../_lib/http.js';

interface ResetBody {
  username?: unknown;
  password?: unknown;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return handlePreflight(req, res);
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  const caller = await requireRole(req, res, ADMIN_ONLY);
  if (!caller) return;

  let body: ResetBody;
  try {
    body = await readJson<ResetBody>(req);
  } catch {
    return sendError(res, 400, 'Corps JSON invalide.');
  }

  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username) return sendError(res, 400, 'Nom d’utilisateur obligatoire.');
  if (password.length < 8) return sendError(res, 400, 'Mot de passe de 8 caractères minimum.');

  const db = adminClient();

  const { data: profile, error: lookupError } = await db
    .from('users')
    .select('auth_id')
    .eq('username', username)
    .maybeSingle();

  if (lookupError || !profile) {
    return sendError(res, 404, 'Compte introuvable.');
  }

  const authId = (profile as { auth_id?: string | null }).auth_id;
  if (!authId) {
    return sendError(res, 409, 'Ce compte n’est pas encore rattaché à un compte d’authentification.');
  }

  const { error } = await db.auth.admin.updateUserById(authId, { password });
  if (error) return sendError(res, 500, 'Réinitialisation impossible.');

  return sendJson(res, 200, { ok: true, username });
}
