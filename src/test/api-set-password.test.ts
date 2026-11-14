import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

const authState = vi.hoisted(() => ({
  caller: null as { userId: string; username: string; role: string; establishmentId: string | null } | null,
}));

const dbState = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  lookupError: null as { message: string } | null,
  updateError: null as { message: string } | null,
  updates: [] as { id: string; password: string }[],
}));

vi.mock('../../api/_lib/supabaseAdmin', () => ({
  adminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: dbState.profile, error: dbState.lookupError }),
        }),
      }),
    }),
    auth: {
      admin: {
        updateUserById: async (id: string, attrs: { password: string }) => {
          dbState.updates.push({ id, password: attrs.password });
          return { error: dbState.updateError };
        },
      },
    },
  }),
}));

vi.mock('../../api/_lib/session', async () => {
  const actual = await vi.importActual<typeof import('../../api/_lib/session')>(
    '../../api/_lib/session',
  );
  return {
    ...actual,
    requireRole: async (_req: IncomingMessage, res: ServerResponse, allowed: string[]) => {
      if (!authState.caller) {
        actual.unauthorized(res);
        return null;
      }
      if (!allowed.includes(authState.caller.role)) {
        actual.forbidden(res);
        return null;
      }
      return authState.caller as never;
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

function fakeReq(body: unknown, url: string): IncomingMessage {
  const req = {
    method: 'POST',
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
  dbState.profile = null;
  dbState.lookupError = null;
  dbState.updateError = null;
  dbState.updates = [];
});

describe('Réinitialisation de mot de passe', () => {
  it('réinitialise via /api/auth/create-user?action=set-password', async () => {
    authState.caller = { userId: 'u1', username: 'admin', role: 'admin', establishmentId: null };
    dbState.profile = { auth_id: 'auth-1' };
    const { default: handler } = await import('../../api/auth/create-user');
    const { res, state } = fakeRes();

    await handler(
      fakeReq(
        { username: 'Awa', password: 'secret123' },
        '/api/auth/create-user?action=set-password',
      ),
      res,
    );

    expect(state.status).toBe(200);
    expect(state.body).toContain('"ok":true');
    expect(dbState.updates).toEqual([{ id: 'auth-1', password: 'secret123' }]);
  });

  it('accepte encore l’ancienne route /api/auth/set-password', async () => {
    authState.caller = { userId: 'u1', username: 'admin', role: 'admin', establishmentId: null };
    dbState.profile = { auth_id: 'auth-1' };
    const { default: handler } = await import('../../api/auth/create-user');
    const { res, state } = fakeRes();

    await handler(
      fakeReq({ username: 'awa', password: 'secret123' }, '/api/auth/set-password'),
      res,
    );

    expect(state.status).toBe(200);
    expect(dbState.updates).toHaveLength(1);
  });

  it('refuse un rôle non autorisé', async () => {
    authState.caller = {
      userId: 'u1',
      username: 'superviseur',
      role: 'superviseur-dangote',
      establishmentId: 'e1',
    };
    dbState.profile = { auth_id: 'auth-1' };
    const { default: handler } = await import('../../api/auth/create-user');
    const { res, state } = fakeRes();

    await handler(
      fakeReq(
        { username: 'awa', password: 'secret123' },
        '/api/auth/create-user?action=set-password',
      ),
      res,
    );

    expect(state.status).toBe(403);
    expect(dbState.updates).toHaveLength(0);
  });

  it('refuse un appel sans session', async () => {
    const { default: handler } = await import('../../api/auth/create-user');
    const { res, state } = fakeRes();

    await handler(
      fakeReq(
        { username: 'awa', password: 'secret123' },
        '/api/auth/create-user?action=set-password',
      ),
      res,
    );

    expect(state.status).toBe(401);
    expect(dbState.updates).toHaveLength(0);
  });

  it('refuse un mot de passe trop court', async () => {
    authState.caller = { userId: 'u1', username: 'admin', role: 'admin', establishmentId: null };
    dbState.profile = { auth_id: 'auth-1' };
    const { default: handler } = await import('../../api/auth/create-user');
    const { res, state } = fakeRes();

    await handler(
      fakeReq(
        { username: 'awa', password: 'court' },
        '/api/auth/create-user?action=set-password',
      ),
      res,
    );

    expect(state.status).toBe(400);
    expect(dbState.updates).toHaveLength(0);
  });
});
