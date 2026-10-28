/**
 * POST /api/auth/create-parent — création (ou activation) de comptes PARENT.
 *
 * Réservé à la DAF. Un parent N'A PAS de mot de passe : son numéro de
 * téléphone est son identifiant. Le mot de passe technique exigé par Supabase
 * Auth est dérivé du numéro côté serveur (voir _lib/parentAuth.ts) et n'est
 * jamais affiché ni transmis.
 *
 * Corps :
 *   { "parents": [{ "firstName": "Awa", "lastName": "Diallo", "phone": "771234567" }] }
 *   (ou un seul parent : { firstName, lastName, phone })
 *
 * Réponse : { ok, created, activated, duplicates, errors, identifiers }
 *  - created     : nouveau compte Auth + fiche
 *  - activated   : fiche existante (import élèves) à qui on ouvre l'accès
 *  - duplicates  : compte déjà actif
 *  - errors      : numéro invalide / échec Supabase
 *  - identifiers : pour chaque parent traité, son IDENTIFIANT de connexion
 *                   (le numéro) — c'est ce que la DAF communique au parent.
 *
 * ⚠ RÉCONCILIATION : si une fiche parent existe sous un ANCIEN identifiant
 * (« awa », « parent1 ») mais porte le même numéro, on ne crée pas une
 * seconde identité : on rattache ses enfants et ses abonnements au numéro,
 * puis on supprime la fiche héritée. Sans cela, le parent verrait un espace
 * vide (ses enfants resteraient sur l'ancien identifiant).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient } from '../_lib/supabaseAdmin.js';
import { personalQrToken } from '../_lib/qrToken.js';
import { insertUserProfile } from '../_lib/profile.js';
import { requireRole, ADMIN_ONLY } from '../_lib/session.js';
import { PARENT_SIGNUP_FLAG } from '../_lib/username.js';
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

const MAX_PARENTS = 200;

interface ParentInput {
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
}

interface CreateParentBody {
  parents?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
}

interface ResultRow {
  phone: string;
  name: string;
  reason?: string;
}

/** Adresses Auth (pagination) — pour repérer un compte déjà créé. */
async function authEmails(db: SupabaseClient): Promise<Set<string>> {
  const emails = new Set<string>();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    data.users.forEach((u) => {
      if (u.email) emails.add(u.email.trim().toLowerCase());
    });
    if (data.users.length < 1000) break;
  }
  return emails;
}

/**
 * Rattache une fiche héritée (ancien identifiant) au numéro du parent.
 *
 * Déplace enfants, abonnements, paiements, validations, réclamations et
 * commandes au nom du numéro, puis supprime l'ancienne fiche métier (profil
 * et compte) pour que le numéro soit la SEULE identité du parent.
 * Silencieux : un échec ici ne doit pas faire échouer la création du compte.
 */
