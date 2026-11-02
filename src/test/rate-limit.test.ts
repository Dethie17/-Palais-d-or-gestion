import { describe, it, expect, beforeEach } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { consumeRateLimit, resetRateLimits, clientIp } from '../../api/_lib/rateLimit';
import { isSameOrigin } from '../../api/_lib/http';

function fakeReq(headers: Record<string, string>): IncomingMessage {
  return { headers, socket: { remoteAddress: '10.0.0.9' } } as unknown as IncomingMessage;
}

beforeEach(() => {
  resetRateLimits();
});

describe('limitation de débit serveur', () => {
  it('autorise N appels puis bloque jusqu’à la fin de la fenêtre', () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i += 1) {
      expect(consumeRateLimit('login:ip:1', 3, 60_000, now).allowed).toBe(true);
    }

    const blocked = consumeRateLimit('login:ip:1', 3, 60_000, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBe(60_000);

    // La fenêtre expirée remet le compteur à zéro.
    expect(consumeRateLimit('login:ip:1', 3, 60_000, now + 60_001).allowed).toBe(true);
  });

  it('isole les compteurs par clé', () => {
    const now = 1_000_000;
    expect(consumeRateLimit('login:phone:771234567', 1, 60_000, now).allowed).toBe(true);
    expect(consumeRateLimit('login:phone:771234567', 1, 60_000, now).allowed).toBe(false);
    expect(consumeRateLimit('login:phone:769876543', 1, 60_000, now).allowed).toBe(true);
  });

  it('lit la première adresse X-Forwarded-For', () => {
    expect(clientIp(fakeReq({ 'x-forwarded-for': '203.0.113.7, 10.0.0.2' }))).toBe('203.0.113.7');
    expect(clientIp(fakeReq({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
    expect(clientIp(fakeReq({}))).toBe('10.0.0.9');
  });
});

describe('contrôle d’origine des routes de connexion', () => {
  it('accepte les appels serveur sans Origin', () => {
    expect(isSameOrigin(fakeReq({ host: 'oresto.vercel.app' }))).toBe(true);
  });

  it('accepte le même hôte, avec ou sans proxy', () => {
    expect(
      isSameOrigin(fakeReq({ host: 'oresto.vercel.app', origin: 'https://oresto.vercel.app' })),
    ).toBe(true);
    expect(
      isSameOrigin(
        fakeReq({
          host: 'internal:3000',
          'x-forwarded-host': 'oresto.vercel.app',
          origin: 'https://oresto.vercel.app',
        }),
      ),
    ).toBe(true);
  });

  it('refuse un autre site et une origine illisible', () => {
    expect(
      isSameOrigin(fakeReq({ host: 'oresto.vercel.app', origin: 'https://pirate.example' })),
    ).toBe(false);
    expect(isSameOrigin(fakeReq({ host: 'oresto.vercel.app', origin: 'null' }))).toBe(false);
  });
});
