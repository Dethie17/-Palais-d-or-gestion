import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { RestoProvider, useResto } from '@/context/RestoContext';
import type { Subscription } from '@/types/menu';

type Api = ReturnType<typeof useResto>;

function Harness({ onReady }: { onReady: (api: Api) => void }) {
  const api = useResto();
  onReady(api);
  return null;
}

/** Monte un provider isolé et retourne un accès à l'API la plus fraîche. */
function mountHarness() {
  let api!: Api;
  render(
    <RestoProvider>
      <Harness onReady={(a) => { api = a; }} />
    </RestoProvider>,
  );
  return { latest: () => api };
}

const F2_PRICE = 27000;
const F2_MEALS = 20;

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

function subscribeAndPayWithBalance(api: () => Api, username: string, childId: string) {
  let sub: Subscription | null = null;
  let res = { ok: false, message: '' };
  // Même handler : subscribe() puis paiement — reproduit le flux réel de l'app.
  act(() => {
    sub = api().subscribe(username, 'F2', childId);
    res = api().paySubscriptionWithBalance(sub);
  });
  return { sub: sub as unknown as Subscription, res };
}

describe('Carte prépayée : abonnement payé avec le solde', () => {
  it('réserve + paie dans le même handler : débit, paiement tracé, activation', () => {
    const { latest } = mountHarness();
    const childId = setupFamily(latest, 'parent-solde-ok', 30000);
    expect(latest().walletOf(childId)).toBe(30000);

    const { sub, res } = subscribeAndPayWithBalance(latest, 'parent-solde-ok', childId);
    expect(res.ok).toBe(true);

    const stored = latest().subscriptions.find((s) => s.id === sub.id);
    expect(stored?.status).toBe('active');
    expect(stored?.mealsRemaining).toBe(F2_MEALS);
    expect(latest().walletOf(childId)).toBe(3000);

    const payment = latest().payments.find((p) => p.subscriptionId === sub.id);
    expect(payment?.status).toBe('paid');
    expect(payment?.method).toBe('balance');
    expect(payment?.amount).toBe(F2_PRICE);

    const tx = latest().childTxs(childId).find((t) => t.kind === 'subscription');
    expect(tx?.status).toBe('paid');
    expect(tx?.amount).toBe(F2_PRICE);
  });

  it('refuse si solde insuffisant : réservation conservée, rien débité', () => {
    const { latest } = mountHarness();
    const childId = setupFamily(latest, 'parent-solde-ko', 5000);

    const { sub, res } = subscribeAndPayWithBalance(latest, 'parent-solde-ko', childId);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/insuffisant/i);

    expect(latest().subscriptions.find((s) => s.id === sub.id)?.status).toBe('pending');
    expect(latest().walletOf(childId)).toBe(5000);
    expect(latest().payments.some((p) => p.subscriptionId === sub.id)).toBe(false);
    expect(latest().childTxs(childId).some((t) => t.kind === 'subscription')).toBe(false);
  });

  it('flux externe inchangé : subscribe + paySubscription même handler (cash → pending)', () => {
    const { latest } = mountHarness();
    const childId = setupFamily(latest, 'parent-solde-cash', 0);

    let paymentId = '';
    act(() => {
      const sub = latest().subscribe('parent-solde-cash', 'F2', childId);
      const { payment } = latest().paySubscription(sub.id, 'cash', sub);
      paymentId = payment.id;
    });

    const payment = latest().payments.find((p) => p.id === paymentId);
    expect(payment?.status).toBe('pending');
    expect(payment?.method).toBe('cash');
  });
});
