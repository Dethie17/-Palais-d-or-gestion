/**
 * Jeton QR cryptographiquement sûr : 128 bits d'entropie (16 octets aléatoires)
 * encodés en base64url (22 caractères, sans accents ni signes) — indevinable,
 * stable, sans donnée personnelle (aucun nom, aucun numéro encodés).
 *
 * Remplace l'ancien schéma « ORESTO-XXXXXX » dérivé du nom d'utilisateur,
 * reproductible par n'importe qui connaissant ce nom.
 *
 * Le jeton est généré une fois (à la création de la fiche), écrit en base, et
 * ne change jamais ensuite. La rotation des anciens jetons faibles est gérée
 * par la migration SQL — jamais ici, sinon toutes les cartes imprimées
 * deviendraient invalides sans raison.
 */

/** 16 octets → 22 caractères base64url : 128 bits d'entropie réelle. */
export const SECURE_QR_LENGTH = 22;

const B64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Format exact d'un jeton sécurisé : 22 caractères base64url. */
export function isSecureQrToken(token: unknown): boolean {
  return typeof token === 'string'
    && token.length === SECURE_QR_LENGTH
    && /^[A-Za-z0-9_-]+$/.test(token);
}

/** Reconnaît l'ancien format faible (ORESTO-XXXXXX) à invalider. */
export function isLegacyWeakQrToken(token: unknown): boolean {
  return typeof token === 'string' && /^ORESTO-[0-9A-Z]{6}$/.test(token);
}

function cryptoObj(): Crypto | undefined {
  return typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
}

/** Encodage base64url sans padding (16 octets → 22 caractères). */
function bytesToBase64Url(bytes: Uint8Array): string {
  const g = globalThis as { btoa?: (s: string) => string };
  if (typeof g.btoa === 'function') {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return g.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  // Repli : encodeur six bits équivalent (bits résiduels = zéro, comme btoa).
  let acc = 0;
  let bits = 0;
  let out = '';
  for (const b of bytes) {
    acc = ((acc << 8) | b) & 0xfffff;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += B64URL_ALPHABET[(acc >>> bits) & 63];
    }
  }
  if (bits > 0) out += B64URL_ALPHABET[(acc << (6 - bits)) & 63];
  return out;
}

/**
 * Génère un jeton QR 128 bits. Retourne null si l'environnement ne fournit
 * aucun aléa cryptographique : l'appelant garde alors l'ancien jeton plutôt
 * que d'écrire une valeur faussement « sûre ».
 */
export function generateSecureQrToken(): string | null {
  const crypto = cryptoObj();
  if (!crypto?.getRandomValues) return null;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}
