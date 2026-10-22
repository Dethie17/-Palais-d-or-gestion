/**
 * POST /api/auth/delete-user — suppression DÉFINITIVE d'un compte.
 *
 * Qui peut supprimer quoi :
 *   - `admin` (DAF)          : tout compte SAUF les comptes `admin` (une DAF
 *       se gère dans le panneau Supabase — supprimer son pair en un clic
 *       invite l'erreur) ;
 *   - `personnel` (superviseur cantine) et `gestionnaire` : uniquement les
 *       comptes PARENT (`client`), qui portent les enfants, les cartitudes,
 *       les réclamations et le kiosque.
 *
 * Ce que la suppression retire — dans l'ordre des clés étrangères, pour ne
 * jamais casser une référence :
 *   réclamations + messages, commandes kiosque, portefeuilles et mouvements de
 *   carte des enfants, puis les enfants (les lignes `subscriptions`/
 *   `validations` survivent avec `child_id NULL` : l'Historique reste lisible) ;
 *   enfin le profil métier `users`, et le compte d'authentification Supabase.
 *
 * Ce qu'elle NE retire PAS : les règlements `oresto_payments`. Ils sont la
 * comptabilité de la cantine — détruire un compte n'efface pas l'argent que
 * la famille a payé.
 *
 * Le service key contourne le RLS : les règles d'accès de Supabase ne
 * freinent pas cette suppression administrative.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { adminClient, SupabaseAdminConfigError } from '../_lib/supabaseAdmin.js';
import { requireRole, STAFF_OR_ADMIN } from '../_lib/session.js';
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

interface DeleteCounters {
  reclamations?: number;
  messages?: number;
  kioskOrders?: number;
  walletTransactions?: number;
  wallets?: number;
  children?: number;
  parentProfiles?: number;
}

/** Supprime et compte : null = table absente / colonne absente (pas grave). */
async function deleteCounted(
  db: ReturnType<typeof adminClient>,
  table: string,
  where: { column: string; values: string[] | string },
): Promise<{ count: number | null; error?: string }> {
  let query = db.from(table).delete();
  if (Array.isArray(where.values)) {
    if (where.values.length === 0) return { count: 0 };
    query = query.in(where.column, where.values);
  } else {
    query = query.eq(where.column, where.values);
  }
  const { count, error } = await query;
  if (error) {
    // Pas de table (42P01), pas de colonne (42703) : ça doit continuer.
    const silent = error.code === '42P01' || error.code === '42703' || error.code === 'PGRST204';
    if (!silent) return { count: null, error: error.message };
    return { count: null };
  }
  return { count: count ?? 0 };
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') return handlePreflight(req, res);
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  const caller = await requireRole(req, res, STAFF_OR_ADMIN);
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

  // Se retirer soi-même laisserait l'équipe sans ce compte-le.
  if (username === caller.username) {
    return sendError(res, 400, 'Vous ne pouvez pas supprimer votre propre compte.');
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

  const { data: profile, error: lookupError } = await db
    .from('users')
    .select('role, auth_id')
    .eq('username', username)
    .maybeSingle();

  if (lookupError) {
    return sendError(res, 500, 'Suppression impossible.');
  }
  // Déjà absent : sortir en 200 évite qu'un double-clic n'apparaisse en erreur.
  if (!profile) {
    return sendJson(res, 200, { ok: true, username, alreadyAbsent: true });
  }

  const target = profile as { role?: string | null; auth_id?: string | null };

  // Un compte DAF ne se supprime pas depuis l'application — trop facile de
  // verrouiller la cantine par mégarde. La DAF se gère dans Supabase.
  if (target.role === 'admin') {
    return sendError(res, 403, 'Un compte DAF se supprime depuis le panneau Supabase.');
  }
  // Superviseur et caissier suppriment des PARENTS — pas des collègues.
  if (caller.role !== 'admin' && target.role !== 'client') {
    return sendError(res, 403, 'Seuls les comptes parents peuvent être supprimés ici.');
  }

  // Lecture des enfants AVANT retrait : leurs portefeuilles et mouvements
  // suivent leur fiche (ON DELETE CASCADE), il faut donc chercher tôt pour
  // purger les tables où aucune cascade n'est garantie.
  let childIds: string[] = [];
  if (target.role === 'client') {
    const kids = await db.from('children').select('id').eq('parent_username', username);
    if (!kids.error && kids.data) {
      childIds = kids.data.map((k) => String(k.id));
    }
  }

  const counters: DeleteCounters = {};

  // 1) Réclamations : d'abord les messages de l'auteur (cette table ne porte
  //    pas de cascade depuis `users`), puis ses fils.
  const messages = await deleteCounted(db, 'reclamation_messages', {
    column: 'author_username',
    values: username,
  });
  if (messages.error) return sendError(res, 500, `Suppression impossible (messages) : ${messages.error}`);
  counters.messages = messages.count ?? undefined;

  const reclamations = await deleteCounted(db, 'reclamations', {
    column: 'client_username',
    values: username,
  });
  if (reclamations.error) return sendError(res, 500, `Suppression impossible (réclamations) : ${reclamations.error}`);
  counters.reclamations = reclamations.count ?? undefined;

  // 2) Commandes kiosque du parent (le nom de colonne a changé une fois).
  let kiosk = await deleteCounted(db, 'kiosk_orders', {
    column: 'parent_username',
    values: username,
  });
  if (kiosk.error) {
    kiosk = await deleteCounted(db, 'kiosk_orders', { column: 'client_username', values: username });
  }
  if (kiosk.error) return sendError(res, 500, `Suppression impossible (kiosque) : ${kiosk.error}`);
  counters.kioskOrders = kiosk.count ?? undefined;

  // 3) Données enfants — uniquement pour un compte parent.
  if (childIds.length > 0) {
    const txs = await deleteCounted(db, 'wallet_transactions', {
      column: 'child_id',
      values: childIds,
    });
    if (txs.error) return sendError(res, 500, `Suppression impossible (mouvements carte) : ${txs.error}`);
    counters.walletTransactions = txs.count ?? undefined;

    const wallets = await deleteCounted(db, 'wallets', {
      column: 'child_id',
      values: childIds,
    });
    if (wallets.error) return sendError(res, 500, `Suppression impossible (cartes) : ${wallets.error}`);
    counters.wallets = wallets.count ?? undefined;

    // Sans cascade garantie en base (scripts passés en ordre variable), on
    // détache d'abord : abonnements et validations gardent leur ligne
    // (historique lisible) avec child_id vide.
    await db.from('subscriptions').update({ child_id: null }).in('child_id', childIds);
    await db.from('validations').update({ child_id: null }).in('child_id', childIds);

    const kids = await deleteCounted(db, 'children', { column: 'id', values: childIds });
    if (kids.error) return sendError(res, 500, `Suppression impossible (enfants) : ${kids.error}`);
    counters.children = kids.count ?? undefined;

    const profiles = await deleteCounted(db, 'parent_profiles', {
      column: 'parent_username',
      values: username,
    });
    counters.parentProfiles = profiles.count ?? undefined; // best effort
  }

  // 4) Le compte d'authentification d'abord : c'est lui qui porte l'identité.
  //    Un profil sans compte Auth serait un orphelin.
  //    NB : si un ancien profil sans `auth_id` n'a jamais eu de compte Auth,
  //    cette étape est simplement sautée.
  if (target.auth_id) {
    const { error } = await db.auth.admin.deleteUser(target.auth_id);
    if (error) {
      return sendError(res, 500, 'Suppression du compte d’authentification impossible.');
    }
  }

  // 5) La fiche métier.
  const { error: profileDeleteError } = await db.from('users').delete().eq('username', username);
  if (profileDeleteError) {
    return sendError(res, 500, 'Compte d’authentification supprimé, fiche métier non purgée.');
  }

  return sendJson(res, 200, { ok: true, username, deleted: counters });
}
