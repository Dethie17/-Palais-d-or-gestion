import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { AuthProvider } from '@/context/AuthContext';
import { RestoProvider, useResto } from '@/context/RestoContext';

/**
 * Course de clé étrangère sur le paiement d'un abonnement.
 *
 * Constaté en production : la réservation (« subscriptions ») et le paiement
 * qui la référence partaient en parallèle. Quand le paiement arrivait en
 * premier, Postgres refusait la clé étrangère (23503), la ligne de paiement
 * n'existait jamais, /api/sycapay/initiate répondait 403 au parent qui venait
 * de choisir sa formule — et rien n'était encaissé.
 *
 * Le test reproduit exactement cette course : l'insertion de l'abonnement est
 * retardée, et on vérifie que celle du paiement ne part qu'une fois la
 * première passée ; un premier refus 23503 est par ailleurs réessayé.
 */

const calls: string[] = [];
let releaseSubscription: (() => void) | null = null;
let paymentAttempts = 0;
let paymentFailuresLeft = 0;

vi.mock('@/lib/supabase', () => {
  interface Recorded {
    table: string;
    ops: string[];
  }

  const settle = (record: Recorded): Promise<{ data: null; error: unknown }> => {
    if (record.table === 'subscriptions' && record.ops.includes('insert')) {
      // L'abonnement ne devient visible qu'au moment décidé par le test.
      return new Promise((resolve) => {
        releaseSubscription = () => resolve({ data: null, error: null });
      });
    }
    if (record.table === 'oresto_payments' && record.ops.includes('insert')) {
      paymentAttempts += 1;
      if (paymentFailuresLeft > 0) {
        paymentFailuresLeft -= 1;
        return Promise.resolve({
          data: null,
          error: { code: '23503', message: 'Key is not present in table "subscriptions".' },
        });
      }
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  };

  const builder = (record: Recorded): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
              settle(record).then(resolve, reject);
          }
          if (typeof prop !== 'string' || prop === 'data' || prop === 'error') return null;
          if (prop === 'insert' || prop === 'upsert' || prop === 'delete') {
            calls.push(`${record.table}:${prop}`);
          }
          return () => builder({ ...record, ops: [...record.ops, prop] });
        },
      },
    );

  return {
    isSupabaseConfigured: false,
    supabase: {
      from: (table: string) => builder({ table, ops: [] }),
      rpc: () => builder({ table: 'rpc', ops: [] }),
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    },
  };
});

function captureApi() {
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
  return (window as unknown as { __api: ReturnType<typeof useResto> }).__api;
}

beforeEach(() => {
  calls.length = 0;
  paymentAttempts = 0;
  paymentFailuresLeft = 0;
  releaseSubscription = null;
  localStorage.clear();
  localStorage.setItem('o-resto-parentprofiles-v1', JSON.stringify([
    { parentUsername: 'client', firstName: 'Awa', lastName: 'Diallo', phone: '771234567', updatedAt: new Date().toISOString() },
  ]));
});

describe('Ordre des écritures abonnement → paiement', () => {
  it('n’écrit le paiement qu’après l’abonnement (plus de violation 23503)', async () => {
    const api = captureApi();
    await act(async () => {
      const sub = api.subscribe('client', 'F2');
      api.paySubscription(sub.id, 'wave', sub);
      await Promise.resolve();
    });

    expect(calls.filter((c) => c === 'subscriptions:insert')).toHaveLength(1);
    // L'abonnement n'est pas encore visible : le paiement ne doit pas partir.
    expect(calls).not.toContain('oresto_payments:insert');

    await act(async () => {
      releaseSubscription?.();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(calls).toContain('oresto_payments:insert');
    expect(paymentAttempts).toBe(1);
  });

  it('réessaie un refus 23503 le temps que la ligne liée devienne visible', async () => {
    paymentFailuresLeft = 1;
    const api = captureApi();
    const sub = api.subscribe('client', 'F2');
    await act(async () => {
      api.paySubscription(sub.id, 'wave', sub);
      // Laisse l'écriture de l'abonnement démarrer avant de la libérer.
      await Promise.resolve();
    });
    await act(async () => {
      releaseSubscription?.();
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    // Premier essai refusé (ligne liée invisible), second essai réussi.
    expect(paymentAttempts).toBe(2);
  });
});
