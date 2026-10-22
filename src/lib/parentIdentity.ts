/**
 * IDENTITÉ PARENT — le numéro de téléphone EST l'identifiant.
 *
 * Une seule règle, appliquée partout (DAF, import, espace abonné, API) :
 *
 *     parent_username ≡ numéro de téléphone normalisé (9 chiffres)
 *
 * Pourquoi cette règle : le parent n'a pas de mot de passe. Son accès
 * passe par son seul numéro (voir api/_lib/parentAuth.ts). Si la fiche métier
 * portait un autre identifiant (« awa », « parent1 »…), le compte Auth et la
 * fiche seraient deux clés différentes pour la même personne : l'enfant
 * serait rattaché à une fiche, l'accès à l'autre, et le parent ne pourrait
 * jamais voir ses enfants.
 *
 * Ce module est donc la seule source de vérité de la forme d'un identifiant
 * parent. Aucun autre fichier ne doit normaliser un numéro à la main.
 */

/** Longueur d'un numéro sénégalais national (9 chiffres, 6 ou 7). */
const SN_PHONE_LENGTH = 9;

/**
 * Ne garde que les chiffres et retire l'indicatif pays.
 * « +221 77 123 45 67 » et « 771234567 » donnent le même résultat.
 */
export function normalizeParentPhone(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  let digits = String(value).replace(/\D/g, '');
  if (digits.length === SN_PHONE_LENGTH + 3 && digits.startsWith('221')) {
    digits = digits.slice(3);
  }
  return digits;
}

/** Vrai si le numéro est un identifiant parent recevable (9 chiffres, 6/7). */
export function isValidParentPhone(value: unknown): boolean {
  const digits = normalizeParentPhone(value);
  return /^[67]\d{8}$/.test(digits);
}

/**
 * Identifiant parent dérivé du numéro.
 * @throws si le numéro est invalide — un identifiant parent DOIT être un
 *         numéro, sinon le parent ne pourra jamais se connecter.
 */
export function parentUsernameFromPhone(phone: unknown): string {
  const digits = normalizeParentPhone(phone);
  if (!isValidParentPhone(digits)) {
    throw new Error('Numéro de téléphone invalide : 9 chiffres commençant par 6 ou 7 (ex 77 123 45 67).');
  }
  return digits;
}

/** Comme `parentUsernameFromPhone` mais renvoie null au lieu de lever. */
export function parentUsernameOrNull(phone: unknown): string | null {
  const digits = normalizeParentPhone(phone);
  return isValidParentPhone(digits) ? digits : null;
}

/**
 * Vrai si l'identifiant est déjà un numéro normalisé.
 * Permet de migrer les anciennes fiches « awa » sans les casser.
 */
export function isPhoneShapedIdentifier(value: unknown): boolean {
  return isValidParentPhone(value);
}

/** Affichage lisible : « 77 123 45 67 ». */
export function formatParentPhone(value: unknown): string {
  const digits = normalizeParentPhone(value);
  if (digits.length !== SN_PHONE_LENGTH) return digits;
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
}

/**
 * Identifiant lisible mais NON technique : sert à l'écran (« Parent 77 123
 * 45 67 ») et aux exports. On ne s'en sert jamais comme clé.
 */
export function parentLabel(phone: unknown): string {
  return formatParentPhone(phone);
}
