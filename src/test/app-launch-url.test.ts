import { describe, it, expect } from 'vitest';
import { appLaunchUrl, isTouchDevice } from '@/lib/payments';

/**
 * Le parent qui choisit un abonnement doit être déposé DIRECTEMENT dans Wave
 * (lien de paiement) ou Max it (deep link de l'application), sans écran
 * intermédiaire. Sur ordinateur, il n'y a pas d'application à ouvrir : on
 * rend null et l'écran affiche le QR à scanner.
 */
describe('appLaunchUrl — dépôt direct dans l\'application', () => {
  it('renvoie le lien de paiement Wave (redirect)', () => {
    expect(appLaunchUrl({ kind: 'redirect', url: 'https://pay.wave.com/c/x', label: 'Wave' })).toBe('https://pay.wave.com/c/x');
  });

  it('renvoie la page carte hébergée', () => {
    expect(appLaunchUrl({ kind: 'hosted', url: 'https://pay.example/card', label: 'Carte' })).toBe('https://pay.example/card');
  });

  it('ouvre le deep link Max it sur téléphone (QR)', () => {
    const qr = {
      kind: 'qr' as const,
      qrCode: 'AAAA',
      deepLinks: [{ app: 'MAXIT', url: 'maxit://pay' }, { app: 'OM', url: 'om://pay' }],
    };
    expect(appLaunchUrl(qr, true)).toBe('maxit://pay');
  });

  it('sur ordinateur, ne peut pas ouvrir une appli : null (on montre le QR)', () => {
    const qr = { kind: 'qr' as const, qrCode: 'AAAA', deepLinks: [{ app: 'MAXIT', url: 'maxit://pay' }] };
    expect(appLaunchUrl(qr, false)).toBeNull();
  });

  it('invite poussée ou défi absent : rien à ouvrir', () => {
    expect(appLaunchUrl({ kind: 'prompt', phone: '771234567', label: 'Wave' })).toBeNull();
    expect(appLaunchUrl(undefined)).toBeNull();
  });

  it('isTouchDevice est faux hors navigateur (environnement de test)', () => {
    expect(typeof isTouchDevice()).toBe('boolean');
  });
});
