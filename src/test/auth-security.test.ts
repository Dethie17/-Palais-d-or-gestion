import { describe, it, expect } from 'vitest';
import {
  registerFailure,
  lockRemainingMs,
  formatCountdown,
  isValidUsername,
  MAX_LOGIN_ATTEMPTS,
  type AttemptRec,
} from '@/lib/authSecurity';

describe('anti brute-force', () => {
  it(`verrouille après ${MAX_LOGIN_ATTEMPTS} échecs, pas avant`, () => {
    const now = 1_000_000;
    let rec: AttemptRec | undefined;
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS - 1; i++) {
      rec = registerFailure(rec, now);
      expect(lockRemainingMs(rec, now)).toBe(0);
    }
    rec = registerFailure(rec, now);
    expect(lockRemainingMs(rec, now)).toBeGreaterThan(0);
  });

  it('verrouillage progressif : 1 min puis 5 min puis 15 min puis 60 min', () => {
    const now = 1_000_000;
    const steps = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
    let rec: AttemptRec | undefined;
    for (const expected of steps) {
      for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) rec = registerFailure(rec, now);
      expect(lockRemainingMs(rec, now + expected - 1000)).toBeGreaterThan(0);
      expect(lockRemainingMs(rec, now + expected + 1000)).toBe(0);
    }
    // Plafonné à 60 min même après de nombreux cycles
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) rec = registerFailure(rec, now);
    expect(lockRemainingMs(rec, now)).toBeLessThanOrEqual(60 * 60_000);
  });

  it('compte à rebours lisible', () => {
    expect(formatCountdown(45_000)).toBe('45 s');
    expect(formatCountdown(60_000)).toBe('1 min');
    expect(formatCountdown(130_000)).toBe('2 min 10 s');
    expect(formatCountdown(-500)).toBe('0 s');
  });
});

describe('règles nom d’utilisateur', () => {
  it('accepte 3–24 caractères simples, refuse le reste', () => {
    expect(isValidUsername('awa2026')).toBe(true);
    expect(isValidUsername('a.b_c-d')).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('a'.repeat(25))).toBe(false);
    expect(isValidUsername('awa diallo')).toBe(false);
    expect(isValidUsername('Awa')).toBe(false);
    expect(isValidUsername('awa@sn')).toBe(false);
  });
});
