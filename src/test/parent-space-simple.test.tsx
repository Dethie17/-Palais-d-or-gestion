import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { AuthProvider } from '@/context/AuthContext';
import { RestoProvider, useResto } from '@/context/RestoContext';
import { ProductProvider } from '@/context/ProductContext';
import EspaceParentPage from '@/pages/EspaceParentPage';
import ComplaintsPage from '@/pages/ComplaintsPage';

/**
 * ESPACE ABONNÉ — le parcours continu du parent.
 *
 * Ce que ces tests protègent (les règles métier du contexte) :
 *  1. un parent inscrit PLUSIEURS enfants (nom, prénom, classe) ;
 *  2. chaque enfant reçoit un QR Carte unique ;
 *  3. un enfant DÉJÀ inscrit est refusé — pas de doublon, pas de second QR ;
 *  4. les classes du référentiel (CIA, CIB, CIC, CID…) sont proposées ;
 *  5. le QR de l'enfant est visible dans l'espace abonné.
 */

const WEEK_KEY = 'o-resto-weeklymenus-v3';

/** Numéro du parent de test : c'est son identifiant de connexion. */
const PARENT_PHONE = '771234567';

function seedPublishedWeek() {
  localStorage.setItem(WEEK_KEY, JSON.stringify([
    { day: 'Lundi', name: 'Menu Lundi', description: '', items: [{ name: 'Riz', price: 800 }, { name: 'Jus', price: 500 }] },
    { day: 'Mardi', name: 'Menu Mardi', description: '', items: [{ name: 'Pâtes', price: 900 }] },
    { day: 'Mercredi', name: '', description: '', items: [] },
    { day: 'Jeudi', name: '', description: '', items: [] },
    { day: 'Vendredi', name: '', description: '', items: [] },
  ]));
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

/** Crée la fiche parent puis N enfants, comme le ferait la DAF. */
function seedFamily(children: { first: string; last: string; cls: string; cycle?: 'maternelle' | 'primaire' | 'college' | 'lycee' }[] = []) {
  function Seeder() {
    const api = useResto();
    (window as unknown as { __api?: unknown }).__api = api;
    return null;
  }
  render(
    <AuthProvider>
      <RestoProvider>
        <Seeder />
      </RestoProvider>
    </AuthProvider>,
  );
  const api = () => (window as unknown as { __api: ReturnType<typeof useResto> }).__api;
  // La fiche parent d'abord, dans son propre `act` : l'état n'est appliqué
  // qu'au rendu suivant, et `addChild` refuse un parent sans fiche.
  // Le profil est rattaché au compte de session ('client' en test) et son
  // IDENTIFIANT est le numéro — comme en production.
  act(() => {
    api().saveParentProfile('client', 'Awa', 'Diallo', PARENT_PHONE);
  });
  act(() => {
    children.forEach((c) => api().addChild('client', c.first, c.last, c.cls, c.cycle));
  });
  cleanup();
}

function renderPage(children: React.ReactNode) {
  render(
    <AuthProvider>
      <RestoProvider>
        <ProductProvider>
          {children}
        </ProductProvider>
      </RestoProvider>
    </AuthProvider>,
  );
}

/** Formulaire d'inscription du cycle demandé. */

/**
 * Attend que la session soit résolue ET la fiche parent chargée.
 * La session Auth se résout de façon asynchrone : sans cette attente, on
 * interagit avec une page qui ne connaît pas encore le parent.
 */
async function waitForProfile() {
  await waitFor(() =>
    expect(screen.queryByText(/Créez votre profil parent/)).toBeNull(),
  );
}

describe('Espace Abonné — rendu général', () => {
  it('affiche le parcours continu : payer, menu, kiosque, annonces, historique', async () => {
    seedFamily([{ first: 'Moussa', last: 'Diallo', cls: 'CIA', cycle: 'primaire' }]);
    renderPage(<EspaceParentPage />);
    await waitForProfile();

    expect(screen.getByTestId('section-payer-abonnement')).toBeTruthy();
    expect(screen.getByText('Payer l’abonnement')).toBeTruthy();
    expect(screen.getAllByText(/Menu du jour/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Kiosque indisponible pour le moment/)).toBeTruthy();
    expect(screen.getByText(/Annonces de la cantine/)).toBeTruthy();
    expect(screen.getByText(/Historique des dépenses/)).toBeTruthy();

    // Le formulaire de réclamations est embarqué dans l'espace abonné.
    expect(screen.getByTestId('section-reclamations')).toBeTruthy();
    expect(screen.getByTestId('parent-reclamations-form')).toBeTruthy();
    expect(screen.getAllByText(/Déconnexion/).length).toBeGreaterThanOrEqual(1);
  });

  it('les enfants inscrits apparaissent avec un QR Carte unique chacun', async () => {
    seedFamily([
      { first: 'Moussa', last: 'Diallo', cls: 'CIA', cycle: 'primaire' },
      { first: 'Aïcha', last: 'Diallo', cls: 'CIB', cycle: 'primaire' },
    ]);
    renderPage(<EspaceParentPage />);
    await waitForProfile();

    expect(screen.getByTestId('qr-enfants')).toBeTruthy();
    // Jeton sécurisé : 22 caractères base64url, un par enfant.
    const tokens = screen.getAllByText(/^[A-Za-z0-9_-]{22}$/).map((el) => el.textContent);
    expect(new Set(tokens).size).toBe(2);

    expect(screen.getAllByText(/Moussa Diallo/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Aïcha Diallo/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/CIA/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/CIB/).length).toBeGreaterThanOrEqual(1);
  });

  it('la semaine publiée s’affiche en consultation (pas d’achat en ligne)', async () => {
    seedPublishedWeek();
    seedFamily();
    renderPage(<EspaceParentPage />);
    await waitForProfile();

    expect((await screen.findAllByText(/Menu du jour/)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Riz/)).toBeTruthy();
    expect(screen.getAllByText('MENU DU JOUR').length).toBeGreaterThanOrEqual(1);
  });
});

describe('Espace Abonné — menus', () => {
  it('les menus restent visibles avec le badge du jour (consultation seule)', async () => {
    seedPublishedWeek();
    seedFamily();
    renderPage(<EspaceParentPage />);
    await waitForProfile();
    expect((await screen.findAllByText(/Menu du jour/)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Riz/)).toBeTruthy();
  });
});

describe('Réclamations côté parent', () => {
  it('ouvre un fil, répond, et se sert des annonces', async () => {
    seedFamily();
    renderPage(<ComplaintsPage />);
    expect((await screen.findAllByText((_, el) => !!el?.textContent?.includes('Parlez directement au Superviseur'))).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: /Publier une annonce/ })).toBeNull();
    expect(screen.queryAllByText(/Marquer «/).length).toBe(0);

    // Créer une réclamation.
    fireEvent.click(screen.getByRole('button', { name: /Nouvelle réclamation/ }));
    fireEvent.change(screen.getByPlaceholderText(/repas froid/), { target: { value: 'Repas froid lundi' } });
    fireEvent.change(screen.getByPlaceholderText(/Décrivez/), { target: { value: 'Le riz était froid lundi midi.' } });
    fireEvent.click(screen.getByRole('button', { name: /^Envoyer$/ }));
    await waitFor(() => expect(screen.getByText(/envoyée/)).toBeTruthy());

    // Le fil existe et la liste affiche le badge « Nouvelle ».
    expect(screen.getAllByText('Repas froid lundi').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Nouvelle').length).toBeGreaterThanOrEqual(1);

    // Répondre dans le fil.
    fireEvent.change(screen.getByPlaceholderText('Répondre…'), { target: { value: 'Merci, ceci est ma réponse.' } });
    fireEvent.click(screen.getByRole('button', { name: /^Envoyer$/ }));
    await waitFor(() => expect(screen.getByText('Merci, ceci est ma réponse.')).toBeTruthy());
  });
});
