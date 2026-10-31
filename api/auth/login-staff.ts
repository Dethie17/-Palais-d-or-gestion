/**
 * POST /api/auth/login-staff — connexion du PERSONNEL et ouverture d'une
 * VRAIE session serveur.
 *
 * Pourquoi cette route existe
 * ---------------------------
 * Tant qu'un compte n'est pas migré vers Supabase Auth, la connexion se
 * faisait « en local » : le mot de passe était comparé dans le navigateur et
 * l'état de session était posé en mémoire. L'utilisateur était connecté —
 * mais SANS session Auth. Conséquence : toutes les routes `/api/*` (création
 * d'un parent, import, gestion des comptes) le repoussaient en 401, parce
 * qu'elles exigent un jeton vérifié par le serveur.
 *
 * Autrement dit : un compte encore sur l'ancien schéma pouvait consulter
 * l'interface, mais aucune des opérations que la Direction doit piloter
 * (ouvrir l'accès d'un parent, importer une liste) ne lui était possible.
 *
 * Cette route referme le parcours : elle vérifie le mot de passe côté
 * serveur, crée le compte Auth s'il manque, le rattache à la fiche métier,
 * puis ouvre une session. Le mot de passe reste CELUI DU PERSONNEL —
 * il n'est jamais remplacé par une valeur dérivée.
 *
 * Corps : { "username": "admin", "password": "…" }
 * Réponse : { ok: true, accessToken, refreshToken, role, username }
 */

import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminClient, passwordAuthClient } from '../_lib/supabaseAdmin.js';
import { authEmailForUser, findAuthUserByEmail } from '../_lib/parentAuth.js';
import { STAFF_SIGNUP_FLAG } from '../_lib/username.js';
import {
  handlePreflight,
  methodNotAllowed,
  readJson,
  sendError,
  sendJson,
} from '../_lib/http.js';

interface LoginBody {
  username?: unknown;
  password?: unknown;
}

const STAFF_ROLES = ['personnel', 'gestionnaire', 'admin'];

/**
 * Empreinte historique : `sha256-` + SHA-256("o-resto$" + mot de passe).
 * On accepte aussi le mot de passe en clair des comptes de la toute première
 * version (déjà ré-hachés au premier usage, mais certains subsistent).
 */
function legacyHash(password: string): string {
  return `sha256-${createHash('sha256').update(`o-resto$${password}`).digest('hex')}`;
}

function passwordMatches(input: string, stored: string | null): boolean {
  if (!stored) return false;
  if (stored === input) return true;
  if (!stored.startsWith('sha256-')) return false;
  try {
    return legacyHash(input) === stored;
  } catch {
    return false;
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return handlePreflight(req, res);
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  let body: LoginBody;
  try {
    body = await readJson<LoginBody>(req);
  } catch {
    return sendError(res, 400, 'Corps JSON invalide.');
  }

  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username || !password) {
    return sendError(res, 400, 'Identifiant et mot de passe requis.');
  }

  let db;
  let authDb;
  try {
    db = adminClient();
    authDb = passwordAuthClient();
  } catch {
    return sendError(res, 503, 'Connexion momentanément indisponible.');
  }

  // `auth_id` n'existe pas sur le schéma historique : on demande la fiche
  // SANS cette colonne (sinon PostgREST renvoie 42703 et on refuserait un
  // mot de passe pourtant correct), puis on tente la liaison à part.
  const { data: profile, error: lookupError } = await db
    .from('users')
    .select('username, role, password')
    .eq('username', username)
    .maybeSingle();

  const row = profile as
    | { username?: string; role?: string; password?: string | null }
    | null;

  if (lookupError || !row?.username) {
    return sendError(res, 401, 'Nom d’utilisateur ou mot de passe incorrect.');
  }
  if (!STAFF_ROLES.includes(row.role ?? '')) {
    return sendError(res, 403, 'Ce compte n’est pas un compte de personnel.');
  }

  // 1) Mot de passe vérifié contre la fiche métier (transition).
  if (!passwordMatches(password, row.password ?? null)) {
    return sendError(res, 401, 'Nom d’utilisateur ou mot de passe incorrect.');
  }

  const email = authEmailForUser(username);

  // 2) Compte Auth : on le crée s'il manque.
  let authId: string | null = null;
  const authLink = await db.from('users').select('auth_id').eq('username', username).maybeSingle();
  if (!authLink.error && authLink.data) {
    authId = (authLink.data as { auth_id?: string | null }).auth_id ?? null;
  }
  if (!authId) {
    const authUser = await findAuthUserByEmail(db, email);
    if (authUser) {
      authId = authUser.id;
    } else {
      const { data: created, error: createError } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        // Marqueur « créé par O RESTO » : il autorise le pont
        // d'identification (email → fiche métier) tant que la colonne
        // `auth_id` n'existe pas en base. `app_metadata` n'est modifiable
        // que par la clé de service.
        app_metadata: { oresto: STAFF_SIGNUP_FLAG },
      });
      if (createError || !created?.user) {
        return sendError(res, 500, 'Ouverture de la session impossible.');
      }
      authId = created.user.id;
    }
    // Rattachement de la fiche métier à l'identité Auth (no-op si la
    // colonne `auth_id` n'existe pas encore : on ignore l'erreur).
    await db.from('users').update({ auth_id: authId }).eq('username', username);
  }

  // 3) Le mot de passe fait foi côté fiche métier : on l'aligne TOUJOURS sur
  //    le compte Auth, qu'il vienne d'être créé ou qu'il préexiste. Sans ça,
  //    un compte Auth créé lors d'une tentative précédente garderait un mot
  //    de passe inconnu et la connexion échouerait.
  const sync = await db.auth.admin.updateUserById(authId, {
    password,
    // Marqueur « créé par O RESTO » : c'est lui qui relie la session à la
    // fiche tant que la colonne `auth_id` n'existe pas.
    app_metadata: { oresto: STAFF_SIGNUP_FLAG },
  });
  if (sync.error) {
    return sendError(res, 500, 'Ouverture de la session impossible.');
  }

  // 4) Session. Client dédié : ne jamais poser la session sur le client admin
  // partagé (le jeton utilisateur remplacerait la clé de service).
  const { data, error } = await authDb.auth.signInWithPassword({ email, password });
  if (error || !data?.session) {
    return sendError(res, 500, 'Connexion impossible pour le moment. Réessayez.');
  }

  return sendJson(res, 200, {
    ok: true,
    username: row.username,
    role: row.role,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  });
}
