/**
 * Adresses des comptes d'authentification.
 *
 * Supabase exige une adresse email par compte, mais nos utilisateurs
 * s'identifient par nom d'utilisateur. On forge donc
 * `<nom>@<domaine du site>`.
 *
 * Le domaine DOIT être un vrai domaine (celui du site) : Supabase refuse
 * les adresses en `.local` avec « email_address_invalid » — avec l'ancien
 * domaine, AUCUNE création de compte parent ne pouvait aboutir. Ces
 * adresses ne reçoivent rien par défaut ; elles permettront un jour le
 * reset de mot de passe par email.
 */
export const AUTH_EMAIL_DOMAIN =
  (import.meta.env.VITE_AUTH_EMAIL_DOMAIN as string | undefined)?.trim().toLowerCase() ||
  'oresto-sn.com';

export function authEmailFor(username: string): string {
  return `${username.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

/** Retrouve le nom d'utilisateur depuis une adresse Auth, ou null. */
export function usernameFromAuthEmail(email: string | null | undefined): string | null {
  const clean = (email ?? '').trim().toLowerCase();
  const suffix = `@${AUTH_EMAIL_DOMAIN}`;
  if (!clean.endsWith(suffix)) return null;
  const name = clean.slice(0, -suffix.length);
  return name || null;
}
