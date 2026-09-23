/**
 * QR Code personnel et STABLE : chaque client possède son propre token,
 * généré une fois et conservé (jamais régénéré au renouvellement).
 * Format : ORESTO-XXXXXX (6 caractères base36 dérivés du nom d'utilisateur).
 */

const KEY = 'o-resto-client-qr';

function readMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function hashUsername(username: string): string {
  const normalized = username.trim().toLowerCase();
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 + c, 31);
  }
  const n = (Math.abs(h1) * 31 + Math.abs(h2)) % (36 ** 6);
  return n.toString(36).toUpperCase().padStart(6, '0');
}

/** Token QR stable et unique pour un nom d'utilisateur. */
export function getClientQrToken(username: string): string {
  const name = username.trim();
  if (!name) return 'ORESTO-VISITEUR';
  const map = readMap();
  const key = name.toLowerCase();
  if (map[key]) return map[key];
  const token = `ORESTO-${hashUsername(name)}`;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...map, [key]: token }));
  } catch {
    /* stockage indisponible : token déterministe quand même */
  }
  return token;
}

/** Vrai si ce token est le QR personnel stable de cet utilisateur. */
export function isPersonalQrToken(username: string, token: string): boolean {
  return getClientQrToken(username) === token.trim().toUpperCase();
}
