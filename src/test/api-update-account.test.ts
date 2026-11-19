import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { legacyPasswordHash } from '../../api/_lib/profile';

const authState = vi.hoisted(() => ({
  caller: null as { userId: string; username: string; role: string; establishmentId: string | null } | null,
}));

const dbState = vi.hoisted(() => ({
  authUser: { email: 'admin@oresto-sn.com' } as { email: string | null } | null,
  authUsers: [] as { id: string; email: string }[],
  profilePassword: null as string | null,
  existingUsername: null as { username: string } | null,
  lookupError: null as { message: string } | null,
  profileUpdateError: null as { message: string; code?: string } | null,
  authUpdateError: null as { message: string } | null,
  signInError: null as { message: string } | null,
  signInSession: true,
  updates: [] as { table: string; values: Record<string, unknown>; col: string; val: string }[],
  authUpdates: [] as { id: string; attrs: Record<string, unknown> }[],
  signIns: [] as { email: string; password: string }[],
}));

vi.mock('../../api/_lib/supabaseAdmin', () => ({
  adminClient: () => ({
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (col: string, val: string) => ({
          maybeSingle: async () => {
            if (dbState.lookupError) return { data: null, error: dbState.lookupError };
            if (table === 'users' && columns === 'password') {
              return {
                data: dbState.profilePassword == null ? null : { password: dbState.profilePassword },
                error: null,
              };
            }
            if (table === 'users' && columns === 'username') {
              return { data: dbState.existingUsername, error: null };
            }
            void col;
            void val;
            return { data: null, error: null };
          },
        }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: async (col: string, val: string) => {
          dbState.updates.push({ table, values, col, val });
          return { error: dbState.profileUpdateError };
        },
      }),
    }),
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: dbState.authUser },
          error: dbState.authUser ? null : { message: 'not found' },
        }),
        updateUserById: async (id: string, attrs: Record<string, unknown>) => {
          dbState.authUpdates.push({ id, attrs });
          return { error: dbState.authUpdateError };
        },
        listUsers: async () => ({ data: { users: dbState.authUsers }, error: null }),
      },
    },
  }),
  passwordAuthClient: () => ({
    auth: {
      signInWithPassword: async (credentials: { email: string; password: string }) => {
        dbState.signIns.push(credentials);
        return {
          data: { session: dbState.signInSession ? { access_token: 'token' } : null },
          error: dbState.signInError,
        };
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

vi.mock('../../api/_lib/rateLimit', () => ({
  enforceKeyRateLimit: () => true,
}));

vi.mock('../../api/_lib/http', async () => {
  const actual = await vi.importActual<typeof import('../../api/_lib/http')>(
    '../../api/_lib/http',
  );
  return { ...actual, rejectForeignOrigin: () => false };
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

function fakeReq(body: unknown): IncomingMessage {
  const req = {
    method: 'POST',
    url: '/api/auth/create-user?action=update-account',
    headers: {},
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body));
    },
  } as unknown as IncomingMessage;
  (req as unknown as { body?: unknown }).body = JSON.stringify(body);
  return req;
}

beforeEach(() => {
  authState.caller = {
    userId: 'auth-1',
    username: 'admin',
    role: 'admin',
    establishmentId: null,
  };
  dbState.authUser = { email: 'admin@oresto-sn.com' };
  dbState.authUsers = [];
  dbState.profilePassword = null;
  dbState.existingUsername = null;
  dbState.lookupError = null;
  dbState.profileUpdateError = null;
  dbState.authUpdateError = null;
  dbState.signInError = null;
  dbState.signInSession = true;
  dbState.updates = [];
  dbState.authUpdates = [];
  dbState.signIns = [];
});

describe('Auto-gestion du compte ISM', () => {
  it('change le mot de passe après vérification du mot de passe actuel', async () => {
    const { default: handler } = await import('../../api/auth/create-user');
    const { res, state } = fakeRes();

    await handler(fakeReq({ currentPassword: 'ancien123', newPassword: 'nouveau123' }), res);

    expect(state.status).toBe(200);
    expect(dbState.signIns).toEqual([{ email: 'admin@oresto-sn.com', password: 'ancien123' }]);
    expect(dbState.authUpdates).toEqual([{ id: 'auth-1', attrs: { password: 'nouveau123' } }]);
    expect(dbState.updates).toContainEqual({
      table: 'users',
      values: { password: legacyPasswordHash('nouveau123') },
      col: 'username',
      val: 'admin',
    });
  });

  it('refuse un mot de passe actuel incorrect', async () => {
    dbState.signInError = { message: 'invalid credentials' };
    dbState.signInSession = false;
    const { default: handler } = await import('../../api/auth/create-user');
    const { res, state } = fakeRes();

    await handler(fakeReq({ currentPassword: 'faux', newPassword: 'nouveau123' }), res);

    expect(state.status).toBe(401);
    expect(dbState.authUpdates).toHaveLength(0);
  });

  it('accepte l’empreinte historique quand Supabase refuse le mot de passe', async () => {
    dbState.signInError = { message: 'invalid credentials' };
    dbState.signInSession = false;
    dbState.profilePassword = legacyPasswordHash('ancien123');
    const { default: handler } = await import('../../api/auth/create-user');
    const { res, state } = fakeRes();

    await handler(fakeReq({ currentPassword: 'ancien123', newPassword: 'nouveau123' }), res);

    expect(state.status).toBe(200);
    expect(dbState.authUpdates).toEqual([{ id: 'auth-1', attrs: { password: 'nouveau123' } }]);
  });

  it('change l’identifiant Auth et la fiche users ensemble', async () => {
    const { default: handler } = await import('../../api/auth/create-user');
    const { res, state } = fakeRes();

    await handler(
      fakeReq({ currentPassword: 'ancien123', newUsername: 'direction.ism' }),
      res,
    );

    expect(state.status).toBe(200);
    expect(state.body).toContain('"username":"direction.ism"');
    expect(dbState.authUpdates).toHaveLength(1);
    expect(dbState.authUpdates[0].attrs).toMatchObject({
      email: 'direction.ism@oresto-sn.com',
      email_confirm: true,
    });
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0]).toMatchObject({
      table: 'users',
      col: 'username',
      val: 'admin',
    });
    expect(dbState.updates[0].values.username).toBe('direction.ism');
  });

  it('refuse un identifiant déjà pris', async () => {
    dbState.existingUsername = { username: 'direction.ism' };
    const { default: handler } = await import('../../api/auth/create-user');
    const { res, state } = fakeRes();

    await handler(
      fakeReq({ currentPassword: 'ancien123', newUsername: 'direction.ism' }),
      res,
    );

    expect(state.status).toBe(409);
    expect(dbState.authUpdates).toHaveLength(0);
    expect(dbState.updates).toHaveLength(0);
  });

  it('refuse un mot de passe trop court sans écriture', async () => {
    const { default: handler } = await import('../../api/auth/create-user');
    const { res, state } = fakeRes();

    await handler(fakeReq({ currentPassword: 'ancien123', newPassword: 'court' }), res);

    expect(state.status).toBe(400);
    expect(dbState.authUpdates).toHaveLength(0);
    expect(dbState.updates).toHaveLength(0);
  });

  it('refuse un rôle non admin', async () => {
    authState.caller = {
      userId: 'u2',
      username: 'rh-dangote',
      role: 'rh',
      establishmentId: null,
    };
    const { default: handler } = await import('../../api/auth/create-user');
    const { res, state } = fakeRes();

    await handler(fakeReq({ currentPassword: 'ancien123', newPassword: 'nouveau123' }), res);

    expect(state.status).toBe(403);
    expect(dbState.signIns).toHaveLength(0);
  });
});
