import {
  SECURE_QR_LENGTH,
  generateSecureQrToken,
  isLegacyWeakQrToken,
  isSecureQrToken,
} from '@/lib/secureQr';

describe('Jetons QR 128 bits', () => {
  it('génère 22 caractères base64url', () => {
    const token = generateSecureQrToken();
    expect(token).not.toBeNull();
    expect(token!).toHaveLength(SECURE_QR_LENGTH);
    expect(token!).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(isSecureQrToken(token)).toBe(true);
  });

  it('produit des jetons différents (entropie)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const t = generateSecureQrToken();
      expect(t).not.toBeNull();
      seen.add(t!);
    }
    expect(seen.size).toBe(50);
  });

  it('sans crypto, rend la main à l’appelant (null, pas de faux jeton)', () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      get: () => undefined,
    });
    try {
      expect(generateSecureQrToken()).toBeNull();
      expect(isSecureQrToken(null)).toBe(false);
      expect(isSecureQrToken('ORESTO-AAAAAA')).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: original,
      });
    }
  });

  it('marque l’ancien format ORESTO-XXXXXX comme faible', () => {
    expect(isLegacyWeakQrToken('ORESTO-K0D4XE')).toBe(true);
    expect(isLegacyWeakQrToken('ORESTO-visiteur')).toBe(false);
    expect(isLegacyWeakQrToken(generateSecureQrToken() ?? '')).toBe(false);
  });
});
