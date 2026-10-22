/**
 * POST /api/auth/login-parent — connexion d'un parent avec SON NUMÉRO seul.
 *
 * Aucun mot de passe demandé : le numéro enregistré par la DAF est
 * l'identifiant. Le serveur vérifie que le profil existe (rôle client), puis
 * ouvre une session Supabase avec le mot de passe technique dérivé du numéro
 * (voir _lib/parentAuth.ts). Aucun secret ne descend vers le navigateur :
 * seuls les jetons de session sont renvoyés.
 *
 * Corps : { "phone": "77 123 45 67" }
 * Réponse : { ok: true, accessToken, refreshToken }
 *
 * Limite : 30 tentatives / 10 min par IP — un numéro connu ouvre l'accès,
 * donc on ralentit l'énumération.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminClient, SupabaseAdminConfigError } from '../_lib/supabaseAdmin.js';
import {
  authEmailForUser,
  findAuthUserByEmail,
  normalizeSnPhone,
  parentAuthSecret,
  parentPassword,
} from '../_lib/parentAuth.js';
import {
  handlePreflight,
  methodNotAllowed,
  readJson,
  sendError,
  sendJson,
} from '../_lib/http.js';

const WINDOW_MS = 10 * 60_000;
const MAX_PER_IP = 30;
const hits = new Map<string, number[]>();

interface LoginBody {
  phone?: unknown;
}

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0]!.trim();
  return req.socket.remoteAddress ?? 'inconnu';
}

function rateLimited(ip: string, now: number): boolean {
  const kept = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (kept.length >= MAX_PER_IP) {
    hits.set(ip, kept);
    return true;
  }
  kept.push(now);
  hits.set(ip, kept);
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
    return sendError(res, 429, 'Trop de tentatives. Attendez quelques minutes puis réessayez.');
  }

  let body: LoginBody;
  try {
    body = await readJson<LoginBody>(req);
  } catch {
    return sendError(res, 400, 'Corps JSON invalide.');
  }

  const phone = normalizeSnPhone(body.phone);
  if (!phone) {
    return sendError(res, 400, 'Numéro invalide : 9 chiffres (ex : 77 123 45 67).');
  }

  let db;
  try {
    db = adminClient();
  } catch (e) {
    if (e instanceof SupabaseAdminConfigError) {
      return sendError(res, 503, 'Connexion momentanément indisponible.');
    }
    throw e;
  }

  // Le numéro doit correspondre à un profil PARENT (jamais au personnel).
  const { data: profile, error: profileError } = await db
    .from('users')
    .select('username, role')
    .eq('username', phone)
    .maybeSingle();

  if (profileError || !profile || profile.role !== 'client') {
    return sendError(res, 401, 'Numéro non enregistré. Adressez-vous à la cantine pour ouvrir votre accès.');
  }

  const email = authEmailForUser(phone);
  const password = parentPassword(parentAuthSecret(), phone);

  let { data, error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    // Compte créé avant la bascule « numéro seul » (ancien mot de passe) :
    // on aligne le mot de passe technique sur le numéro, puis on réessaie.
    const authUser = await findAuthUserByEmail(db, email);
    if (!authUser) {
      return sendError(res, 401, 'Accès parent non configuré. Adressez-vous à la cantine.');
    }
    const updated = await db.auth.admin.updateUserById(authUser.id, { password });
    if (updated.error) {
      return sendError(res, 500, 'Connexion impossible pour le moment. Réessayez.');
    }
    ({ data, error } = await db.auth.signInWithPassword({ email, password }));
  }

  if (error || !data?.session) {
    return sendError(res, 500, 'Connexion impossible pour le moment. Réessayez.');
  }

  return sendJson(res, 200, {
    ok: true,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  });
}
