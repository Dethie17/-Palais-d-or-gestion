/**
 * POST /api/auth/delete-user
 *
 * Supprime un compte (Paramètres → Comptes). Réservé à la DAF.
 *
 * Deux suppressions sont nécessaires et doivent aller ensemble : le compte
 * d'authentification et le profil métier. Ne faire que la seconde laisserait
 * un compte Auth sans profil — inoffensif (il ne peut rien atteindre) mais
 * fantôme, et impossible à recréer puisque l'adresse serait déjà prise.
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

const USERNAME_RE = /^[a-z0-9._-]{3,24}$/;

interface DeleteBody {
  username?: unknown;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return handlePreflight(req, res);
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  const caller = await requireRole(req, res, ADMIN_ONLY);
  if (!caller) return;

  let body: DeleteBody;
  try {
    body = await readJson<DeleteBody>(req);
  } catch {
    return sendError(res, 400, 'Corps JSON invalide.');
  }

  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  if (!USERNAME_RE.test(username)) {
    return sendError(res, 400, 'Nom d’utilisateur invalide.');
  }

  // Se retirer soi-même laisserait la DAF sans compte administrateur.
  if (username === caller.username) {
    return sendError(res, 400, 'Vous ne pouvez pas supprimer votre propre compte.');
  }

  const db = adminClient();

  const { data: profile, error: lookupError } = await db
    .from('users')
    .select('auth_id')
    .eq('username', username)
    .maybeSingle();

  if (lookupError) {
    return sendError(res, 500, 'Suppression impossible.');
  }
  // Déjà absent : sortir en 200 évite qu'un double-clic n'apparaisse en erreur.
  if (!profile) {
    return sendJson(res, 200, { ok: true, username, alreadyAbsent: true });
  }

  const authId = (profile as { auth_id?: string | null }).auth_id;

  // Le compte d'authentification d'abord : c'est lui qui porte l'identité.
  // Un profil sans compte Auth serait un orphelin.
  if (authId) {
    const { error } = await db.auth.admin.deleteUser(authId);
    if (error) {
      return sendError(res, 500, 'Suppression impossible.');
    }
  }

  // La clé de service contourne le RLS : le retrait du droit DELETE côté
  // `authenticated` n'empêche donc pas cette suppression administrative.
  const { error: profileDeleteError } = await db
    .from('users')
    .delete()
    .eq('username', username);

  if (profileDeleteError) {
    return sendError(res, 500, 'Compte d’authentification supprimé, fiche métier non purgée.');
  }

  return sendJson(res, 200, { ok: true, username });
}
