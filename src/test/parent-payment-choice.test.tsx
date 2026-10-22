import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { AuthProvider } from '@/context/AuthContext';
import { RestoProvider, useResto } from '@/context/RestoContext';
import ChildrenPage from '@/pages/ChildrenPage';
import SubscriptionPage from '@/pages/SubscriptionPage';

/**
 * Parcours parent : choix Wave / Orange Money + numéro validé avant envoi.
 *
 * Le parent choisit son moyen, saisit le numéro du compte à débiter, et
 * c'est seulement un numéro valide qui déclenche la redirection vers
 * Wave / Max it — pour la recharge comme pour l'abonnement, carte par carte.
 */

beforeEach(() => {
  cleanup();
  localStorage.clear();
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

function renderWithResto(page: React.ReactNode) {
  render(
    <AuthProvider>
      <RestoProvider>{page}</RestoProvider>
    </AuthProvider>,
  );
}

describe('Choix Wave / Orange Money + numéro (recharge par carte)', () => {
  it('propose Orange Money et demande le numéro avant de recharger', async () => {
    seedChild();
    renderWithResto(<ChildrenPage />);
    // Le sélecteur de moyen contient Orange Money (pas seulement Wave).
    const selects = (await screen.findAllByDisplayValue('Wave')) as HTMLSelectElement[];
    expect(selects.length).toBeGreaterThanOrEqual(1);
    expect(selects[0].innerHTML).toContain('Orange Money');
    // Numéro pré-rempli depuis le profil parent, modifiable par carte.
    const phones = await screen.findAllByPlaceholderText(/Numéro Wave \/ Orange Money/);
    const phone = phones[0] as HTMLInputElement;
    expect(phone.value.replace(/\D/g, '')).toContain('771234567');
  });

  it('refuse un numéro invalide sans appeler la passerelle', async () => {
    seedChild();
    renderWithResto(<ChildrenPage />);
    const phoneList = await screen.findAllByPlaceholderText(/Numéro Wave \/ Orange Money/);
    const phone = phoneList[0] as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '123' } });
    // Un montant valide, pour que ce soit bien le numéro qui bloque.
    const amount = (await screen.findAllByPlaceholderText(/Montant FCFA/))[0] as HTMLInputElement;
    fireEvent.change(amount, { target: { value: '5000' } });
    const recharge = screen.getAllByRole('button', { name: /^Recharger$/ })[0];
    fireEvent.click(recharge);
    expect(await screen.findByText(/Numéro mobile invalide/)).toBeTruthy();
  });
});

describe('Choix Wave / Orange Money (abonnements)', () => {
  it('propose Orange Money dans le catalogue avec le numéro du payeur', async () => {
    seedChild();
    function SeedPending() {
      const api = useResto();
      (window as unknown as { __api?: unknown }).__api = api;
      return null;
    }
    render(
      <AuthProvider>
        <RestoProvider>
          <SeedPending />
        </RestoProvider>
      </AuthProvider>,
    );
    const api = (window as unknown as { __api: ReturnType<typeof useResto> }).__api;
    act(() => {
      const sub = api.subscribe('client', 'F2', api.myChildren('client')[0].id);
      void sub;
    });
    cleanup();
    renderWithResto(<SubscriptionPage onNavigate={() => {}} />);
    expect(await screen.findByRole('button', { name: 'Orange Money' })).toBeTruthy();
    expect(await screen.findByPlaceholderText(/Numéro Wave \/ Orange Money/)).toBeTruthy();
  });
});

describe('Espace parent : aucun moyen hors Wave / Orange Money', () => {
  it('n\'affiche ni espèces ni carte dans les sélecteurs de paiement', async () => {
    seedChild();
    renderWithResto(<ChildrenPage />);
    const recharge = (await screen.findByLabelText(/Moyen de recharge pour/)) as HTMLSelectElement;
    const subscribe = (await screen.findByLabelText(/Moyen de paiement de l'abonnement de/)) as HTMLSelectElement;
    for (const select of [recharge, subscribe]) {
      const values = Array.from(select.options).map((o) => o.value);
      expect(values).toEqual(['wave', 'mobile_money']);
      expect(select.innerHTML).not.toContain('Espèces');
      expect(select.innerHTML).not.toContain('Carte');
    }
  });

  it('ne propose que Wave et Orange Money sur la page d\'abonnement', async () => {
    seedChild();
    function SeedPending() {
      const api = useResto();
      (window as unknown as { __api?: unknown }).__api = api;
      return null;
    }
    render(
      <AuthProvider>
        <RestoProvider>
          <SeedPending />
        </RestoProvider>
      </AuthProvider>,
    );
    const api = (window as unknown as { __api: ReturnType<typeof useResto> }).__api;
    act(() => {
      api.subscribe('client', 'F2', api.myChildren('client')[0].id);
    });
    cleanup();
    renderWithResto(<SubscriptionPage onNavigate={() => {}} />);
    expect(await screen.findByRole('button', { name: /^Wave/ })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /^Orange Money/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Espèces$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Carte$/ })).toBeNull();
  }, 20000);
});
