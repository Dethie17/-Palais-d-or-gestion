/**
 * POST /api/auth/signup-parent — création de compte PARENT, publique.
 *
 * Pourquoi un endpoint serveur et pas `supabase.auth.signUp` depuis le
 * navigateur : la confirmation par courriel (activée par défaut chez
 * Supabase) bloquait chaque compte — personne ne reçoit jamais l'email d'une
 * adresse interne du type `mamadou@oresto-sn.com`. Ici la clé de service crée
 * le compte DÉJÀ CONFIRMÉ (`email_confirm: true`) : zéro email, zéro blocage,
 * zéro limite d'envoi. Le mot de passe n'est haché que par Supabase (bcrypt) :
 * il ne redescend jamais et ne sort jamais de ce runtime.
 *
 * Sécurité :
 * - le rôle est imposé à `client` (impossible de s'inscrire en admin) ;
 * - 5 créations / 10 min par adresse IP (mémoire de l'instance — pas une
 *   limite mondiale, mais suffisante pour arrêter le spam depuis un poste) ;
 * - validation stricte du nom, du mot de passe, du nom/prénom et du numéro ;
 * - mot de passe oublié = la cantine le réinitialise (set-password) : on ne
 *   demande jamais d'email, inexistant ici.
 *
 * Corps : { username, password, firstName, lastName, phone }
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminClient, SupabaseAdminConfigError } from '../_lib/supabaseAdmin.js';
import { normalizeUsername, isValidUsername, PARENT_SIGNUP_FLAG } from '../_lib/username.js';
import { personalQrToken } from '../_lib/qrToken.js';
import { insertUserProfile } from '../_lib/profile.js';
import {
  handlePreflight,
  methodNotAllowed,
  readJson,
  sendError,
  sendJson,
} from '../_lib/http.js';

const WINDOW_MS = 10 * 60_000;
const MAX_PER_IP = 5;
const hits = new Map<string, number[]>();

interface SignupBody {
  username?: unknown;
  password?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
}

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0]!.trim();
  return req.socket.remoteAddress ?? 'inconnu';
}

/** Vrai si cette IP a déjà atteint le quota (et enregistre la tentative). */
function rateLimited(ip: string, now: number): boolean {
  const kept = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (kept.length >= MAX_PER_IP) {
    hits.set(ip, kept);
    return true;
  }
  kept.push(now);
  hits.set(ip, kept);
  // Purge grossière : la carte ne doit pas grossir sans fin sur une instance
  // réutilisée. On retient au plus quelques milliers d'IP actives.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }
  return false;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return handlePreflight(req, res);
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  if (rateLimited(clientIp(req), Date.now())) {
    return sendError(res, 429, 'Trop de tentatives de création. Attendez quelques minutes puis réessayez.');
  }

  let body: SignupBody;
  try {
    body = await readJson<SignupBody>(req);
  } catch {
    return sendError(res, 400, 'Corps JSON invalide.');
  }

  const username = normalizeUsername(typeof body.username === 'string' ? body.username : '');
  const password = typeof body.password === 'string' ? body.password : '';
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : '';

  if (!isValidUsername(username)) {
    return sendError(res, 400, 'Nom invalide : 3 à 24 caractères — lettres, chiffres, points, tirets ou soulignés.');
  }
  if (password.length < 6) {
    return sendError(res, 400, 'Mot de passe de 6 caractères minimum.');
  }
  if (password.length > 72) {
    return sendError(res, 400, 'Mot de passe trop long (72 caractères maximum).');
  }
  if (!firstName || !lastName) {
    return sendError(res, 400, 'Indiquez votre nom et prénom.');
  }
  if (!/^[67]\d{8}$/.test(phone)) {
    return sendError(res, 400, 'Numéro invalide : format Sénégal (ex : 77 123 45 67).');
  }

  let db;
  try {
    db = adminClient();
  } catch (e) {
    if (e instanceof SupabaseAdminConfigError) {
      // Message actionnable : le parent n'a pas de recours self-service ici.
      return sendError(res, 503, 'Création momentanément indisponible. Présentez-vous à la cantine pour ouvrir votre compte.');
    }
    throw e;
  }

  const domain = (process.env.AUTH_EMAIL_DOMAIN ?? '').trim().toLowerCase() || 'oresto-sn.com';
  const email = `${username}@${domain}`;

  // 1) Compte d'authentification, déjà confirmé. Le marqueur `app_metadata`
  //    signale un compte créé par CETTE route : c'est la seule clé qui ouvre
  //    le pont d'identification par email (voir session.ts), tant que la
  //    colonne `auth_id` n'existe pas encore.
  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { oresto: PARENT_SIGNUP_FLAG },
  });
  if (createError || !created?.user) {
    const blob = `${createError?.code ?? ''} ${createError?.message ?? ''}`;
    if (/already|exists|registered|duplicate|23505/i.test(blob)) {
      return sendError(res, 409, 'Ce nom est déjà utilisé : connectez-vous avec. Mot de passe oublié ? Demandez-le à la cantine.');
    }
    return sendError(res, 400, 'Création impossible pour le moment. Réessayez dans un instant.');
  }

  // 2) Fiche métier (users), rattachée à l'uuid Auth. Rôle forcé à client.
  const profileError = await insertUserProfile(
    db,
    {
      username,
      role: 'client',
      auth_id: created.user.id,
      qr_token: personalQrToken(username),
    },
    password,
  );
  if (profileError) {
    // Ne pas laisser un compte Auth orphelin s'il n'a pas de fiche.
    await db.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    // Journalisé côté serveur : sans ce code, un 500 resterait opaque.
    console.error('[signup-parent] échec insertion profil', profileError.code, profileError.message);
    if (profileError.code === '23505') {
      return sendError(res, 409, 'Ce nom est déjà utilisé : connectez-vous avec. Mot de passe oublié ? Demandez-le à la cantine.');
    }
    return sendError(res, 500, 'Impossible d’enregistrer votre fiche. Réessayez dans un instant.');
  }

  // 3) Fiche identité parent. Non bloquante : si elle échoue, l'écran
  //    d'accueil (ParentGate) la redemandera à la première connexion — mieux
  //    que tout annuler pour un champ secondaire.
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

  return sendJson(res, 201, { ok: true, username });
}
