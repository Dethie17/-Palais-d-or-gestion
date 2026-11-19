import { describe, it, expect, vi } from 'vitest';

/**
 * Le webhook v2 porte un eventId, et les fonctions SQL le gravent dans
 * sycapay_events avant même de chercher la référence. Une recharge vit dans
 * wallet_transactions, pas dans oresto_payments : si la sonde « paiement »
 * consomme l'eventId, oresto_settle_topup ne voit plus qu'un doublon et la
 * carte n'est jamais créditée. Ces tests figent l'aiguillage.
 */

interface Call {
  fn: string;
  args: Record<string, unknown>;
}

function mockClient(payment: Record<string, unknown> | null, outcomes: Record<string, string>): Call[] {
  const calls: Call[] = [];

  vi.resetModules();
  vi.doMock('../../api/_lib/supabaseAdmin', () => ({
    isMissingFunction: () => false,
    adminClient: () => ({
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        const outcome = fn === 'oresto_settle_payment_group'
          ? 'unknown'
          : outcomes[fn] ?? 'unknown';
        return Promise.resolve({
          data: {
            outcome,
            reference: args.p_reference,
            ...(outcome === 'settled' ? { status: 'paid' } : {}),
          },
          error: null,
        });
      },
      from: (table: string) => {
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = chain;
        builder.eq = chain;
        builder.is = chain;
        builder.limit = chain;
        builder.order = chain;
        builder.update = chain;
        builder.maybeSingle = () =>
          Promise.resolve({ data: table === 'oresto_payments' ? payment : null, error: null });
        builder.then = (cb: (v: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(cb);
        return builder;
      },
    }),
  }));

  return calls;
}

describe('Aiguillage du règlement vers la bonne table', () => {
  it('réserve l’eventId de la recharge au wallet', async () => {
    const calls = mockClient(null, {
      oresto_settle_payment: 'unknown',
      oresto_settle_topup: 'settled',
    });
    const { settle } = await import('../../api/_lib/settle');

    const out = await settle({
      reference: 'TOP-ABC',
      tag: 'SUCCESS',
      eventId: 'evt-topup',
      finalized: true,
    });

    expect(out.outcome).toBe('settled');
    const payment = calls.find((c) => c.fn === 'oresto_settle_payment');
    const topup = calls.find((c) => c.fn === 'oresto_settle_topup');
    expect(payment?.args.p_event_id).toBeNull();
    expect(topup?.args.p_event_id).toBe('evt-topup');
  });

  it('réserve l’eventId du paiement à oresto_payments', async () => {
    const calls = mockClient({ id: 'p1', reference: 'PAY-ABC' }, {
      oresto_settle_payment: 'settled',
    });
    const { settle } = await import('../../api/_lib/settle');

    const out = await settle({
      reference: 'PAY-ABC',
      tag: 'SUCCESS',
      eventId: 'evt-pay',
      finalized: true,
    });

    expect(out.outcome).toBe('settled');
    const payment = calls.find((c) => c.fn === 'oresto_settle_payment');
    expect(payment?.args.p_event_id).toBe('evt-pay');
    expect(calls.some((c) => c.fn === 'oresto_settle_topup')).toBe(false);
  });
});
