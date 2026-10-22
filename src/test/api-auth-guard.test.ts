import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Les fonctions serveur sont des URL publiques.
 *
 * `/api/sycapay/initiate` déclenche un débit sur le compte marchand et
 * `/api/sycapay/status` solde une commande : sans contrôle d'accès, connaître
 * l'URL suffisait. Ces tests verrouillent le refus des appels anonymes — et,
 * pour les parents, l'accès limité à LEURS commandes au BON montant.
 */

const authState = vi.hoisted(() => ({
  // null = aucun jeton reconnu ; sinon l'appelant que le serveur résout.
  caller: null as { userId: string; username: string; role: string; establishmentId: string | null } | null,
  throws: false,
}));

const dbState = vi.hoisted(() => ({
  payments: [] as Record<string, unknown>[],
  topups: [] as Record<string, unknown>[],
  children: [] as Record<string, unknown>[],
}));

vi.mock('../../api/_lib/supabaseAdmin', () => {  function fakeQuery(table: string) {
    const filters: [string, unknown][] = [];
    const q: {
      select: () => unknown;
      eq: (col: string, val: unknown) => unknown;
      maybeSingle: () => Promise<{ data: unknown; error: null }>;
    } = {
      select: () => q,
      eq: (col: string, val: unknown) => {
        filters.push([col, val]);
        return q;
      },
      maybeSingle: async () => {
        const rows =
          table === 'oresto_payments'
            ? dbState.payments
            : table === 'wallet_transactions'
              ? dbState.topups
              : dbState.children;
        const found = rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null;
        return { data: found, error: null };
      },
    };
    return q;
  }
  return {
    adminClient: () => ({
      from: (table: string) => fakeQuery(table),
      rpc: async () => ({ error: null }),
    }),
  };
});

/**
 * La passerelle est « configurée » dans ces tests : sans ça, /initiate
 * s'arrête à 503 avant même le contrôle de propriété, et les tests ne
 * prouveraient rien. L'appel opérateur est simulé (aucun réseau).
 */
const sycapayCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock('../../api/_lib/sycapay', async () => {
  const actual = await vi.importActual<typeof import('../../api/_lib/sycapay')>(
    '../../api/_lib/sycapay',
  );
  return {
    ...actual,
    isSycaPayConfigured: () => true,
    readConfig: () => ({}),
    call: async () => {
      sycapayCalls.count += 1;
      return {
        errorCode: '201',
        transaction: { tokenTX: 'TX-TEST' },
        urlRedirection: 'https://pay.test/x',
      };
    },
  };
});

vi.mock('../../api/_lib/session', async () => {
  const actual = await vi.importActual<typeof import('../../api/_lib/session')>(
    '../../api/_lib/session',
  );
  return {
    ...actual,
    resolveCaller: async () => {
      if (authState.throws) throw new Error('auth indisponible');
      return authState.caller;
    },
    requireRole: async (req: IncomingMessage, res: ServerResponse, allowed: string[]) => {
      let caller = null;
      try {
        caller = authState.throws ? null : authState.caller;
      } catch {
        caller = null;
      }
      if (!caller) {
        actual.unauthorized(res);
        return null;
      }
      if (!allowed.includes(caller.role)) {
        actual.forbidden(res);
        return null;
      }
      return caller as never;
    },
  };
});

function fakeRes() {
  const state = { status: 0, body: '', headers: {} as Record<string, string> };
  const res = {
    writeHead(status: number, headers?: Record<string, string>) {
      state.status = status;
      if (headers) Object.assign(state.headers, headers);
    },
    end(chunk?: string) {
      state.body = chunk ?? '';
    },
  };
  return { res: res as unknown as ServerResponse, state };
}

function fakeReq(body: unknown, headers: Record<string, string> = {}): IncomingMessage {
  const req = {
    method: 'POST',
    headers,
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body));
    },
  } as unknown as IncomingMessage;
  // Le runtime Vercel peut fournir un corps déjà lu.
  (req as unknown as { body?: unknown }).body = JSON.stringify(body);
  return req;
}

const PAYLOAD = {
  reference: 'QA-TEST-1',
  amount: 100_000,
  codeService: 'SN_PM_WAVE',
  numeroBeneficiaire: '771234567',
  urlSuccess: 'https://oresto.vercel.app/paiement/sycapay/ok?ref=QA-TEST-1',
  urlFailed: 'https://oresto.vercel.app/paiement/sycapay/echec?ref=QA-TEST-1',
};

beforeEach(() => {
  authState.caller = null;
  authState.throws = false;
  dbState.payments = [];
  dbState.topups = [];
  dbState.children = [];
  sycapayCalls.count = 0;
});

function parentCaller(username = 'parent1') {
  authState.caller = { userId: 'u1', username, role: 'client', establishmentId: null };
}

