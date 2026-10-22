/**
 * Insertion d'une fiche métier `users`, adaptée au schéma réel du projet.
 *
 * Le projet a deux états possibles de la table `users` selon la migration
 * exécutée :
 *
 *  1. Schéma CIBLE (supabase-security.sql exécuté) : colonne `auth_id`
 *     (lien vers Supabase Auth), colonne `password` supprimée.
 *  2. Schéma ACTUEL (migration pas encore faite) : pas de `auth_id`, mais une
 *     colonne `password` NOT NULL qui contient l'empreinte historique
 *     `sha256-<SHA-256("o-resto$" + mot de passe)>`.
 *
 * On ne peut pas savoir à l'avance lequel est en face. On tente donc le
 * schéma cible d'abord ; s'il échoue UNIQUEMENT parce qu'une colonne manque,
 * on réessaie avec l'autre schéma. Les vraies erreurs (doublon, rôle refusé)
 * ne sont jamais masquées : elles remontent telles quelles.
 *
 * L'empreinte legacy n'est écrite QUE si la colonne existe : elle évite de
 * laisser un parent incapable de se connecter tant que la migration n'est pas
 * faite. Le mot de passe en clair n'est jamais stocké.
 */

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ProfileRow {
  username: string;
  role: string;
  auth_id: string;
  qr_token: string;
}

export interface DbError {
  code?: string;
  message?: string;
  details?: string;
}

/** Empreinte historique, identique à src/lib/password.ts (transition). */
export function legacyPasswordHash(password: string): string {
  return `sha256-${createHash('sha256').update(`o-resto$${password}`).digest('hex')}`;
}

function columnMissing(error: DbError | null, column: string): boolean {
  if (!error) return false;
  const blob = `${error.code ?? ''} ${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
  return (error.code === '42703' || error.code === 'PGRST204') && blob.includes(column.toLowerCase());
}

function isPasswordNotNull(error: DbError | null): boolean {
  if (!error) return false;
  const blob = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
  return error.code === '23502' && blob.includes('password');
}

/** Erreur qu'aucun repli de schéma ne peut corriger : on s'arrête. */
function isFatal(error: DbError | null): boolean {
  if (!error) return false;
  return error.code === '23505' || error.code === '23514';
}

/**
 * Insère la fiche et renvoie l'erreur finale (ou null en cas de succès).
 * Le mot de passe sert uniquement à produire l'empreinte legacy de secours.
 */
export async function insertUserProfile(
  db: SupabaseClient,
  row: ProfileRow,
  password: string,
): Promise<DbError | null> {
  // 1) Schéma cible : identité portée par Supabase Auth, pas de `password`.
  const target = {
    username: row.username,
    role: row.role,
    auth_id: row.auth_id,
    qr_token: row.qr_token,
  };
  let res = await db.from('users').insert(target);
  let err = (res.error as DbError | null) ?? null;
  if (!err) return null;
  if (isFatal(err)) return err;

  // 2) Schéma actuel : pas d'`auth_id`, `password` obligatoire → on écrit
  //    l'empreinte legacy pour que la connexion de transition marche.
  if (columnMissing(err, 'auth_id') || isPasswordNotNull(err)) {
    const withLegacyPassword = {
      username: row.username,
      role: row.role,
      qr_token: row.qr_token,
      password: legacyPasswordHash(password),
    };
    res = await db.from('users').insert(withLegacyPassword);
    err = (res.error as DbError | null) ?? null;
    if (!err) return null;
    if (isFatal(err)) return err;

    // 3) Dernier recours : ni `auth_id` ni `password` (schéma hybride) — on
    //    n'insère que l'essentiel.
    if (columnMissing(err, 'password')) {
      res = await db.from('users').insert({
        username: row.username,
        role: row.role,
        qr_token: row.qr_token,
      });
      err = (res.error as DbError | null) ?? null;
      if (!err) return null;
    }
  }

  return err;
}
