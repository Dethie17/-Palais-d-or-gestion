/**
 * POST /api/auth/create-user
 *
 * Crée un compte de personnel à partir de l'écran Paramètres → Comptes.
 * Gère aussi la réinitialisation de mot de passe (`?action=set-password`)
 * pour rester sous la limite de fonctions serverless du plan Vercel Hobby.
 *
 * Pourquoi une fonction serveur et pas un `insert` depuis le navigateur :
 * créer un compte Supabase Auth exige la clé de service, qui n'a rien à faire
 * dans un bundle JavaScript. Et c'est cette clé qui permet de fixer le rôle
 * — un appel direct ne peut donc pas s'attribuer un rôle de direction.
 *
 * Corps : { "username": "awa", "password": "…", "role": "personnel" }
 * Pour un parent : { username, password, role: "client", firstName, lastName, phone }
 * — l'identifiant conseillé est le numéro de téléphone du parent.
 * Réinitialisation : POST /api/auth/create-user?action=set-password
 * avec { "username": "awa", "password": "…" }
 *
 * Création réservée à la Direction (admin) et au back-office MIAM'S Dangote
 * (superviseur-dangote, limité aux rôles et à l'entité de son périmètre).
 * Réinitialisation réservée aux rôles autorisés à supprimer un compte.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminClient } from '../_lib/supabaseAdmin.js';
import { normalizeUsername, isValidUsername, STAFF_SIGNUP_FLAG } from '../_lib/username.js';
import { personalQrToken } from '../_lib/qrToken.js';
import { insertUserProfile } from '../_lib/profile.js';
import { requireRole, CREATE_USER_ROLES, DELETE_USER_ROLES } from '../_lib/session.js';
import {
  handlePreflight,
  methodNotAllowed,
  readJson,
  sendError,
  sendJson,
} from '../_lib/http.js';

const VALID_ROLES = ['client', 'personnel', 'gestionnaire', 'admin', 'rh', 'superviseur-dangote', 'employe-dangote'] as const;
type Role = (typeof VALID_ROLES)[number];

interface CreateBody {
  username?: unknown;
  password?: unknown;
  role?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
  entiteId?: unknown;
  matricule?: unknown;
  nom?: unknown;
  prenom?: unknown;
  service?: unknown;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return handlePreflight(req, res);
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  // Ancienne route /api/auth/set-password : conservée pour les clients déjà
  // chargés et pour le serveur Render qui mappe encore cette URL ici.
  const requestUrl = req.url ?? '';
  const pathname = requestUrl.split('?')[0];
  const query = new URLSearchParams(requestUrl.split('?')[1] ?? '');
  const isPasswordReset = query.get('action') === 'set-password' || pathname === '/api/auth/set-password';

  const caller = await requireRole(req, res, isPasswordReset ? DELETE_USER_ROLES : CREATE_USER_ROLES);
  if (!caller) return;

  let body: CreateBody;
  try {
    body = await readJson<CreateBody>(req);
  } catch {
    return sendError(res, 400, 'Corps JSON invalide.');
  }

  if (isPasswordReset) {
    const resetUsername = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const resetPassword = typeof body.password === 'string' ? body.password : '';

    if (!resetUsername) return sendError(res, 400, 'Nom d’utilisateur obligatoire.');
    if (resetPassword.length < 8) return sendError(res, 400, 'Mot de passe de 8 caractères minimum.');

    const db = adminClient();

    const { data: profile, error: lookupError } = await db
      .from('users')
      .select('auth_id')
      .eq('username', resetUsername)
      .maybeSingle();

    if (lookupError || !profile) {
      return sendError(res, 404, 'Compte introuvable.');
    }

    const authId = (profile as { auth_id?: string | null }).auth_id;
    if (!authId) {
      return sendError(res, 409, 'Ce compte n’est pas encore rattaché à un compte d’authentification.');
    }

    const { error } = await db.auth.admin.updateUserById(authId, { password: resetPassword });
    if (error) return sendError(res, 500, 'Réinitialisation impossible.');

    return sendJson(res, 200, { ok: true, username: resetUsername });
  }

  const username = normalizeUsername(typeof body.username === 'string' ? body.username : '');
  const password = typeof body.password === 'string' ? body.password : '';
  const role = String(body.role ?? '') as Role;
  const entiteId = typeof body.entiteId === 'string' ? body.entiteId.trim() : '';

  if (!isValidUsername(username)) {
    return sendError(res, 400, 'Nom d’utilisateur : 3 à 24 caractères (lettres, chiffres, . _ -).');
  }
  if (password.length < 8) {
    return sendError(res, 400, 'Mot de passe de 8 caractères minimum.');
  }
  if (!VALID_ROLES.includes(role)) {
    return sendError(res, 400, 'Rôle invalide.');
  }
  const isDangoteRole = role === 'rh' || role === 'superviseur-dangote' || role === 'employe-dangote';
  if (isDangoteRole && !entiteId) {
    return sendError(res, 400, 'Entité requise pour un rôle Dangote.');
  }
  // Un superviseur MIAM'S ne crée que des comptes de SON entité, et jamais
  // un compte de direction ISM ou un parent.
  if (caller.role === 'superviseur-dangote') {
    if (!isDangoteRole) {
      return sendError(res, 403, 'Un superviseur MIAM\'S ne peut créer que des comptes Dangote.');
    }
    if (!caller.entiteId || caller.entiteId !== entiteId) {
      return sendError(res, 403, 'Entité non autorisée.');
    }
  }

  // Champs identité : obligatoires pour un parent, ignorés pour le personnel.
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : '';
  const matricule = typeof body.matricule === 'string' ? body.matricule.trim() : '';
  const nom = typeof body.nom === 'string' ? body.nom.trim() : '';
  const prenom = typeof body.prenom === 'string' ? body.prenom.trim() : '';
  const service = typeof body.service === 'string' ? body.service.trim() : '';
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
    // Marqueur « créé par O RESTO » : il autorise le pont email → fiche
    // métier tant que la colonne `auth_id` n'existe pas en base.
    app_metadata: { oresto: STAFF_SIGNUP_FLAG },
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
      entite_id: isDangoteRole ? entiteId : null,
    },
    password,
  );

  if (profileError) {
    await db.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    console.error('[create-user] échec insertion profil', profileError.code, profileError.message);
    return sendError(res, 500, 'Compte d’authentification créé, mais fiche métier non enregistrée.');
  }

  if (role === 'employe-dangote' && entiteId) {
    const { error: employeError } = await db.from('dangote_employes').insert({
      entite_id: entiteId,
      // Le matricule reste l'identifiant de connexion : la fiche employé et
      // le compte Auth désignent ainsi la même personne.
      matricule: matricule || username,
      nom: nom || username,
      prenom,
      service: service || null,
      actif: true,
      qr_token: personalQrToken(username),
      user_id: created.user.id,
    });
    if (employeError) {
      // Pas de compte à moitié créé : on annule la fiche et l'identité Auth.
      await db.from('users').delete().eq('username', username);
      await db.auth.admin.deleteUser(created.user.id).catch(() => undefined);
      console.error('[create-user] échec insertion employé', employeError.code, employeError.message);
      return sendError(res, 500, 'Fiche employé non enregistrée. Réessayez.');
    }
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
