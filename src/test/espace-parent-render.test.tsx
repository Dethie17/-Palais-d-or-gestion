import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { AuthProvider } from '@/context/AuthContext';
import { RestoProvider, useResto } from '@/context/RestoContext';
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
  localStorage.setItem('o-resto-current-user', JSON.stringify({ username: 'client', role: 'client', password: '', qrToken: 'ORESTO-CLIENT' }));
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
        <EspaceParentPage />
      </RestoProvider>
    </AuthProvider>,
  );
}

describe('EspaceParentPage render (repro crash childId)', () => {
  it('rend les 5 sections sans planter (semaine publiée)', () => {
    seedPublishedWeek();
    seedChild();
    // Le seed enfant réinitialise le provider : republier la semaine après.
    seedPublishedWeek();
    renderPage();
    expect(screen.getByText(/Je choisis l’abonnement/)).toBeTruthy();
    expect(screen.getAllByText(/Menu du jour/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Historique des dépenses/)).toBeTruthy();
    expect(screen.getByText(/Recharger une carte/)).toBeTruthy();
  });

  it('semaine de référence affichée par défaut (menus validés + photos)', () => {
    seedChild();
    renderPage();
    expect(screen.getByText('Menu Élève')).toBeTruthy();
    expect(screen.getByText('Menu Burger')).toBeTruthy();
    expect(screen.getAllByText(/900 FCFA/).length).toBeGreaterThanOrEqual(1);
  });

  it('semaine explicitement vidée par le Personnel (bel état vide)', () => {
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
    expect(screen.getByText(/Menus en préparation/)).toBeTruthy();
    expect(screen.getByText(/Semaine pas encore publiée/)).toBeTruthy();
  });

  it('supporte un paiement distant sans abonnement lié (pas de crash childId)', () => {
    localStorage.setItem('o-resto-payments-v1', JSON.stringify([
      { id: 'P-DANGLING', amount: 1900, method: 'balance', status: 'paid', reference: 'PAY-X', createdAt: new Date().toISOString(), clientUsername: 'client' },
    ]));
    seedChild();
    // Le paiement pré-existant doit survivre au seed (addChild ne touche pas aux paiements)
    renderPage();
    expect(screen.getByText(/Historique des dépenses/)).toBeTruthy();
    expect(screen.getByText('Abonnement')).toBeTruthy();
  });
});
