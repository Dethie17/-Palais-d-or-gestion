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
  entite_id?: string | null;
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
  const base = {
    username: row.username,
    role: row.role,
    qr_token: row.qr_token,
    ...(row.entite_id ? { entite_id: row.entite_id } : {}),
  };
  const legacyPassword = legacyPasswordHash(password);
  const attempts = [
    // 1) Schéma cible : identité portée par Supabase Auth, pas de `password`.
    { ...base, auth_id: row.auth_id },
    // 2) Schéma hybride : `auth_id` présent, mais `password` encore NOT NULL.
    { ...base, auth_id: row.auth_id, password: legacyPassword },
    // 3) Schéma actuel : pas d'`auth_id`, `password` obligatoire.
    { ...base, password: legacyPassword },
    // 4) Dernier recours : ni `auth_id` ni `password`.
    base,
  ];

  let err: DbError | null = null;
  for (const attempt of attempts) {
    const res = await db.from('users').insert(attempt);
    err = (res.error as DbError | null) ?? null;
    if (!err) return null;
    if (isFatal(err)) return err;
    const retryable = columnMissing(err, 'auth_id')
      || columnMissing(err, 'password')
      || isPasswordNotNull(err);
    if (!retryable) return err;
  }

  return err;
}
