/**
 * POST /api/auth/create-user
 *
 * Crée un compte de personnel à partir de l'écran Paramètres → Comptes.
 *
 * Pourquoi une fonction serveur et pas un `insert` depuis le navigateur :
 * créer un compte Supabase Auth exige la clé de service, qui n'a rien à faire
 * dans un bundle JavaScript. Et c'est cette clé qui permet de fixer le rôle
 * — un appel direct ne peut donc pas s'attribuer un rôle de direction.
 *
 * Corps : { "username": "awa", "password": "…", "role": "personnel" }
 * Pour un parent : { username, password, role: "client", firstName, lastName, phone }
 * — l'identifiant conseillé est le numéro de téléphone du parent.
 *
 * Réservé à la DAF (role === 'admin').
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminClient } from '../_lib/supabaseAdmin.js';
import { normalizeUsername, isValidUsername } from '../_lib/username.js';
import { personalQrToken } from '../_lib/qrToken.js';
import { insertUserProfile } from '../_lib/profile.js';
import { requireRole, ADMIN_ONLY } from '../_lib/session.js';
import {
  handlePreflight,
  methodNotAllowed,
  readJson,
  sendError,
  sendJson,
} from '../_lib/http.js';

const VALID_ROLES = ['client', 'personnel', 'gestionnaire', 'admin'] as const;
type Role = (typeof VALID_ROLES)[number];

interface CreateBody {
  username?: unknown;
  password?: unknown;
  role?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return handlePreflight(req, res);
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  const caller = await requireRole(req, res, ADMIN_ONLY);
  if (!caller) return;

  let body: CreateBody;
  try {
    body = await readJson<CreateBody>(req);
  } catch {
    return sendError(res, 400, 'Corps JSON invalide.');
  }

  const username = normalizeUsername(typeof body.username === 'string' ? body.username : '');
  const password = typeof body.password === 'string' ? body.password : '';
  const role = String(body.role ?? '') as Role;

  if (!isValidUsername(username)) {
    return sendError(res, 400, 'Nom d’utilisateur : 3 à 24 caractères (lettres, chiffres, . _ -).');
  }
  if (password.length < 8) {
    return sendError(res, 400, 'Mot de passe de 8 caractères minimum.');
  }
  if (!VALID_ROLES.includes(role)) {
    return sendError(res, 400, 'Rôle invalide.');
  }

  // Champs identité : obligatoires pour un parent, ignorés pour le personnel.
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : '';
  if (role === 'client') {
    if (!firstName || !lastName) {
      return sendError(res, 400, 'Indiquez le nom et prénom du parent.');
    }
    if (phone && !/^[67]\d{8}$/.test(phone)) {
      return sendError(res, 400, 'Numéro invalide : format Sénégal (ex : 77 123 45 67).');
    }
  }

  // Domaine réel (celui du site) : Supabase refuse les adresses en `.local`.
  const domain = (process.env.AUTH_EMAIL_DOMAIN ?? '').trim().toLowerCase() || 'oresto-sn.com';
  const email = `${username}@${domain}`;
  const db = adminClient();

  // 1) Compte d'authentification. C'est Supabase qui hache (bcrypt, salé) :
  //    le mot de passe en clair ne quitte jamais ce runtime.
  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created?.user) {
    // Message volontairement vague : il ne doit pas révéler quelles
    // adresses existent déjà.
    return sendError(res, 400, 'Création impossible : identifiant déjà utilisé ou invalide.');
  }

  // 2) Profil métier, rattaché à l'uuid Auth.
  const profileError = await insertUserProfile(
    db,
    {
      username,
      role,
      auth_id: created.user.id,
      qr_token: personalQrToken(username),
    },
    password,
  );

  if (profileError) {
    // Ne pas laisser un compte orphelin : sans profil, il ne peut rien faire,
    // mais il traînerait dans la liste des comptes Auth.
    await db.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    console.error('[create-user] échec insertion profil', profileError.code, profileError.message);
    return sendError(res, 500, 'Compte d’authentification créé, mais fiche métier non enregistrée.');
  }

  // 3) Parent : fiche identité (prénom, nom, téléphone). Non bloquante —
  //    le ParentGate redemandera les informations manquantes à la connexion.
  if (role === 'client') {
    await db
      .from('parent_profiles')
      .upsert(
        {
          parent_username: username,
          first_name: firstName,
          last_name: lastName,
          phone,
        },
        { onConflict: 'parent_username' },
      )
      .then(() => undefined, () => undefined);
  }

  return sendJson(res, 201, { ok: true, username, role });
}
