/**
 * Garde de session des fonctions serveur.
 *
 * Une fonction Vercel est une URL publique : sans contrôle, n'importe qui
 * peut l'appeler. `/api/sycapay/initiate` acceptait jusqu'ici une demande
 * de paiement (montant, numéro) sans rien vérifier — il suffisait de
 * connaître l'URL.
 *
 * On exige donc, sur chaque route qui manipule de l'argent ou des comptes :
 *
 *   1. un jeton d'accès Supabase valide, transmis par le navigateur ;
 *   2. que ce jeton soit rattaché à un profil de la table `users` ;
 *   3. que le rôle convienne à l'opération demandée.
 *
 * Le jeton est validé en le confrontant au serveur Auth — pas en lui faisant
 * confiance parce qu'il est bien formé : c'est la seule façon de savoir que
 * personne ne l'a fabriqué.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { adminClient } from './supabaseAdmin.js';
import { usernameFromAuthEmail, isManagedAccount } from './username.js';

export type AppRole = 'client' | 'personnel' | 'gestionnaire' | 'admin';

export interface Caller {
  userId: string;
  username: string;
  role: AppRole;
  establishmentId: string | null;
}

/** Rôles autorisés à administrer les comptes et la comptabilité. */
export const ADMIN_ONLY: AppRole[] = ['admin'];
/** Rôles autorisés à valider un paiement ou servir une commande. */
export const STAFF_OR_ADMIN: AppRole[] = ['admin', 'personnel', 'gestionnaire'];

export function unauthorized(res: ServerResponse, message = 'Authentification requise.'): void {
  res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'WWW-Authenticate': 'Bearer' });
  res.end(JSON.stringify({ ok: false, error: message }));
}

export function forbidden(res: ServerResponse, message = 'Droits insuffisants pour cette opération.'): void {
  res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: false, error: message }));
}

function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

/**
 * Résout l'appelant, ou null si la requête n'est pas authentifiée.
 *
 * Le jeton est échangé contre un profil par le serveur Auth, puis le profil
 * est relu dans `users` : c'est cette lecture qui fait foi. Un jeton valide
 * mais sans profil (compte supprimé, rôle révoqué) ne donne rien.
 */
