import { describe, it, expect, beforeEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';
import { RestoProvider, useResto } from '@/context/RestoContext';
import ValidationPage from '@/pages/ValidationPage';

type Api = ReturnType<typeof useResto>;

function Harness({ onReady }: { onReady: (api: Api) => void }) {
  const api = useResto();
  onReady(api);
  return null;
}

/** Poste de service : la page + un accès direct au contexte (données de test). */
function mountService() {
  let api!: Api;
  render(
    <RestoProvider>
      <Harness onReady={(a) => { api = a; }} />
      <ValidationPage />
    </RestoProvider>,
  );
  return { latest: () => api };
}

/** Chaque test redémarre sur un poste vierge (même mécanisme que le localStorage du site). */
beforeEach(() => {
  window.localStorage.clear();
});

/**
 * Foyer scolaire de test : parent, élève, abonnement payé (repas décomptés)
 * ET carte prépayée rechargée (pour les commandes du kiosque).
 * Chaque étape dans son propre `act()` : le contexte doit avoir re-render
 * entre deux appels (sinon `collectCashPayment` ne trouve pas l'abonnement).
 */
function addSubscriber(api: () => Api, username: string) {
  act(() => { api().saveParentProfile(username, 'Awa', 'Diallo', '771234567'); });
  let childId = '';
  act(() => {
    const c = api().addChild(username, 'Moussa', 'Diallo', 'CE2', 'primaire');
    childId = c.id;
  });
  let subId = '';
  act(() => { subId = api().subscribe(username, 'F2', childId).id; });
  act(() => { api().collectCashPayment(subId); });
  act(() => { api().topUpChild(childId, 5000, 'cash'); });
  return childId;
}

describe('Poste de service — ValidationPage (espace Personnel)', () => {
  it('affiche l’en-tête, la station de scan, les KPI et le journal', () => {
    mountService();

    expect(screen.getByRole('heading', { name: /validation des repas/i })).toBeInTheDocument();
    expect(screen.getByText('Station de scan')).toBeInTheDocument();
    expect(screen.getByLabelText(/cantine/i)).toBeInTheDocument();
    expect(screen.getByText('repas servis')).toBeInTheDocument();
    expect(screen.getByText('file d’attente')).toBeInTheDocument();
    expect(screen.getByLabelText(/saisie manuelle/i)).toBeInTheDocument();
    expect(screen.getByText(/journal des validations/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scanner le badge/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /photo du badge/i })).toBeInTheDocument();
  });

  it('ouvre la fiche et ne débite qu’après confirmation explicite', () => {
    const { latest } = mountService();
    addSubscriber(latest, 'parent-ui-1');

    fireEvent.click(screen.getByRole('button', { name: /préparer le repas de moussa diallo/i }));

    // Étape 1 : la fiche s’ouvre, le détail est visible, RIEN n’est débité.
    expect(screen.getByRole('heading', { name: /confirmer l’achat \/ la commande/i })).toBeInTheDocument();
    expect(screen.getByText(/1 repas sera décompté/i)).toBeInTheDocument();
    expect(screen.getAllByText('Carte').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Solde carte').length).toBeGreaterThanOrEqual(1);
    expect(latest().validations.filter((v) => v.status === 'accepted')).toHaveLength(0);

    // Étape 2 : confirmation → le repas est validé.
    fireEvent.click(screen.getByRole('button', { name: /^confirmer le repas servi$/i }));

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(/servie/i);
    expect(banner).toHaveTextContent(/repas validé/i);

    // Le bandeau ET la ligne de l’élève basculent en « Servie ».
    expect(screen.getAllByText('Servie').length).toBeGreaterThanOrEqual(2);
  });

  it('une commande payée par carte remonte dans la file « à servir » du guichet', () => {
    const { latest } = mountService();
    const childId = addSubscriber(latest, 'parent-ui-2');

    act(() => {
      latest().sellToChildCard(childId, [{ productId: 'P1', productName: 'Biscuit', price: 500, qty: 1 }], 'caissier');
    });

    expect(screen.getByText(/1 à servir/)).toBeInTheDocument();
    // Compteur « file d’attente » de l’en-tête.
    expect(screen.getByText('file d’attente').previousElementSibling).toHaveTextContent('1');

    // Ouvrir le dossier de l’élève : la commande est servie d’un clic.
    fireEvent.click(screen.getByText(/1 à servir/));
    fireEvent.click(screen.getByRole('button', { name: /tout servir \(1\)/i }));
    expect(latest().kioskOrders[0]?.status).toBe('served');
    expect(screen.getByText(/rien à servir/i)).toBeInTheDocument();
  });

  it('refuse le service sans cantine sélectionnée avec un message clair', () => {
    const { latest } = mountService();
    addSubscriber(latest, 'parent-ui-3');

    const select = screen.getByLabelText(/cantine/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '' } });

    const btn = screen.getByRole('button', { name: /préparer le repas de moussa diallo/i });
    fireEvent.click(btn);

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(/aucune cantine/i);
    expect(latest().validations.filter((v) => v.status === 'accepted')).toHaveLength(0);
  });
});
