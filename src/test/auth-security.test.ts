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

describe('élévation de privilèges par fabrication de session', () => {
  /**
   * Régression : la session était un objet JSON écrit par l'application dans
   * localStorage. Écrire `{"username":"x","role":"admin"}` suffisait à ouvrir
   * l'espace de direction — le rôle n'était relu nulle part.
   *
   * La session est désormais un jeton signé par Supabase et le rôle est relu
   * en base. Ces tests verrouillent les deux points de ce contrat.
   */
  it('ne lit plus aucun rôle depuis le stockage local', async () => {
    const { DEMO_LOGIN_ENABLED, authEmailFor, normalizeRole } = await import('@/context/AuthContext');

    // L'adresse de connexion est dérivée du seul nom d'utilisateur : aucune
    // information de rôle n'y circule. Le domaine est un vrai domaine :
    // Supabase refuse les adresses en `.local`.
    expect(authEmailFor('Admin')).toBe('admin@oresto-sn.com');
    expect(authEmailFor('  awa  ')).toBe('awa@oresto-sn.com');

    // Les alias historiques sont normalisés, jamais acceptés tels quels.
    expect(normalizeRole('caissier')).toBe('gestionnaire');
    expect(normalizeRole('manager')).toBe('admin');
    expect(normalizeRole('ADMIN')).toBe('admin');

    // Un rôle inventé ne donne aucun accès.
    expect(normalizeRole('superadmin')).toBeNull();
    expect(normalizeRole('')).toBeNull();
    expect(normalizeRole(undefined)).toBeNull();
    expect(normalizeRole({ toString: () => 'admin' })).toBeNull();

    if (import.meta.env.PROD) {
      expect(DEMO_LOGIN_ENABLED).toBe(false);
    }
  });

  it('purge l’ancienne session JSON au démarrage', async () => {
    // Une valeur peut rester dans localStorage après le durcissement : elle doit
    // être effacée, pas lue.
    localStorage.setItem('o-resto-current-user', '{"username":"pirate","role":"admin"}');

    const { render, waitFor } = await import('@testing-library/react');
    const React = await import('react');
    const { AuthProvider } = await import('@/context/AuthContext');

    function Probe() {
      return React.createElement('span', null, 'ok');
    }

    render(React.createElement(AuthProvider, null, React.createElement(Probe)));

    await waitFor(() => {
      expect(localStorage.getItem('o-resto-current-user')).toBeNull();
    });
  });
});
