import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { RestoProvider, useResto } from '@/context/RestoContext';

type Api = ReturnType<typeof useResto>;

function Harness({ onReady }: { onReady: (api: Api) => void }) {
  const api = useResto();
  onReady(api);
  return null;
}

function mountHarness() {
  let api!: Api;
  render(
    <RestoProvider>
      <Harness onReady={(a) => { api = a; }} />
    </RestoProvider>,
  );
  return { latest: () => api };
}

function setupFamily(api: () => Api, username: string, balance: number) {
  act(() => { api().saveParentProfile(username, 'Awa', 'Diallo', '771234567'); });
  let childId = '';
  act(() => {
    const c = api().addChild(username, 'Moussa', 'Diallo', 'CE2', 'primaire');
    childId = c.id;
  });
  if (balance > 0) {
    act(() => { api().topUpChild(childId, balance, 'cash'); });
  }
  return childId;
}

describe('Menu du jour payé par la carte', () => {
  it('débite le total et crédite 1 repas (pass créé sans abonnement)', () => {
    const { latest } = mountHarness();
    const childId = setupFamily(latest, 'parent-menu-ok', 5000);

    let res = { addedMeals: 0 };
    act(() => { res = latest().buyDayMenu('parent-menu-ok', childId, 'Lundi', 1000); });
    expect(res.addedMeals).toBe(1);
    expect(latest().walletOf(childId)).toBe(4000);

    const pass = latest().subscriptions.find((s) => s.childId === childId && s.status === 'active');
    expect(pass?.mealsRemaining).toBe(1);

    const tx = latest().childTxs(childId).find((t) => t.kind === 'debit' && t.amount === 1000);
    expect(tx?.status).toBe('paid');
    expect(tx?.label).toMatch(/lundi/i);
  });

  it('ajoute le repas à l’abonnement actif existant', () => {
    const { latest } = mountHarness();
    const childId = setupFamily(latest, 'parent-menu-actif', 30000);

    // Abonnement payé en espèces au comptoir (jamais avec la carte).
    let subId = '';
    act(() => {
      const sub = latest().subscribe('parent-menu-actif', 'F2', childId);
      subId = sub.id;
    });
    act(() => { latest().collectCashPayment(subId); });
    expect(latest().subscriptions.find((s) => s.id === subId)?.status).toBe('active');
    const before = latest().subscriptions.find((s) => s.childId === childId && s.status === 'active')?.mealsRemaining;

    act(() => { latest().buyDayMenu('parent-menu-actif', childId, 'Mardi', 2500); });
    const after = latest().subscriptions.find((s) => s.childId === childId && s.status === 'active')?.mealsRemaining;
    expect(after).toBe((before ?? 0) + 1);
    expect(latest().walletOf(childId)).toBe(30000 - 2500);
  });

  it('refuse si solde insuffisant : rien débité, rien crédité', () => {
    const { latest } = mountHarness();
    const childId = setupFamily(latest, 'parent-menu-ko', 500);

    expect(() => {
      act(() => { latest().buyDayMenu('parent-menu-ko', childId, 'Lundi', 1000); });
    }).toThrow(/insuffisant/i);
    expect(latest().walletOf(childId)).toBe(500);
    expect(latest().subscriptions.some((s) => s.childId === childId)).toBe(false);
  });
});
