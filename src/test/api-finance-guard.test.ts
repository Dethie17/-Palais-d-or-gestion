/**
 * Garde des endpoints de comptabilité.
 *
 * `/api/finance/validated` lit la comptabilité : elle est réservée au
 * personnel et à la direction. `/api/finance/settle-payment` pose
 * l'horodatage de règlement : c'est lui qui décide de ce qui entre en
 * comptabilité. Un parent qui les atteindrait pourrait soit lire les
 * chiffres des autres, soit s'attribuer un encaissement.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

const authState = vi.hoisted(() => ({
  caller: null as { userId: string; username: string; role: string; establishmentId: string | null } | null,
}));

const dbState = vi.hoisted(() => ({
  settleCalls: [] as string[],
  settledRows: [] as Record<string, unknown>[],
}));

vi.mock('../../api/_lib/supabaseAdmin', () => {
  const q = {
    select: () => q,
    eq: () => q,
    order: () => q,
    limit: () => q,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  return {
    adminClient: () => ({
      from: () => q,
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === 'settle_payment') {
          const id = String(args.p_payment_id ?? '');
          dbState.settleCalls.push(id);
          const row = { id, status: 'paid', settled_at: '2026-10-22T10:00:00.000Z', amount: 27000 };
          dbState.settledRows.push(row);
          return { data: row, error: null };
        }
        return { data: null, error: { code: 'PGRST202', message: 'function not found' } };
      },
    }),
    isMissingFunction: (error: { code?: string } | null) => error?.code === 'PGRST202',
  };
});

vi.mock('../../api/_lib/session', async () => {
  const actual = await vi.importActual<typeof import('../../api/_lib/session')>(
    '../../api/_lib/session',
  );
  return {
    ...actual,
    resolveCaller: async () => authState.caller,
    requireRole: async (req: IncomingMessage, res: ServerResponse, allowed: string[]) => {
      const caller = authState.caller;
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

function fakeReq(method: string, body: unknown, url = '/'): IncomingMessage {
  const req = {
    method,
    url,
    headers: {},
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body));
    },
  } as unknown as IncomingMessage;
  (req as unknown as { body?: unknown }).body = JSON.stringify(body);
  return req;
}

beforeEach(() => {
  authState.caller = null;
  dbState.settleCalls = [];
  dbState.settledRows = [];
});

describe('Endpoints de comptabilité : accès réservé au personnel', () => {
  it('refuse la lecture des paiements validés sans session', async () => {
    const { default: handler } = await import('../../api/finance/validated');
    const { res, state } = fakeRes();
    await handler(fakeReq('GET', {}), res);
    expect(state.status).toBe(401);
  });

  it('refuse la lecture des paiements validés à un parent', async () => {
    authState.caller = { userId: 'u1', username: 'parent1', role: 'client', establishmentId: null };
    const { default: handler } = await import('../../api/finance/validated');
    const { res, state } = fakeRes();
    await handler(fakeReq('GET', {}), res);
    expect(state.status).toBe(403);
  });

  it('refuse le règlement d’un paiement sans session', async () => {
    const { default: handler } = await import('../../api/finance/settle-payment');
    const { res, state } = fakeRes();
    await handler(fakeReq('POST', { paymentId: 'P-1' }), res);
    expect(state.status).toBe(401);
    expect(dbState.settleCalls).toHaveLength(0);
  });

  it('refuse le règlement d’un paiement à un parent', async () => {
    authState.caller = { userId: 'u1', username: 'parent1', role: 'client', establishmentId: null };
    const { default: handler } = await import('../../api/finance/settle-payment');
    const { res, state } = fakeRes();
    await handler(fakeReq('POST', { paymentId: 'P-1' }), res);
    expect(state.status).toBe(403);
    // Aucun règlement derrière : c'est le cœur de la protection.
    expect(dbState.settleCalls).toHaveLength(0);
  });

  it('le personnel règle un encaissement (horodatage posé par le serveur)', async () => {
    authState.caller = { userId: 'u2', username: 'caissier', role: 'personnel', establishmentId: null };
    const { default: handler } = await import('../../api/finance/settle-payment');
    const { res, state } = fakeRes();
    await handler(fakeReq('POST', { paymentId: 'P-42' }), res);
    expect(state.status).toBe(200);
    expect(dbState.settleCalls).toEqual(['P-42']);
    expect(state.body).toContain('settledAt');
  });

  it('refuse un règlement sans identifiant de paiement', async () => {
    authState.caller = { userId: 'u2', username: 'caissier', role: 'personnel', establishmentId: null };
    const { default: handler } = await import('../../api/finance/settle-payment');
    const { res, state } = fakeRes();
    await handler(fakeReq('POST', {}), res);
    expect(state.status).toBe(400);
    expect(dbState.settleCalls).toHaveLength(0);
  });
});
