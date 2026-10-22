/**
 * QR personnel déterministe, calculé côté serveur à la création du compte.
 *
 * MÊME ALGORITHME QUE src/lib/clientQr.ts (hashUsername) : le client recalcule
 * le même token pour vérifier qu'un QR scanné appartient bien à ce parent.
 * Toute divergence entre les deux produirait des QR « non reconnus ».
 */
export function personalQrToken(username: string): string {
  const normalized = username.trim().toLowerCase();
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 + c, 31);
  }
  const n = (Math.abs(h1) * 31 + Math.abs(h2)) % 36 ** 6;
  return `ORESTO-${n.toString(36).toUpperCase().padStart(6, '0')}`;
}
