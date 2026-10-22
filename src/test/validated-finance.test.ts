/**
 * Comptabilité « validée » : ce qui compte n'est pas le statut « payé »
 * mais l'horodatage du règlement.
 *
 * Rappel du risque : le statut d'un paiement est modifiable depuis un
 * navigateur. L'horodatage de règlement, non — il est posé par le
 * serveur. C'est donc lui qui fait foi, et la comptabilité doit s'y
 * accrocher.
 */

import { describe, it, expect } from 'vitest';
import type { Formula, ORestoPayment, ORestoPaymentStatus, Subscription } from '@/types/menu';
import {
  isValidatedPayment,
  paymentDate,
  settlementIsSupported,
  validatedPayments,
} from '@/lib/validatedPayments';
import { revenueBreakdown } from '@/lib/revenue';
import { ismPeriod } from '@/lib/ismFinance';

const paid = (amount: number, extra: Partial<{ settledAt: string; paidAt: string; status: ORestoPaymentStatus }> = {}) => ({
  amount,
  status: extra.status ?? ('paid' as ORestoPaymentStatus),
  createdAt: '2026-10-06T10:00:00.000Z',
  paidAt: extra.paidAt,
  settledAt: extra.settledAt,
  subscriptionId: undefined,
  formulaId: 'F1',
});

describe('Paiements validés : le règlement fait foi', () => {
  it('un paiement payé mais non horodaté n’est pas un encaissement validé', () => {
    expect(isValidatedPayment({ status: 'paid' })).toBe(false);
    expect(isValidatedPayment({ status: 'paid', settledAt: '' })).toBe(false);
    expect(isValidatedPayment({ status: 'paid', settledAt: '2026-10-06T10:00:01.000Z' })).toBe(true);
    expect(isValidatedPayment({ status: 'pending', settledAt: '2026-10-06T10:00:01.000Z' })).toBe(false);
  });

  it('sans horodatage en base, on retombe sur le statut (migration pas appliquée)', () => {
    const list = [paid(1000), paid(2000)];
    expect(settlementIsSupported(list)).toBe(false);
    expect(validatedPayments(list)).toHaveLength(2);
  });

  it('dès que la base tient l’horodatage, seuls les règlements comptent', () => {
    const list = [
      paid(1000, { settledAt: '2026-10-06T10:00:01.000Z' }),
      paid(2000), // payé, jamais réglé
      paid(3000, { status: 'pending', settledAt: '2026-10-06T10:00:02.000Z' }),
    ];
    expect(settlementIsSupported(list)).toBe(true);
    expect(validatedPayments(list).map((p) => p.amount)).toEqual([1000]);
  });

  it('la date de comptage est celle du règlement', () => {
    const p = paid(1000, { settledAt: '2026-10-08T10:00:00.000Z', paidAt: '2026-10-07T10:00:00.000Z' });
    expect(paymentDate(p)).toBe(new Date('2026-10-08T10:00:00.000Z').getTime());
  });
});

describe('Chiffre d’affaires : hors paiements non réglés', () => {
  const formulas = [{ id: 'F1', kind: 'subscription', price: 1000 } as Formula];
  const subscriptions = [{ id: 'SUB-1', formulaId: 'F1' } as Subscription];

  it('un paiement payé sans règlement ne rentre pas dans le CA', () => {
    const r = revenueBreakdown({
      payments: [
        paid(27000, { settledAt: '2026-10-06T10:00:01.000Z' }),
        paid(5000), // payé mais jamais réglé
      ],
      orders: [],
      subscriptions,
      formulas,
    });
    expect(r.subscriptions).toBe(27000);
    expect(r.total).toBe(27000);
  });

  it('la période s’entoure de la date de règlement, pas de la création', () => {
    const r = revenueBreakdown({
      payments: [
        paid(27000, { settledAt: '2026-10-20T10:00:01.000Z' }),
      ],
      orders: [],
      subscriptions,
      formulas,
    }, new Date('2026-10-01T00:00:00.000Z').getTime());
    expect(r.subscriptions).toBe(27000);
  });

  it('la comptabilité ISM ignore elle aussi les paiements non réglés', () => {
    const settings = {
      ismPerSubscription: 2000, ismSalesPct: 0.5, schoolPerSubscription: 2000,
      otherSalesPct: 0.5, touchpointPct: 0, sycapayPct: 0,
      ismSubscriptionPct: 0, paydounyaPct: 0,
    };
    const ism = ismPeriod(
      [
        paid(27000, { settledAt: '2026-10-06T10:00:01.000Z' }),
        paid(27000),
      ] as unknown as ORestoPayment[],
      [],
      subscriptions,
      formulas,
      settings,
      new Date('2026-10-01T00:00:00.000Z').getTime(),
      0,
    );
    expect(ism.ismAbo).toBe(2000);
  });
});
