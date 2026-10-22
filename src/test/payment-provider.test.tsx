import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { initProvider, provider, resetProvider, startPayment, stepsFor, isProviderMethod } from '@/lib/payments';
import type { PaymentProvider } from '@/lib/payments/types';
import { render, act, waitFor, screen, fireEvent } from '@testing-library/react';
import { RestoProvider, useResto } from '@/context/RestoContext';
import WavePaymentModal from '@/components/WavePaymentModal';
import { initiateWavePayment, checkWaveCode } from '@/lib/wave';

/**
 * Le contrat du registre de paiement.
 *
 * Ce qui est vérifié ici est la bascule elle-même : une application déployée
 * sans passerelle (dev local, hors ligne, déploiement sans /api) doit
 * continuer à fonctionner en mode démonstration, et un fournisseur réel ne
 * doit jamais solder un paiement.
 */

function stubProvider(over: Partial<PaymentProvider> = {}): PaymentProvider {
  return {
    id: 'stub',
    label: 'Stub',
    methods: ['wave', 'mobile_money'],
    isAvailable: () => true,
    startPayment: async () => ({ ok: true, challenge: { kind: 'redirect', url: 'https://pay.test/x', label: 'Wave' } }),
    checkStatus: async (reference) => ({ status: 'pending', reference }),
    ...over,
  };
}

describe('Registre de paiement', () => {
  beforeEach(() => {
    resetProvider();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('retombe en mode démo quand la passerelle ne répond pas', async () => {
    // Ni /api en local (vite seul), ni hors ligne : l'app doit démarrer.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const resolved = await initProvider(true);
    expect(resolved.id).toBe('demo');
    expect(provider().id).toBe('demo');
  });

  it('bascule sur SycaPay quand la sonde dit que tout est en place', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, mode: 'sycapay', sycapay: true, database: true }),
    }));
    const resolved = await initProvider(true);
    expect(resolved.id).toBe('sycapay');
  });

  it('ne bascule pas en démo sur un seul raté réseau', async () => {
    // Un raté passager (données mobiles, réveil de la fonction) ferait
    // croire au parent qu'il a payé avec un code de démonstration : la sonde
    // retente, et ne se rend qu'au deuxième échec.
    let appels = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        appels += 1;
        if (appels === 1) return Promise.reject(new Error('réseau'));
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, mode: 'sycapay', sycapay: true, database: true }),
        });
      }),
    );
    const resolved = await initProvider(true);
    expect(appels).toBe(2);
    expect(resolved.id).toBe('sycapay');
  });

  it('reste en démo si la base n’est pas configurée, même avec SycaPay', async () => {
    // Sans fonction SQL de règlement, SycaPay ne pourrait rien solder : mieux
    // vaut le parcours de démonstration qu'un paiement qui n’aboutit pas.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, mode: 'sycapay', sycapay: true, database: false }),
    }));
    const resolved = await initProvider(true);
    expect(resolved.id).toBe('demo');
  });

  it('reconnaît les moyens gérés par un fournisseur', () => {
    expect(isProviderMethod('wave')).toBe(true);
    expect(isProviderMethod('mobile_money')).toBe(true);
    expect(isProviderMethod('card')).toBe(true);
    // Ces deux-là ne passent jamais par la passerelle : l'un est interne,
    // l'autre se règle au comptoir.
    expect(isProviderMethod('cash')).toBe(false);
    expect(isProviderMethod('balance')).toBe(false);
  });

  it('adapt les consignes à la forme du défi', () => {
    expect(stepsFor({ kind: 'qr', qrCode: 'x', deepLinks: [] }, 1900).join(' ')).toMatch(/scannez/i);
    expect(stepsFor({ kind: 'hosted', url: 'https://x', label: 'Carte' }, 1900).join(' ')).toMatch(/carte/i);
    // Intl en fr-FR insère une espace insécable entre les milliers : on compare
  // sur les chiffres, pas sur la ponctuation.
  expect(stepsFor({ kind: 'prompt', phone: '77', label: 'Wave' }, 1900).join(' ').replace(/\s/g, ''))
    .toContain('1900FCFA');
  });

  afterEach(() => { vi.unstubAllGlobals(); });
});

