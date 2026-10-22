import { describe, it, expect } from 'vitest';
import type { Formula, Subscription } from '@/types/menu';
import { revenueBreakdown } from '@/lib/revenue';
import { globalChartData, ismLastMonths, ismPeriod } from '@/lib/ismFinance';

const S = (id: string, formulaId: string) => ({ id, formulaId } as Subscription);
const F = (id: string, kind: 'subscription' | 'ticket', price = 1000) => ({ id, kind, price } as Formula);

const subs = [S('SUB-ABO', 'F1'), S('SUB-TICKET', 'T1')];
const formulas = [F('F1', 'subscription'), F('T1', 'ticket', 1000)];

const paid = (amount: number, formulaId: string, createdAt: string) => ({
  amount, status: 'paid' as const, createdAt, subscriptionId: undefined, formulaId,
});

const base = {
  payments: [
    paid(27000, 'F1', '2026-10-05T10:00:00.000Z'),
    paid(9500, 'F1', '2026-10-06T10:00:00.000Z'),
    paid(1500, 'T1', '2026-10-06T11:00:00.000Z'),
    { ...paid(5000, 'F1', '2026-10-06T11:00:00.000Z'), status: 'pending' as const },
  ],
  orders: [
    { status: 'completed' as const, total: 4000, createdAt: new Date('2026-10-06T12:00:00.000Z') },
    { status: 'cancelled' as const, total: 9999, createdAt: new Date('2026-10-06T12:00:00.000Z') },
  ],
  kioskOrders: [
    { status: 'pending' as const, total: 2000, createdAt: '2026-10-06T09:00:00.000Z' },
    { status: 'served' as const, total: 1000, createdAt: '2026-10-06T09:30:00.000Z' },
    { status: 'cancelled' as const, total: 800, createdAt: '2026-10-06T09:45:00.000Z' },
  ],
  walletTxs: [
    { kind: 'debit' as const, status: 'paid' as const, amount: 500, reference: 'DEB-AAA', createdAt: '2026-10-06T10:00:00.000Z' },
    { kind: 'debit' as const, status: 'paid' as const, amount: 1500, reference: 'TCK-BBB', createdAt: '2026-10-06T11:00:00.000Z' },
    { kind: 'topup' as const, status: 'paid' as const, amount: 10000, reference: 'TOP-CCC', createdAt: '2026-10-06T08:00:00.000Z' },
  ],
  subscriptions: subs,
  formulas,
};

describe('Chiffre dâ€™affaires DAF : ventes rÃ©elles + abonnements validÃ©s', () => {
  it('ignore les recharges et ne compte pas deux fois un ticket', () => {
    const r = revenueBreakdown(base);
    expect(r.subscriptions).toBe(36500);
    expect(r.subscriptionCount).toBe(2);
    expect(r.salesCaisse).toBe(4000);
    expect(r.salesKiosk).toBe(3000);
    expect(r.salesTickets).toBe(1500);
    expect(r.salesMeals).toBe(500);
    expect(r.sales).toBe(9000);
    expect(r.total).toBe(45500);
  });

  it('borne la pÃ©riode et exclut les statuts non payÃ©s / annulÃ©s', () => {
    const r = revenueBreakdown(base, new Date('2026-10-06T00:00:00.000Z').getTime());
    expect(r.subscriptions).toBe(9500);
    expect(r.subscriptionCount).toBe(1);
    expect(r.salesCaisse).toBe(4000);
    expect(r.salesKiosk).toBe(3000);
    expect(r.salesTickets).toBe(1500);
    expect(r.salesMeals).toBe(500);
    expect(r.total).toBe(18500);
  });

  it('les Ã©vÃ©nements Â« ventes hors caisse Â» nourrissent les courbes sans la caisse', () => {
    const r = revenueBreakdown(base);
    expect(r.extraSalesEvents).toHaveLength(4);
    expect(r.extraSalesEvents.reduce((s, e) => s + e.amount, 0)).toBe(5000);
  });

  it('la courbe DG ne compte que les abonnements et ajoute les ventes hors caisse', () => {
    const now = new Date();
    const stamp = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
    const payments = [
      paid(9500, 'F1', stamp.toISOString()),
      paid(1500, 'T1', stamp.toISOString()),
    ];
    const orders = [{ status: 'completed' as const, total: 4000, createdAt: stamp }];
    const points = globalChartData(orders, payments as never, 'realtime', {
      sales: [{ at: stamp.getTime(), amount: 3000 }],
      subscriptions: subs,
      formulas,
    });
    const current = points[points.length - 1];
    expect(current.abonnements).toBe(9500);
    expect(current.caisse).toBe(7000);
    expect(current.total).toBe(16500);
  });
});

describe('ComptabilitÃ© ISM bornÃ©e au mois', () => {
  it('un mois passÃ© ne cumule pas les encaissements des mois suivants', () => {
    const settings = {
      ismSubscriptionPct: 0, schoolPerSubscription: 2000, otherSalesPct: 0,
      touchpointPct: 0, sycapayPct: 0, paydounyaPct: 0, ismPerSubscription: 2000,
      ismSalesPct: 5,
    };
    const today = new Date();
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 15, 10).toISOString();
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 15, 10);
    const payments = [
      { amount: 27000, status: 'paid' as const, createdAt: lastMonth.toISOString(), formulaId: 'F1' },
      { amount: 27000, status: 'paid' as const, createdAt: thisMonth, formulaId: 'F1' },
    ];
    const months = ismLastMonths(payments as never, [], subs, formulas, settings as never, 2);
    expect(months).toHaveLength(2);
    expect(months[0].aboCount).toBe(1);
    expect(months[1].aboCount).toBe(1);
    // et ismPeriod bornÃ© sur le mois courant
    const start = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
    expect(ismPeriod(payments as never, [], subs, formulas, settings as never, start).aboCount).toBe(1);
  });
});