async function reconcileLegacyProfile(
  db: SupabaseClient,
  legacyUsername: string,
  phone: string,
): Promise<void> {
  const moves: PromiseLike<unknown>[] = [
    db.from('children').update({ parent_username: phone }).eq('parent_username', legacyUsername),
    db.from('subscriptions').update({ client_username: phone }).eq('client_username', legacyUsername),
    db.from('oresto_payments').update({ client_username: phone }).eq('client_username', legacyUsername),
    db.from('validations').update({ client_username: phone }).eq('client_username', legacyUsername),
    db.from('reclamations').update({ client_username: phone }).eq('client_username', legacyUsername),
    db.from('kiosk_orders').update({ parent_username: phone }).eq('parent_username', legacyUsername),
    db.from('reclamation_messages').update({ author_username: phone }).eq('author_username', legacyUsername),
  ];
  await Promise.allSettled(moves);

  // Compte de connexion hérité : on ne supprime que s'il s'agit bien d'un
  // parent (jamais un compte de personnel portant par erreur ce nom).
  const { data: legacyUser } = await db
    .from('users')
    .select('username, role')
    .eq('username', legacyUsername)
    .maybeSingle();
  const role = (legacyUser as { role?: string } | null)?.role;
  if (legacyUser && (role === 'client' || role === undefined)) {
    const legacyAuth = await findAuthUserByEmail(db, authEmailForUser(legacyUsername));
    if (legacyAuth) await db.auth.admin.deleteUser(legacyAuth.id).catch(() => undefined);
    await db.from('users').delete().eq('username', legacyUsername);
  }

  // La fiche d'identité héritée est remplacée par celle du numéro.
  await db.from('parent_profiles').delete().eq('parent_username', legacyUsername);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return handlePreflight(req, res);
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  const caller = await requireRole(req, res, ADMIN_ONLY);
  if (!caller) return;

  let body: CreateParentBody;
  try {
    body = await readJson<CreateParentBody>(req);
  } catch {
    return sendError(res, 400, 'Corps JSON invalide.');
  }

  const raw: ParentInput[] = Array.isArray(body.parents)
    ? (body.parents as ParentInput[]).slice(0, MAX_PARENTS)
    : [{ firstName: body.firstName, lastName: body.lastName, phone: body.phone }];

  if (raw.length === 0) return sendError(res, 400, 'Aucun parent à créer.');

  const db = adminClient();
  const secret = parentAuthSecret();

  const created: ResultRow[] = [];
  const activated: ResultRow[] = [];
  const duplicates: ResultRow[] = [];
  const errors: ResultRow[] = [];
  const identifiers: { phone: string; identifier: string; name: string; status: string }[] = [];

  const clean = raw.map((p) => {
    const firstName = typeof p.firstName === 'string' ? p.firstName.trim().slice(0, 60) : '';
    const lastName = typeof p.lastName === 'string' ? p.lastName.trim().slice(0, 60) : '';
    const phone = normalizeSnPhone(p.phone);
    return { firstName, lastName, phone };
  });

  // Rôles des profils existants (pour ne jamais confondre un compte personnel
  // portant un numéro avec un compte parent).
  const validPhones = [...new Set(clean.filter((p) => p.phone).map((p) => p.phone))];
  const existingProfiles = new Map<string, string>();
  if (validPhones.length > 0) {
    const { data } = await db.from('users').select('username, role').in('username', validPhones);
    (data ?? []).forEach((row: { username?: string; role?: string }) => {
      if (row.username) existingProfiles.set(row.username, row.role ?? '');
    });
  }
  const knownEmails = await authEmails(db);

  for (const parent of clean) {
    const name = `${parent.firstName} ${parent.lastName}`.trim() || parent.phone;
    if (!parent.phone) {
      errors.push({ phone: String(parent.phone ?? ''), name, reason: 'Numéro invalide (9 chiffres, ex 77 123 45 67).' });
      continue;
    }
    if (!parent.firstName || !parent.lastName) {
      errors.push({ phone: parent.phone, name, reason: 'Prénom et nom requis.' });
      continue;
    }
    const username = parent.phone;
    const email = authEmailForUser(username);
    const existingRole = existingProfiles.get(username);
    let hasProfile = existingRole !== undefined;
    let hasAuth = knownEmails.has(email);

    if (hasProfile && existingRole !== 'client') {
      errors.push({ phone: username, name, reason: `Identifiant déjà utilisé par un compte « ${existingRole} ».` });
      continue;
    }
    if (hasProfile && hasAuth) {
      const authUser = await findAuthUserByEmail(db, email);
      if (authUser) {
        const password = parentPassword(secret, username);
        await db.auth.admin.updateUserById(authUser.id, {
          password,
          app_metadata: { oresto: PARENT_SIGNUP_FLAG },
        }).catch(() => undefined);
        await db.from('users').update({ auth_id: authUser.id }).eq('username', username).eq('role', 'client');
      }
      duplicates.push({ phone: username, name, reason: 'Compte déjà actif.' });
      identifiers.push({ phone: username, identifier: username, name, status: 'doublon' });
      continue;
    }

    // Réconciliation : une fiche héritée porte peut-être déjà ce numéro.
    // Ses données (enfants, abonnements…) passent sous le numéro, et son
    // ancien compte disparaît : le parent garde UNE seule identité.
    const { data: legacyRows } = await db
      .from('parent_profiles')
      .select('parent_username')
      .eq('phone', username)
      .neq('parent_username', username)
      .limit(5);
    let reconciled = false;
    for (const legacy of legacyRows ?? []) {
      const legacyUsername = legacy?.parent_username;
      if (legacyUsername) {
        await reconcileLegacyProfile(db, legacyUsername, username);
        reconciled = true;
      }
    }

    // Une fiche héritée a été rapatriée : le parent EXISTE déjà, on ne fait
    // qu'ouvrir son accès. Sans ce test, il serait compté comme « créé ».
    if (reconciled) {
      const { data: merged } = await db
        .from('users')
        .select('username')
        .eq('username', username)
        .maybeSingle();
      if (merged?.username) hasProfile = true;
      hasAuth = hasAuth || knownEmails.has(email);
    }

    const password = parentPassword(secret, username);
    let authId: string | null = null;

    if (!hasAuth) {
      const { data: auth, error: authError } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        // Marqueur « créé par O RESTO » : il autorise le pont
        // d'identification (email → fiche) tant que la colonne `auth_id`
        // n'existe pas. `app_metadata` n'est modifiable que par la clé de
        // service : un compte forgé ailleurs ne peut donc pas s'en attribuer.
        app_metadata: { oresto: PARENT_SIGNUP_FLAG },
      });
      if (authError || !auth?.user) {
        const blob = `${authError?.code ?? ''} ${authError?.message ?? ''}`;
        if (/already|exists|registered|duplicate|23505/i.test(blob)) {
          duplicates.push({ phone: username, name, reason: 'Compte déjà actif.' });
          identifiers.push({ phone: username, identifier: username, name, status: 'doublon' });
        } else {
          errors.push({ phone: username, name, reason: 'Création du compte impossible.' });
        }
        continue;
      }
      authId = auth.user.id;
      hasAuth = true;
    } else {
      // Compte Auth sans fiche métier (création interrompue) : on rattache.
      const authUser = await findAuthUserByEmail(db, email);
      if (!authUser) {
        errors.push({ phone: username, name, reason: 'Compte technique introuvable.' });
        continue;
      }
      authId = authUser.id;
    }

    // On marque le compte comme « créé par O RESTO » même s'il existait
    // déjà : sans ce marqueur, la fiche ne pourrait pas être retrouvée
    // depuis la session (schéma non migré).
    if (authId) {
      await db.auth.admin
        .updateUserById(authId, { app_metadata: { oresto: PARENT_SIGNUP_FLAG } })
        .catch(() => undefined);
    }

    if (!hasProfile) {
      const profileError = await insertUserProfile(
        db,
        {
          username,
          role: 'client',
          auth_id: authId as string,
          qr_token: personalQrToken(username),
        },
        password,
      );
      if (profileError) {
        await db.auth.admin.deleteUser(authId!).catch(() => undefined);
        errors.push({ phone: username, name, reason: 'Fiche métier non enregistrée.' });
        continue;
      }
    } else if (authId) {
      // Fiche déjà présente : on l'aligne sur son identité Auth. Sans effet
      // (erreur ignorée) tant que la colonne `auth_id` n'existe pas.
      await db.from('users').update({ auth_id: authId }).eq('username', username);
    }

    // Fiche d'identité (nom, téléphone) — non bloquante.
    await db
      .from('parent_profiles')
      .upsert(
        {
          parent_username: username,
          first_name: parent.firstName,
          last_name: parent.lastName,
          phone: parent.phone,
        },
        { onConflict: 'parent_username' },
      )
      .then(() => undefined, () => undefined);

    // Un parent réconcilié (fiche héritée rapatriée sous son numéro) EXISTE
    // déjà : on lui ouvre l'accès, on ne le compte pas comme une création.
    if (hasProfile || reconciled) {
      activated.push({ phone: username, name });
      identifiers.push({ phone: username, identifier: username, name, status: 'activé' });
    } else {
      created.push({ phone: username, name });
      identifiers.push({ phone: username, identifier: username, name, status: 'créé' });
    }
  }

  return sendJson(res, 201, { ok: true, created, activated, duplicates, errors, identifiers });
}