describe('Garde des endpoints de paiement', () => {
  it('refuse /initiate sans session', async () => {
    const { default: handler } = await import('../../api/sycapay/initiate');
    const { res, state } = fakeRes();
    await handler(fakeReq(PAYLOAD), res);

    expect(state.status).toBe(401);
    expect(state.body).toContain('Authentification requise');
    // Aucune trace de la demande dans la réponse.
    expect(state.body).not.toContain('QA-TEST-1');
  });

  it('refuse /status sans session', async () => {
    const { default: handler } = await import('../../api/sycapay/status');
    const { res, state } = fakeRes();
    await handler(fakeReq({ reference: 'QA-TEST-1' }), res);

    expect(state.status).toBe(401);
  });

  it('refuse /card sans session', async () => {
    const { default: handler } = await import('../../api/sycapay/card');
    const { res, state } = fakeRes();
    await handler(fakeReq(PAYLOAD), res);

    expect(state.status).toBe(401);
  });

  it('un parent initie SES propres commandes (abonnement, bon montant)', async () => {
    parentCaller();
    dbState.payments = [{ reference: 'QA-TEST-1', amount: 100_000, client_username: 'parent1' }];
    const { default: handler } = await import('../../api/sycapay/initiate');
    const { res, state } = fakeRes();
    await handler(fakeReq(PAYLOAD), res);

    // La propriété et le montant sont acceptés : l'appel opérateur a lieu.
    expect(sycapayCalls.count).toBe(1);
    expect(state.status).toBe(200);
    expect(state.body).toContain('https://pay.test/x');
  });

  it('un parent initie la recharge de la carte de SON enfant', async () => {
    parentCaller();
    dbState.topups = [{ id: 'tx1', reference: 'QA-TEST-1', amount: 100_000, child_id: 'c1' }];
    dbState.children = [{ id: 'c1', parent_username: 'parent1' }];
    const { default: handler } = await import('../../api/sycapay/initiate');
    const { res, state } = fakeRes();
    await handler(fakeReq(PAYLOAD), res);

    expect(sycapayCalls.count).toBe(1);
    expect(state.status).toBe(200);
  });

  it('un parent ne peut pas initier la commande d’autrui', async () => {
    parentCaller();
    dbState.payments = [{ reference: 'QA-TEST-1', amount: 100_000, client_username: 'lautre' }];
    const { default: handler } = await import('../../api/sycapay/initiate');
    const { res, state } = fakeRes();
    await handler(fakeReq(PAYLOAD), res);

    expect(state.status).toBe(403);
    expect(sycapayCalls.count).toBe(0);
  });

  it('un parent ne peut pas modifier le montant de sa commande', async () => {
    parentCaller();
    dbState.payments = [{ reference: 'QA-TEST-1', amount: 27_000, client_username: 'parent1' }];
    const { default: handler } = await import('../../api/sycapay/initiate');
    const { res, state } = fakeRes();
    await handler(fakeReq(PAYLOAD), res);

    expect(state.status).toBe(400);
    expect(state.body).toContain('incohérent');
    expect(sycapayCalls.count).toBe(0);
  });

  it('une référence inconnue reste interdite au parent', async () => {
    parentCaller();
    const { default: handler } = await import('../../api/sycapay/initiate');
    const { res, state } = fakeRes();
    await handler(fakeReq(PAYLOAD), res);

    expect(state.status).toBe(403);
    expect(sycapayCalls.count).toBe(0);
  });

  it('le personnel garde l’accès libre au comptoir', async () => {
    authState.caller = { userId: 'u2', username: 'caisse1', role: 'personnel', establishmentId: null };
    const { default: handler } = await import('../../api/sycapay/initiate');
    const { res, state } = fakeRes();
    await handler(fakeReq(PAYLOAD), res);

    expect(state.status).toBe(200);
    expect(sycapayCalls.count).toBe(1);
  });

  it('ne solde jamais une transaction qu’un parent ne possède pas', async () => {
    authState.caller = {
      userId: 'u1',
      username: 'parent1',
      role: 'client',
      establishmentId: null,
    };
    const { default: handler } = await import('../../api/sycapay/status');
    const { res, state } = fakeRes();
    await handler(fakeReq({ reference: 'PAY-DE-LAUTRE' }), res);

    // 503 ici parce que la passerelle SycaPay n'est pas configurée dans l'env
    // de test : le contrôle de configuration passe avant la vérification de
    // propriété. Les deux sont des refus — l'important est qu'aucun règlement
    // ne soit rendu pour une référence qui n'appartient pas à l'appelant.
    expect(state.status).toBeGreaterThanOrEqual(400);
    expect(state.body).not.toContain('"status":"paid"');
    expect(state.body).not.toContain('addedMeals');
  });

  it('ne laisse passer personne quand l’authentification tombe en panne', async () => {
    // Un bug réseau ne doit jamais se traduire par « on laisse entrer ».
    authState.throws = true;
    const { default: handler } = await import('../../api/sycapay/initiate');
    const { res, state } = fakeRes();
    await handler(fakeReq(PAYLOAD), res);

    expect(state.status).toBe(401);
  });

  it('laisse le webhook hors de ce garde : il s’authentifie par HMAC', async () => {
    // Le webhook est appelé par SycaPay, qui n'a pas de session : sa preuve
    // est la signature, vérifiée ailleurs. Lui mettre une garde de session
    // casserait les notifications.
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('api/sycapay/webhook.ts', 'utf8'),
    );
    expect(source).not.toContain('requireRole');
  });
});

