import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { AuthProvider } from '@/context/AuthContext';
import { RestoProvider, useResto } from '@/context/RestoContext';
import EspaceParentPage from '@/pages/EspaceParentPage';

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
  it('rend les 5 sections sans planter', () => {
    seedChild();
    renderPage();
    expect(screen.getByText(/Je choisis l’abonnement/)).toBeTruthy();
    expect(screen.getAllByText(/Menu du jour/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Historique des dépenses/)).toBeTruthy();
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