describe('Intégration au contexte', () => {
  it('expose un fournisseur joignable et une session de paiement', async () => {
    // Une commande d'abonnement part « en attente », et c'est le webhook qui
    // l'activera : l'écran ne doit jamais l'activer de lui-même.
    let api!: ReturnType<typeof useResto>;
    function Harness() {
      api = useResto();
      return null;
    }
    render(
      <RestoProvider>
        <Harness />
      </RestoProvider>,
    );

    await waitFor(() => expect(api).toBeTruthy());
    expect(['demo', 'sycapay']).toContain(api.paymentProviderId);

    let subId = '';
    let paymentId = '';
    act(() => {
      const sub = api.subscribe('parent-syca', 'F2');
      subId = sub.id;
    });
    act(() => {
      const { payment } = api.paySubscription(subId, 'wave');
      paymentId = payment.id;
    });

    const payment = api.payments.find((p) => p.id === paymentId);
    expect(payment?.status).toBe('pending');

    // La session s'ouvre sans rien solder : le statut reste « en attente ».
    let session;
    await act(async () => {
      session = await api.openProviderPayment(
        { reference: payment!.reference, amount: payment!.amount, method: 'wave' },
        'sub',
        paymentId,
      );
    });
    expect(session!.reference).toBe(payment!.reference);
    expect(api.payments.find((p) => p.id === paymentId)?.status).toBe('pending');

    // Le fournisseur réel ne solde rien de lui-même non plus.
    await act(async () => {
      const status = await api.syncPaymentFromProvider(payment!.reference);
      expect(['pending', 'unknown', 'paid']).toContain(status.status);
    });
  });
});/** * Le modal de paiement est le seul ecran qui sait rendre un defi SycaPay. * * Il a deja casse en production : les variables du bandeau de redirection * etaient utilisees sans avoir ete definies, et le modal plantait des son * ouverture. Ces tests rendent reellement le composant, avec chaque forme * de defi, pour que ce genre d'erreur ne passe plus. */describe('Rendu du modal de paiement', () => {  const base = {    reference: 'PAY-TEST',    amount: 100,    amountLabel: '100 FCFA',    methodLabel: 'Wave',    merchantName: 'O RESTO',    merchantNumber: '771234567',    expiresAt: new Date(Date.now() + 600000).toISOString(),    steps: ['Ouvrez le lien', 'Validez'],  };  function renderModal(challenge: unknown, provider = 'sycapay') {    return render(      <WavePaymentModal        wave={{ ...base, provider, challenge } as never}        confirming={false}        onConfirm={() => {}}        onPaid={() => {}}        onClose={() => {}}      />,    );  }  it('affiche le bandeau de redirection pour un lien Wave', () => {    renderModal({ kind: 'redirect', url: 'https://pay.wave.com/c/x', label: 'Wave' });    expect(screen.getByText(/Redirection vers/)).toBeTruthy();    expect(screen.getByRole('button', { name: /Ouvrir maintenant/ })).toBeTruthy();  });  it('propose les applications Orange Money sans planter sur le QR', () => {    renderModal({      kind: 'qr',      qrCode: 'iVBORw0KGgo=',      deepLinks: [        { app: 'MAXIT', url: 'https://sugu.orange-sonatel.com/x' },        { app: 'OM', url: 'https://sugu.orange-senatel.com/y' },      ],    });    expect(screen.getByText(/Scannez pour payer/)).toBeTruthy();    expect(screen.getByRole('button', { name: /Ouvrir Max it/ })).toBeTruthy();  });  it('rend un defi ou l operateur pousse l invite sur le telephone', () => {    renderModal({ kind: 'prompt', phone: '771234567', label: 'Mobile Money' });    expect(screen.getByText(/Validez la demande/)).toBeTruthy();  });  it('reste en mode demo sans jamais rediriger', () => {    const { container } = renderModal(      { kind: 'prompt', phone: '771234567', label: 'Wave' },      'demo',    );    expect(container.querySelector('input[placeholder="77 123 45 67"]')).toBeTruthy();    expect(screen.queryByText(/Redirection vers/)).toBeNull();  });});
/**
 * Les regles de production du paiement.
 *
 * Le bug qu'ils verrouillent : une session SycaPay heredait du code de
 * demonstration, l'ecran affichait donc un code a saisir au lieu de
 * rediriger vers Wave - et ce code permettait de crediter un paiement
 * sans qu'aucun argent n'ait ete encaisse.
 */
