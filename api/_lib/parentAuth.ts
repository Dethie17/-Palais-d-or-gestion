/**
 * Accès parent SANS mot de passe : le numéro de téléphone est l'identifiant.
 *
 * Supabase Auth exige toujours un mot de passe technique. Pour ne pas le
 * demander au parent, il est DÉRIVÉ du numéro avec un secret serveur :
 *  - la DAF crée le compte (create-parent) → mot de passe dérivé, jamais affiché ;
 *  - le parent se connecte avec son seul numéro (login-parent) → le serveur
 *    recalcule le même mot de passe et ouvre la session.
 *
 * Rien n'est stocké en clair. Changer de numéro = créer un nouveau compte.
 */

import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Secret de dérivation : variable dédiée, sinon clé de service (déjà secrète). */
export function parentAuthSecret(env: NodeJS.ProcessEnv = process.env): string {
  return (
    (env.PARENT_AUTH_SECRET ?? '').trim() ||
    (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim() ||
    'oresto-parent-dev'
  );
}

/** Mot de passe technique stable pour un numéro donné (jamais communiqué). */
export function parentPassword(secret: string, phone: string): string {
  return createHmac('sha256', secret)
    .update(`oresto-parent:${phone}`)
    .digest('base64url')
    .slice(0, 32);
}

/** Normalise un numéro sénégalais : 9 chiffres commençant par 6 ou 7. */
export function normalizeSnPhone(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  let digits = String(value).replace(/[^0-9]/g, '');
  if (digits.startsWith('00221') && digits.length === 14) digits = digits.slice(5);
  if (digits.startsWith('221') && digits.length === 12) digits = digits.slice(3);
  return /^[67]\d{8}$/.test(digits) ? digits : '';
}

/** Adresse Auth d'un identifiant (même schéma que le navigateur). */
export function authEmailForUser(username: string, env: NodeJS.ProcessEnv = process.env): string {
  const domain = (env.AUTH_EMAIL_DOMAIN ?? env.VITE_AUTH_EMAIL_DOMAIN ?? '').trim().toLowerCase() || 'oresto-sn.com';
  return `${username.trim().toLowerCase()}@${domain}`;
}

/** Retrouve l'utilisateur Auth par email (pagination bornée à 10 000 comptes). */
export async function findAuthUserByEmail(
  db: SupabaseClient,
  email: string,
): Promise<{ id: string } | null> {
  const wanted = email.trim().toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) return null;
    const found = (data.users as Array<{ id: string; email?: string | null }>).find(
      (u) => u.email?.trim().toLowerCase() === wanted,
    );
    if (found) return { id: found.id };
    if (data.users.length < 1000) return null;
  }
  return null;
}