export async function resolveCaller(req: IncomingMessage): Promise<Caller | null> {
  const token = bearerToken(req);
  if (!token) return null;

  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
  // Sans clé, il n'y a rien contre quoi valider le jeton : on ne peut rien
  // accepter, pas « faire confiance » à un jeton bien formé.
  const anonKey = (process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  if (!url || !anonKey) return null;

  // Client jetable, sans session persistée : il ne sert qu'à valider le jeton.
  const verifier = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await verifier.auth.getUser(token);
  if (error || !data.user) return null;

  const db = adminClient();

  // On ne demande PAS `auth_id` : sur le schéma d'avant migration, le
  // sélectionner fait échouer la requête (colonne absente), y compris le repli
  // par email. Le filtrage par `auth_id` ci-dessous reste, lui, dans le WHERE.
  const PROFILE_COLS = 'username, role, establishment_id';

  // 1) Voie normale : lien direct identité ↔ Auth (colonne `auth_id`).
  const byAuthId = await db
    .from('users')
    .select(PROFILE_COLS)
    .eq('auth_id', data.user.id)
    .maybeSingle();

  let row = (byAuthId.error ? null : byAuthId.data) as
    | { username?: unknown; role?: unknown; establishment_id?: string | null }
    | null;

  // 2) Pont de transition : tant que la migration (supabase-security.sql) n'a
  //    pas ajouté `auth_id`, on identifie le compte par l'adresse Auth.
  //    On ne l'autorise QUE pour les comptes que NOTRE serveur a créés
  //    (marqueur app_metadata.oresto) : un compte Auth forgé ailleurs ne
  //    peut donc pas prendre la place d'une fiche existante.
  if (!row && isManagedAccount(data.user.app_metadata)) {
    const username = usernameFromAuthEmail(data.user.email);
    if (username) {
      const byName = await db
        .from('users')
        .select(PROFILE_COLS)
        .eq('username', username)
        .maybeSingle();
      if (!byName.error) row = byName.data as typeof row;
    }
  }

  if (!row) return null;

  if (typeof row.username !== 'string' || typeof row.role !== 'string') return null;

  return {
    userId: data.user.id,
    username: row.username.trim().toLowerCase(),
    role: row.role as AppRole,
    establishmentId: row.establishment_id ?? null,
  };
}

/**
 * La référence appartient-elle à cet appelant ?
 *
 * Le personnel suit toutes les transactions. Un parent ne voit que les
 * siennes — sinon la route de suivi resterait un oracle : il suffirait de
 * deviner une référence pour régler la commande d'autrui.
 *
 * On interroge les deux tables qui portent une référence : un règlement
 * d'abonnement et un rechargement de carte ne suivent pas le même chemin.
 */
export async function referenceBelongsTo(caller: Caller, reference: string): Promise<boolean> {
  if (caller.role !== 'client') return true;

  const db = adminClient();

  const payment = await db
    .from('oresto_payments')
    .select('id')
    .eq('reference', reference)
    .eq('client_username', caller.username)
    .maybeSingle();
  if (!payment.error && payment.data) return true;

  const topup = await db
    .from('wallet_transactions')
    .select('id')
    .eq('reference', reference)
    .maybeSingle();
  if (topup.error || !topup.data) return false;

  // Un rechargement n'est rattaché à personne en propre : on remonte jusqu'à
  // l'enfant, puis jusqu'à son parent.
  const tx = topup.data as { id?: string };
  const childId = await (async (): Promise<string | null> => {
    const detail = await db
      .from('wallet_transactions')
      .select('child_id')
      .eq('id', tx.id ?? '')
      .maybeSingle();
    const row = detail.data as { child_id?: string | null } | null;
    return row?.child_id ?? null;
  })();
  if (!childId) return false;

  const child = await db
    .from('children')
    .select('parent_username')
    .eq('id', childId)
    .maybeSingle();
  const owner = child.data as { parent_username?: string | null } | null;
  return (owner?.parent_username ?? '').toLowerCase() === caller.username;
}

/**
 * Montant attendu d'une commande, quand elle appartient à ce parent.
 *
 * Un parent ne déclenche un débit que sur SES propres commandes : un
 * règlement d'abonnement (oresto_payments) ou un rechargement de la carte
 * d'un de ses enfants (wallet_transactions → children). On rend le montant
 * enregistré pour que l'appelant vérifie que le client n'a pas modifié le
 * prix dans son navigateur — payer 100 FCFA un abonnement à 27 000 FCFA
 * ne doit pas produire de lien de paiement.
 *
 * Renvoie null quand la référence n'appartient pas à ce parent (ou en cas
 * de panne de base : on refuse plutôt que de laisser passer aveuglément).
 */
export async function expectedAmountFor(username: string, reference: string): Promise<number | null> {
  const who = username.trim().toLowerCase();
  if (!who || !reference) return null;
  let db;
  try {
    db = adminClient();
  } catch {
    return null;
  }

  try {
    const payment = await db
      .from('oresto_payments')
      .select('amount, client_username')
      .eq('reference', reference)
      .maybeSingle();
    const row = payment.data as { amount?: number | string; client_username?: string | null } | null;
    if (!payment.error && row && (row.client_username ?? '').toLowerCase() === who) {
      const amount = Number(row.amount);
      return Number.isFinite(amount) ? amount : null;
    }
  } catch {
    return null;
  }

  try {
    const topup = await db
      .from('wallet_transactions')
      .select('id, amount, child_id')
      .eq('reference', reference)
      .maybeSingle();
    const tx = topup.data as { id?: string; amount?: number | string; child_id?: string | null } | null;
    if (topup.error || !tx?.child_id) return null;
    const child = await db
      .from('children')
      .select('parent_username')
      .eq('id', tx.child_id)
      .maybeSingle();
    const owner = child.data as { parent_username?: string | null } | null;
    if (child.error || (owner?.parent_username ?? '').toLowerCase() !== who) return null;
    const amount = Number(tx.amount);
    return Number.isFinite(amount) ? amount : null;
  } catch {
    return null;
  }
}

/**
 * Garde combinée : authentifie, puis vérifie le rôle.
 * Renvoie l'appelant, ou a déjà répondu à la requête (renvoie alors null).
 */
export async function requireRole(
  req: IncomingMessage,
  res: ServerResponse,
  allowed: AppRole[],
): Promise<Caller | null> {
  let caller: Caller | null = null;
  try {
    caller = await resolveCaller(req);
  } catch {
    caller = null;
  }

  if (!caller) {
    unauthorized(res);
    return null;
  }
  if (!allowed.includes(caller.role)) {
    forbidden(res);
    return null;
  }
  return caller;
}
