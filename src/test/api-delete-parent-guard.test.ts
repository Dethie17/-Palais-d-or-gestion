import { describe, it, expect, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Suppression définitive d'un parent : /api/auth/delete-user est réservé au
 * Superviseur (personnel) et au DG (admin). Le Caissier (gestionnaire) et le
 * parent (client) se voient refuser l'opération — le Superviseur ne peut
 * viser que des comptes PARENT, le DG aussi les comptes du personnel.
 */

const auth = vi.hoisted(() => ({
  caller: null as { userId: string; username: string; role: string; establishmentId: string | null } | null,
}));

const db = vi.hoisted(() => ({
  users: [] as { username: string; role: string; auth_id?: string | null }[],
  children: [] as { id: string; parent_username: string }[],
}));

function fakeQuery(table: string) {
  const state: { f: [string, unknown][]; op: 'select' | 'delete' | 'update' } = { f: [], op: 'select' };
  const rowsFor = (): { [k: string]: unknown }[] => {
    if (table === 'users') return db.users;
    if (table === 'children') return db.children;
    return [];
  };
  const filtered = () => rowsFor().filter((r) => state.f.every(([c, v]) => (
    Array.isArray(v) ? (v as unknown[]).includes(r[c]) : r[c] === v
  )));
  const handle: Record<string, unknown> = {
    select: () => handle,
    eq: (c: string, v: unknown) => { state.f.push([c, v]); return handle; },
    in: (c: string, arr: unknown) => { state.f.push([c, arr]); return handle; },
    update: () => { state.op = 'update'; return handle; },
  };
  let pending: Promise<{ data?: unknown; count?: number | null; error: null }> | null = null;
  Object.defineProperty(handle, 'delete', {
    get: () => () => { state.op = 'delete'; return handle; },
  });
  handle.maybeSingle = async () => ({ data: filtered()[0] ?? null, error: null });
  function resolveNow() {
    if (state.op === 'delete') return Promise.resolve({ count: filtered().length, error: null });
    if (state.op === 'update') return Promise.resolve({ data: [], error: null });
    return Promise.resolve({ data: filtered(), error: null });
  }
  handle.then = (cb?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
    const p = pending ?? resolveNow();
    pending = p;
    return p.then(cb as never, reject as never);
  };
  return handle;
}

vi.mock('../../api/_lib/supabaseAdmin', () => ({
  SupabaseAdminConfigError: class extends Error {},
  adminClient: () => ({
    from: (table: string) => fakeQuery(table),
    auth: { admin: { deleteUser: vi.fn(async () => ({ data: {}, error: null })) } },
  }),
}));

vi.mock('../../api/_lib/parentAuth', () => ({
  authEmailForUser: (username: string) => `${username}@oresto-sn.com`,
  findAuthUserByEmail: async () => null,
}));

vi.mock('../../api/_lib/session', async () => {
  const actual = await vi.importActual<typeof import('../../api/_lib/session')>(
    '../../api/_lib/session',
  );
  return {
    ...actual,
    requireRole: async (req: IncomingMessage, res: ServerResponse, allowed: string[]) => {
      const caller = auth.caller;
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

import deleteUserHandler from '../../api/auth/delete-user';

function fakeRes() {
  const state = { status: 0, body: '' };
  const res = {
    writeHead(status: number) { state.status = status; },
    end(chunk?: string) { state.body = chunk ?? ''; },
  };
  return { res: res as unknown as ServerResponse, state };
}

function fakeReq(body: unknown): IncomingMessage {
  const req = {
    method: 'POST',
    headers: {},
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body));
    },
  } as unknown as IncomingMessage;
  (req as unknown as { body?: unknown }).body = JSON.stringify(body);
  return req;
}

const parent = { username: 'parent-a1', role: 'client', auth_id: 'auth-1' };
const caissier = { username: 'caissier-a2', role: 'gestionnaire', auth_id: 'auth-2' };

function send(caller: typeof auth.caller, target: string) {
  auth.caller = caller;
  db.users = [parent, caissier];
  db.children = [{ id: 'C-1', parent_username: 'parent-a1' }];
  return async () => {
    const { res, state } = fakeRes();
    await deleteUserHandler(fakeReq({ username: target }), res);
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(state.body) as Record<string, unknown>; } catch { /* brut */ }
    return { status: state.status, body };
  };
}

describe('delete-user — suppression réservée au Superviseur et au DG', () => {
  it('le Superviseur supprime un parent (client)', async () => {
    const run = send({ userId: 'u1', username: 'sup', role: 'personnel', establishmentId: null }, 'parent-a1');
    const { status, body } = await run();
    expect(body, `status=${status} body=${JSON.stringify(body)}`).toMatchObject({ ok: true, username: 'parent-a1' });
    expect(status).toBe(200);
  });

  it('le DG supprime un parent — et aussi un compte du personnel', async () => {
    const run = send({ userId: 'u2', username: 'dg', role: 'admin', establishmentId: null }, 'parent-a1');
    expect((await run()).status).toBe(200);

    const runStaff = send({ userId: 'u2', username: 'dg', role: 'admin', establishmentId: null }, 'caissier-a2');
    const { status, body } = await runStaff();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('le superviseur ne supprime PAS un collègue du staff', async () => {
    const run = send({ userId: 'u1', username: 'sup', role: 'personnel', establishmentId: null }, 'caissier-a2');
    const { status, body } = await run();
    expect(status).toBe(403);
    expect(body.error).toMatch(/seuls les comptes parents/i);
  });

  it('le Caissier (gestionnaire) est refusé', async () => {
    const run = send({ userId: 'u3', username: 'caisse', role: 'gestionnaire', establishmentId: null }, 'parent-a1');
    const { status, body } = await run();
    expect(status).toBe(403);
    expect(body.error).toMatch(/droits insuffisants/i);
  });

  it('le parent (client) est refusé', async () => {
    const run = send({ userId: 'u4', username: 'parent-a1', role: 'client', establishmentId: null }, 'parent-a1');
    const { status, body } = await run();
    expect(status).toBe(403);
  });

  it('sans session, aucun accès', async () => {
    const run = send(null, 'parent-a1');
    const { status, body } = await run();
    expect(status).toBe(401);
    expect(body.ok).toBe(false);
  });
});
