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
import { insertUserProfile } from '../_lib/profile.js';
import { personalQrToken } from '../_lib/qrToken.js';
import { PARENT_SIGNUP_FLAG } from '../_lib/username.js';

const WINDOW_MS = 10 * 60_000;
const MAX_PER_IP = 30;
const hits = new Map<string, number[]>();

interface LoginBody {
  phone?: unknown;
}

function rowContainsPhone(row: unknown, phone: string): boolean {
  if (typeof row === 'string' || typeof row === 'number') {
    return normalizeSnPhone(row) === phone;
  }
  if (!row || typeof row !== 'object') return false;
  for (const value of Object.values(row as Record<string, unknown>)) {
    if (rowContainsPhone(value, phone)) return true;
  }
  return false;
}

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0]!.trim();
  return req.socket.remoteAddress ?? 'inconnu';
}

async function migrateLegacyParentIdentity(db: ReturnType<typeof adminClient>, legacyUsername: string, phone: string): Promise<void> {
  if (!legacyUsername || legacyUsername === phone) return;
  await Promise.allSettled([
    db.from('children').update({ parent_username: phone }).eq('parent_username', legacyUsername),
    db.from('subscriptions').update({ client_username: phone }).eq('client_username', legacyUsername),
    db.from('oresto_payments').update({ client_username: phone }).eq('client_username', legacyUsername),
    db.from('validations').update({ client_username: phone }).eq('client_username', legacyUsername),
    db.from('reclamations').update({ client_username: phone }).eq('client_username', legacyUsername),
    db.from('kiosk_orders').update({ parent_username: phone }).eq('parent_username', legacyUsername),
    db.from('reclamation_messages').update({ author_username: phone }).eq('author_username', legacyUsername),
  ]);

  const { data: canonicalUser } = await db.from('users')
    .select('username, role').eq('username', phone).maybeSingle();
  if (!canonicalUser) {
    await db.from('users').update({ username: phone, role: 'client' })
      .eq('username', legacyUsername);
  } else {
    await db.from('users').update({ role: 'client' })
      .eq('username', phone);
    await db.from('users').delete().eq('username', legacyUsername);
  }

  await db.from('parent_profiles').update({ parent_username: phone, phone })
    .eq('parent_username', legacyUsername);
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

  // 1. Recherche du profil canonique (identifiant = numéro de téléphone).
  let { data: profile, error: profileError } = await db
    .from('users')
    .select('username, role, auth_id')
    .eq('username', phone)
    .maybeSingle();

  // 2. Repli universel : certains imports ont conservé le numéro avec espaces,
  // +221, 00221 ou un ancien identifiant dans users. On normalise tous les
  // profils client/parent, sans dépendre du format enregistré en base.
  if (!profileError && !profile) {
    const { data: userRows } = await db
      .from('users')
      .select('*')
      .limit(10000);
    const legacyUser = (userRows ?? []).find((row: { username?: unknown; role?: unknown }) => {
      const role = typeof row.role === 'string' ? row.role.trim().toLowerCase() : '';
      return (role === 'client' || role === 'parent' || role === '')
        && (normalizeSnPhone(row.username) === phone || rowContainsPhone(row, phone));
    });
    if (legacyUser?.username && String(legacyUser.username).trim() !== phone) {
      await migrateLegacyParentIdentity(db, String(legacyUser.username).trim(), phone);
      ({ data: profile, error: profileError } = await db
        .from('users')
        .select('username, role, auth_id')
        .eq('username', phone)
        .maybeSingle());
    }
  }

  // 3. Repli pour les parents importés sous un ancien identifiant (« awa »,
  // « parent1 », etc.). Leur numéro est conservé dans parent_profiles.
  if (!profileError && !profile) {
    const { data: importedProfiles } = await db
      .from('parent_profiles')
      .select('*')
      .limit(10000);

    const imported = (importedProfiles ?? []).find((row: { phone?: unknown }) =>
      normalizeSnPhone(row.phone) === phone || rowContainsPhone(row, phone),
    );

    if (imported) {
      const legacyUsername = typeof imported.parent_username === 'string'
        ? imported.parent_username.trim().toLowerCase()
        : '';
      const firstName = typeof imported.first_name === 'string' ? imported.first_name.trim() : '';
      const lastName = typeof imported.last_name === 'string' ? imported.last_name.trim() : '';

      if (legacyUsername && legacyUsername !== phone) {
        await migrateLegacyParentIdentity(db, legacyUsername, phone);
      }

      ({ data: profile, error: profileError } = await db
        .from('users')
        .select('username, role')
        .eq('username', phone)
        .maybeSingle());

      if (!profile && !profileError) {
        const passwordForProfile = parentPassword(parentAuthSecret(), phone);
        const emailForProfile = authEmailForUser(phone);
        let authUser = await findAuthUserByEmail(db, emailForProfile);
        if (!authUser) {
          const createdAuth = await db.auth.admin.createUser({
            email: emailForProfile,
            password: passwordForProfile,
            email_confirm: true,
            app_metadata: { oresto: PARENT_SIGNUP_FLAG },
          });
          if (!createdAuth.error && createdAuth.data?.user) {
            authUser = { id: createdAuth.data.user.id };
          }
        }

        if (authUser) {
          const profileErrorCreate = await insertUserProfile(db, {
            username: phone,
            role: 'client',
            auth_id: authUser.id,
            qr_token: personalQrToken(phone),
          }, passwordForProfile);
          if (!profileErrorCreate) {
            profile = { username: phone, role: 'client' };
          }
        }

        await db.from('parent_profiles').upsert({
          parent_username: phone,
          first_name: firstName || 'Parent',
          last_name: lastName || phone,
          phone,
        }, { onConflict: 'parent_username' });
      }
    }
  }

  const profileRole = typeof profile?.role === 'string' ? profile.role.trim().toLowerCase() : '';
  if (profileError || !profile || !['client', 'parent'].includes(profileRole)) {
    return sendError(res, 401, 'Numéro non enregistré ou aucun profil parent associé. Adressez-vous à la cantine.');
  }

  const email = authEmailForUser(phone);
  const password = parentPassword(parentAuthSecret(), phone);

  let authUserEmail = email;
  let authUser = await findAuthUserByEmail(db, email);

  // Un compte importé peut exister avec son ancienne adresse technique ou
  // son ancien domaine Auth. Le numéro reste l'identifiant métier : on répare
  // alors le mot de passe et l'adresse connue de cet utilisateur Auth existant.
  if (!authUser && typeof (profile as { auth_id?: unknown }).auth_id === 'string') {
    const authId = String((profile as { auth_id: string }).auth_id).trim();
    if (authId) {
      const existing = await db.auth.admin.getUserById(authId);
      const existingEmail = typeof existing.data?.user?.email === 'string'
        ? existing.data.user.email.trim().toLowerCase()
        : '';
      if (!existing.error && existing.data?.user) {
        authUser = { id: existing.data.user.id };
        if (existingEmail) authUserEmail = existingEmail;
      }
    }
  }
  if (!authUser) {
    const created = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { oresto: PARENT_SIGNUP_FLAG },
    });
    if (!created.error && created.data?.user) {
      authUser = { id: created.data.user.id };
    }
  }

  if (!authUser) {
    return sendError(res, 500, 'Impossible de configurer le compte parent. Réessayez.');
  }

  await db.auth.admin.updateUserById(authUser.id, {
    password,
    app_metadata: { oresto: PARENT_SIGNUP_FLAG },
  });

  await db.from('users').update({ auth_id: authUser.id })
    .eq('username', phone)
    .eq('role', 'client');

  let { data, error } = await db.auth.signInWithPassword({ email: authUserEmail, password });

  if (error) {
    // Dernier essai après alignement complet du mot de passe technique.
    const updated = await db.auth.admin.updateUserById(authUser.id, { password });
    if (updated.error) {
      return sendError(res, 500, 'Connexion impossible pour le moment. Réessayez.');
    }
    ({ data, error } = await db.auth.signInWithPassword({ email: authUserEmail, password }));
  }

  if (error || !data?.session) {
    return sendError(res, 500, 'Connexion impossible pour le moment. Réessayez.');
  }

  // Répare définitivement la marque du compte et le lien métier/Auth.
  // Ces informations sont nécessaires au pont de session et ne doivent pas
  // rester une correction "fire and forget" susceptible de gagner la course
  // sur le chargement du profil côté navigateur.
  const authId = data.user?.id;
  if (authId) {
    await db.auth.admin.updateUserById(authId, {
      app_metadata: { oresto: 'parent' },
    }).catch(() => undefined);

    const { error: linkError } = await db
      .from('users')
      .update({ auth_id: authId })
      .eq('username', phone)
      .eq('role', 'client');
    if (linkError) console.error('[login-parent] liaison auth_id :', linkError.message);
  }

  return sendJson(res, 200, {
    ok: true,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  });
}