describe('Regles de production', () => {
  const enProduction = () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('DEV', false);
  };

  it('ne fabrique aucun code de demo en production', () => {
    enProduction();
    const session = initiateWavePayment(100, 'wave', 'PAY-PROD-1');
    expect(session.demoCode).toBeUndefined();
    // Et aucun code n'est memorise : rien a valider cote client.
    expect(checkWaveCode('PAY-PROD-1', '000000')).toBe(false);
  });

  it('ne retombe jamais sur la demo quand la passerelle est injoignable', async () => {
    enProduction();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('reseau')));
    const resolved = await initProvider(true);
    expect(resolved.id).toBe('unavailable');
    expect(resolved.isAvailable()).toBe(false);
  });

  it('un fournisseur indisponible ne produit aucun defi', async () => {
    enProduction();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('reseau')));
    await initProvider(true);
    const result = await provider().startPayment({
      reference: 'PAY-PROD-2',
      amount: 100,
      method: 'wave',
    });
    expect(result.ok).toBe(false);
    expect(result.challenge).toBeUndefined();
    expect(result.error).toMatch(/indisponible/i);
  });

  it('une session SycaPay qui traîne un code de demo ne l affiche pas', () => {
    // La fuite d'origine, reproduite telle quelle : le modal doit
    // rester un ecran de paiement reel, jamais une demonstration.
    const withLeak = {
      reference: 'PAY-PROD-3',
      amount: 100,
      amountLabel: '100 FCFA',
      methodLabel: 'Wave',
      merchantName: 'O RESTO',
      merchantNumber: '771234567',
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      steps: ['Ouvrez le lien'],
      // La fuite d'origine : un code de demo oublie dans la session.
      demoCode: '995467',
      provider: 'sycapay',
      challenge: { kind: 'redirect', url: 'https://pay.wave.com/c/x', label: 'Wave' },
    };
    render(
      <WavePaymentModal
        wave={withLeak as never}
        confirming={false}
        onConfirm={() => {}}
        onPaid={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText(/Mode démo/)).toBeNull();
    expect(screen.queryByLabelText('Code de confirmation')).toBeNull();
    // Et le paiement reel est bien propose.
    expect(screen.getByText(/Redirection vers/)).toBeTruthy();
  });
});

/**
 * Envoi automatique vers l'application de paiement.
 *
 * Le parent ne doit plus chercher de bouton : le modal le dépose tout seul
 * dans Wave / Max it, avec un compte à rebours et une porte de sortie
 * (« Rester ici ») pour payer depuis un autre appareil.
 */
describe('Envoi automatique vers Wave / Max it', () => {
  const base = {
    reference: 'PAY-AUTO',
    amount: 100,
    amountLabel: '100 FCFA',
    methodLabel: 'Wave',
    merchantName: 'O RESTO',
    merchantNumber: '771234567',
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    steps: ['Vous êtes envoyé vers la page de paiement'],
  };
  const WAVE_URL = 'https://pay.wave.com/c/auto123';
  let realLocation: Location;

  beforeEach(() => {
    realLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost/' },
      writable: true,
      configurable: true,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: realLocation,
      writable: true,
      configurable: true,
    });
    vi.useRealTimers();
  });

  function renderAuto(challenge: unknown = { kind: 'redirect', url: WAVE_URL, label: 'Wave' }) {
    return render(
      <WavePaymentModal
        wave={{ ...base, provider: 'sycapay', challenge } as never}
        confirming={false}
        onConfirm={() => {}}
        onPaid={() => {}}
        onClose={() => {}}
      />,
    );
  }

  it('affiche un compte à rebours avant l’envoi', () => {
    renderAuto();
    expect(screen.getByText(/dans 3 s/)).toBeTruthy();
  });

  it('envoie vers Wave au bout du délai', () => {
    renderAuto();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(window.location.href).toBe(WAVE_URL);
  });

  it('« Rester ici » annule l’envoi automatique', () => {
    renderAuto();
    fireEvent.click(screen.getByRole('button', { name: /Rester ici/ }));
    expect(screen.getByText(/Envoi automatique annulé/)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(window.location.href).toBe('http://localhost/');
    // Le parent peut toujours partir manuellement.
    expect(screen.getByRole('button', { name: /Ouvrir maintenant/ })).toBeTruthy();
  });

  it('envoie vers Max it sur téléphone quand le défi est un QR Orange', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({ matches: true }),
      writable: true,
      configurable: true,
    });
    renderAuto({
      kind: 'qr',
      qrCode: 'iVBORw0KGgo=',
      deepLinks: [{ app: 'MAXIT', url: 'https://maxit.orange.com/pay/x' }],
    });
    expect(screen.getAllByText(/Max it/).length).toBeGreaterThanOrEqual(2);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(window.location.href).toBe('https://maxit.orange.com/pay/x');
  });
});

