import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { RestoProvider, useResto } from '@/context/RestoContext';
import type { ORestoPayment } from '@/types/menu';

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

describe('Abonnement multi-mois payé au comptoir', () => {
  it('conserve les deux mois : quota doublé et montant doublé', () => {
    const { latest } = mountHarness();
    let subId = '';

    act(() => {
      const created = latest().subscribeBundle(
        'parent-multi-mois',
        'F2',
        undefined,
        2,
        '2026-12-01T00:00:00.000Z',
      );
      subId = created.subscription.id;
    });

    let payment: ORestoPayment | null = null;
    act(() => {
      payment = latest().collectCashPayment(subId);
    });

    expect(payment).not.toBeNull();
    expect(payment!.amount).toBe(27000 * 2);
    const sub = latest().subscriptions.find((s) => s.id === subId);
    expect(sub?.status).toBe('active');
    expect(sub?.endDate).toBe('2027-02-01T00:00:00.000Z');
    expect(sub?.mealsRemaining).toBe(20 * 2);
  });
});
