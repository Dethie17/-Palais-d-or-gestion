/**
 * Normalisation des identifiants côté serveur.
 *
 * MÊME ALGORITHME QUE src/lib/authSecurity.ts — garder les deux
 * synchronisés (un nom doit être accepté à l'inscription en ligne comme à
 * la création depuis Paramètres → Comptes).
 */

/** Nom d'utilisateur : 3–24 caractères, lettres/chiffres/point/underscore/tiret. */
export function isValidUsername(name: string): boolean {
  return /^[a-z0-9._-]{3,24}$/.test(name);
}

/**
 * « Mamadou », « Awa Diallo », « Cissé » → mamadou, awa.diallo, cisse.
 * Accents retirés, minuscules, espaces → points, borné à 24 caractères.
 */
export function normalizeUsername(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/\.{2,}/g, '.')
    .slice(0, 24);
}

/** Domaine des adresses Auth internes (`<nom>@<domaine>`). */
export function authEmailDomain(env: NodeJS.ProcessEnv = process.env): string {
  return (env.AUTH_EMAIL_DOMAIN ?? env.VITE_AUTH_EMAIL_DOMAIN ?? '').trim().toLowerCase() || 'oresto-sn.com';
}

/**
 * Retrouve le nom d'utilisateur depuis une adresse Auth interne, ou null.
 * Sert de pont d'identification tant que la colonne `auth_id` n'existe pas.
 */
export function usernameFromAuthEmail(
  email: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const suffix = `@${authEmailDomain(env)}`;
  const clean = (email ?? '').trim().toLowerCase();
  if (!clean.endsWith(suffix)) return null;
  const name = clean.slice(0, -suffix.length);
  return name || null;
}

/**
 * Marqueur posé sur les comptes créés par NOTRE endpoint d'inscription parent.
 * C'est lui qui autorise le pont d'identification par email : un compte Auth
 * créé autrement (dashboard, signup Supabase direct) ne peut donc PAS se
 * faire passer pour une fiche existante.
 */
export const PARENT_SIGNUP_FLAG = 'parent';

/**
 * Même marqueur pour les comptes de PERSONNEL créés par /api/auth/login-staff.
 *
 * `app_metadata` n'est modifiable que par la clé de service : un compte
 * inscribed en direct ne peut donc pas s'attribuer ce drapeau. C'est ce qui
 * rend le pont d'identification par adresse sûr, même avant l'exécution de
 * la migration qui ajoute la colonne `auth_id`.
 */
export const STAFF_SIGNUP_FLAG = 'staff';

/**
 * Le compte a-t-il été créé par NOTRE application ?
 *
 * Vrai si l'un de nos marqueurs est présent. Un compte Auth forgé à la main
 * ne peut donc pas hériter du profil d'un autre.
 */
export function isManagedAccount(
  appMetadata: Record<string, unknown> | null | undefined,
): boolean {
  const flag = appMetadata?.oresto;
  return flag === PARENT_SIGNUP_FLAG || flag === STAFF_SIGNUP_FLAG;
}

