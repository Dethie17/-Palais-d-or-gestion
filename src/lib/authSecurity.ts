/**
 * Sécurité du login (espace parent comme back-office) — fonctions pures testées.
 * - Anti brute-force : 5 essais puis verrouillage progressif (1 / 5 / 15 / 60 min).
 * - Session : NON limitée (persistante, seule la déconnexion manuelle la supprime).
 * - Noms d'utilisateur : 3–24 caractères [a-z0-9._-] (après minuscules).
 */

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCK_STEPS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

export interface AttemptRec {
  fails: number;
  lockouts: number;
  lockedUntil: number;
}

/** Enregistre un échec ; verrouille quand le seuil est atteint (progressif). */
export function registerFailure(rec: AttemptRec | undefined, now: number): AttemptRec {
  const cur = rec ?? { fails: 0, lockouts: 0, lockedUntil: 0 };
  const fails = cur.fails + 1;
  if (fails >= MAX_LOGIN_ATTEMPTS) {
    const step = LOCK_STEPS_MS[Math.min(cur.lockouts, LOCK_STEPS_MS.length - 1)];
    return { fails: 0, lockouts: cur.lockouts + 1, lockedUntil: now + step };
  }
  return { ...cur, fails };
}

/** Millisecondes de verrouillage restantes (0 = pas verrouillé). */
export function lockRemainingMs(rec: AttemptRec | undefined, now: number): number {
  return Math.max(0, (rec?.lockedUntil ?? 0) - now);
}

/** Compte à rebours lisible : « 45 s », « 2 min 10 s », « 1 min ». */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest > 0 ? `${minutes} min ${rest} s` : `${minutes} min`;
}

/** Nom d'utilisateur : 3–24 caractères, lettres/chiffres/point/underscore/tiret. */
export function isValidUsername(name: string): boolean {
  return /^[a-z0-9._-]{3,24}$/.test(name);
}
