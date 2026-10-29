import { describe, expect, it } from 'vitest';
import { normalizeSnPhone, parentPassword, authEmailForUser } from '../../api/_lib/parentAuth';

describe('Connexion parent par numéro', () => {
  it('normalise les formats sénégalais courants', () => {
    expect(normalizeSnPhone('776111463')).toBe('776111463');
    expect(normalizeSnPhone('77 61 11 463')).toBe('776111463');
    expect(normalizeSnPhone('+221 77 61 11 463')).toBe('776111463');
    expect(normalizeSnPhone('221776111463')).toBe('776111463');
    expect(normalizeSnPhone('123')).toBe('');
  });

  it('produit une adresse et un mot de passe techniques stables', () => {
    expect(authEmailForUser('776111463', { AUTH_EMAIL_DOMAIN: 'oresto-sn.com' } as NodeJS.ProcessEnv))
      .toBe('776111463@oresto-sn.com');
    const password = parentPassword('secret-test', '776111463');
    expect(password).toHaveLength(32);
    expect(parentPassword('secret-test', '776111463')).toBe(password);
  });
});
