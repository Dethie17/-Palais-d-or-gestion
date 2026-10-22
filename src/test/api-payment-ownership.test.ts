import { describe, it, expect, vi } from 'vitest';

/**
 * `/api/sycapay/status` déclenche le même règlement que le webhook : savoir si
 * une référence est la sienne n'est pas une question de confort, c'est ce qui
 * empêche un parent de solder la commande d'un autre en devinant une
 * référence.
 *
 * Fichier distinct de `api-auth-guard.test.ts` : celui-ci simule la garde de
 * session, celui-ci la base. Les deux mockages ne peuvent pas coexister sur le
 * même module.
 */

function mockAdmin(rows: Record<string, Array<Record<string, unknown>>>) {
  vi.resetModules();
  vi.doMock('../../api/_lib/supabaseAdmin', () => ({
    adminClient: () => ({
      from: (table: string) => {
        const matches = rows[table] ?? [];
        const filters: Array<[string, unknown]> = [];

        // Le proxy se renvoie lui-même à chaque maillon : c'est lui qui porte
        // les filtres, pas l'objet brut sous-jacent.
        const proxy: Record<string, unknown> = new Proxy(
          {},
          {
            get(_t, prop) {
              if (prop === 'select') return () => proxy;
              if (prop === 'eq') {
                return (col: string, val: unknown) => {
                  filters.push([col, val]);
                  return proxy;
                };
              }
              if (prop === 'maybeSingle' || prop === 'single') {
                // Une FONCTION qui rend la promesse : `.maybeSingle()` doit
                // s'appeler, pas être la promesse elle-même.
                return () => {
                  const hit = matches.find((row) =>
                    filters.every(([col, val]) => row[col] === val),
                  );
                  return Promise.resolve({ data: hit ?? null, error: null });
                };
              }
              if (prop === 'then') {
                return (cb: (v: unknown) => unknown) =>
                  Promise.resolve({ data: matches, error: null }).then(cb);
              }
              return () => proxy;
            },
          },
        );
        return proxy;
      },
    }),
  }));
}

describe('Appartenance d’une référence de transaction', () => {
  it('un parent n’obtient que ses propres transactions', async () => {
    mockAdmin({
      oresto_payments: [{ id: 'p1', reference: 'PAY-A', client_username: 'parent1' }],
    });
    const { referenceBelongsTo } = await import('../../api/_lib/session');

    const caller = { userId: 'u1', username: 'parent1', role: 'client' as const, establishmentId: null };
    expect(await referenceBelongsTo(caller, 'PAY-A')).toBe(true);
    expect(await referenceBelongsTo(caller, 'PAY-B')).toBe(false);
  });

  it('un parent n’atteint pas la transaction d’un autre parent', async () => {
    mockAdmin({
      oresto_payments: [{ id: 'p2', reference: 'PAY-B', client_username: 'parent2' }],
    });
    const { referenceBelongsTo } = await import('../../api/_lib/session');

    const caller = { userId: 'u1', username: 'parent1', role: 'client' as const, establishmentId: null };
    expect(await referenceBelongsTo(caller, 'PAY-B')).toBe(false);
  });

  it('le personnel suit toutes les transactions', async () => {
    mockAdmin({});
    const { referenceBelongsTo } = await import('../../api/_lib/session');

    for (const role of ['admin', 'personnel', 'gestionnaire'] as const) {
      const caller = { userId: 'u1', username: 'staff', role, establishmentId: null };
      expect(await referenceBelongsTo(caller, 'PAY-QUELCONQUE')).toBe(true);
    }
  });

  it('un rechargement est rattaché au bon parent via l’enfant', async () => {
    mockAdmin({
      wallet_transactions: [{ id: 't1', reference: 'TOP-1', child_id: 'c1' }],
      children: [{ id: 'c1', parent_username: 'parent1' }],
    });
    const { referenceBelongsTo } = await import('../../api/_lib/session');

    const bon = { userId: 'u1', username: 'parent1', role: 'client' as const, establishmentId: null };
    const mauvais = { userId: 'u2', username: 'parent2', role: 'client' as const, establishmentId: null };
    expect(await referenceBelongsTo(bon, 'TOP-1')).toBe(true);
    expect(await referenceBelongsTo(mauvais, 'TOP-1')).toBe(false);
  });
});
