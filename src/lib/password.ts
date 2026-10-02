/** Hachage mot de passe côté client (SHA-256). Migre le legacy en clair. */

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fallbackHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 + c, 31);
  }
  return `fb1-${(h1 >>> 0).toString(16)}-${(h2 >>> 0).toString(16)}`;
}

export async function hashPassword(password: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const data = new TextEncoder().encode(`o-resto$${password}`);
      return `sha256-${toHex(await crypto.subtle.digest('SHA-256', data))}`;
    }
  } catch {
    /* repli ci-dessous */
  }
  return fallbackHash(`o-resto$${password}`);
}

/** Vrai si saisie correspond au hash stocké OU au legacy en clair (migration). */
export async function verifyPassword(input: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (stored === input) return true; // legacy en clair → migré au prochain login
  const hashed = await hashPassword(input);
  return hashed === stored;
}

export function isHashed(value: string): boolean {
  return value.startsWith('sha256-') || value.startsWith('fb1-');
}
