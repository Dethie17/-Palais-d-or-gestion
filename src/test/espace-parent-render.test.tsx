import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { AuthProvider } from '@/context/AuthContext';
import { RestoProvider, useResto } from '@/context/RestoContext';
import { ProductProvider } from '@/context/ProductContext';
import EspaceParentPage from '@/pages/EspaceParentPage';

const WEEK_KEY = 'o-resto-weeklymenus-v3';

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
  // La session ne se règle plus ici : elle vient du serveur d'authentification
  // (voir src/test/setup.ts). Écrire `o-resto-current-user` dans localStorage
  // ne connecterait plus personne — c'est exactement le contournement que le
  // durcissement interdit.
  localStorage.setItem('o-resto-parentprofiles-v1', JSON.stringify([
    { parentUsername: 'client', firstName: 'Awa', lastName: 'Diallo', phone: '771234567', updatedAt: new Date().toISOString() },
  ]));
});

function seedChild() {
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
  const api = (window as unknown as { __api: ReturnType<typeof useResto> }).__api;
  act(() => {
    api.saveParentProfile('client', 'Awa', 'Diallo', '771234567');
    api.addChild('client', 'Moussa', 'Diallo', 'CE2', 'primaire');
  });
  cleanup();
}

function renderPage() {
  render(
    <AuthProvider>
      <RestoProvider>
        <ProductProvider>
          <EspaceParentPage />
        </ProductProvider>
      </RestoProvider>
    </AuthProvider>,
  );
}

describe('EspaceParentPage render (repro crash childId)', () => {
  it('rend les sections de l’Accès Abonné sans planter (semaine publiée)', async () => {
    seedPublishedWeek();
    seedChild();
    // Le seed enfant réinitialise le provider : republier la semaine après.
    seedPublishedWeek();
    renderPage();
    // `findBy…` et non `getBy…` : le profil est désormais résolu de façon
    // asynchrone (session serveur → lecture du rôle en base). Au premier
    // rendu, l'écran affiche encore « Chargement… ».
    await screen.findByTestId('section-payer-abonnement');
    expect(screen.getByText('Payer l’abonnement')).toBeTruthy();
    expect(screen.getAllByText(/Menu du jour/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Kiosque indisponible pour le moment/)).toBeTruthy();
    expect(screen.getByText(/Historique des dépenses/)).toBeTruthy();
  });

  it('menu du jour de la semaine de référence affiché par défaut (consultation seule)', async () => {
    seedChild();
    renderPage();
    // La nouvelle UX ne montre que le menu du jour (jour courant, sinon
    // le premier jour publié de la semaine de référence).
    await screen.findByText(/Menu du jour — /);
    expect(screen.getByText(/Menu du jour — (Lundi|Mardi|Mercredi|Jeudi|Vendredi)/)).toBeTruthy();
    expect(screen.getAllByText(
      /Menu Élève|Menu Gourmand|Menu Petit Budget|Menu Goûter|Menu Burger/,
    ).length).toBeGreaterThanOrEqual(1);
  });

  it('semaine explicitement vidée par le Personnel (bel état vide)', async () => {
    localStorage.setItem(WEEK_KEY, JSON.stringify([
      { day: 'Lundi', name: '', description: '', items: [] },
      { day: 'Mardi', name: '', description: '', items: [] },
      { day: 'Mercredi', name: '', description: '', items: [] },
      { day: 'Jeudi', name: '', description: '', items: [] },
      { day: 'Vendredi', name: '', description: '', items: [] },
    ]));
    seedChild();
    // Le seed enfant ne touche pas aux menus : la semaine vidée survit.
    localStorage.setItem(WEEK_KEY, JSON.stringify([
      { day: 'Lundi', name: '', description: '', items: [] },
      { day: 'Mardi', name: '', description: '', items: [] },
      { day: 'Mercredi', name: '', description: '', items: [] },
      { day: 'Jeudi', name: '', description: '', items: [] },
      { day: 'Vendredi', name: '', description: '', items: [] },
    ]));
    renderPage();
    await screen.findByText(/Menus en préparation/);
    expect(screen.getByText(/semaine n’est pas publiée/)).toBeTruthy();
  });

  it('supporte un paiement distant sans abonnement lié (pas de crash childId)', async () => {
    localStorage.setItem('o-resto-payments-v1', JSON.stringify([
      { id: 'P-DANGLING', amount: 1900, method: 'balance', status: 'paid', reference: 'PAY-X', createdAt: new Date().toISOString(), clientUsername: 'client' },
    ]));
    seedChild();
    // Le paiement pré-existant doit survivre au seed (addChild ne touche pas aux paiements)
    renderPage();
    await screen.findByText(/Historique des dépenses/);
    // Le pavé « Abonnement » (et son titre) coexiste désormais avec la
    // section de paiement en haut de page : une occurrence suffit.
    expect(screen.getAllByText(/^Abonnement$/).length).toBeGreaterThanOrEqual(1);
  });
});
