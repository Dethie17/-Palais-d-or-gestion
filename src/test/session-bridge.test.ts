import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IncomingMessage } from 'node:http';

/**
 * Pont d'identification serveur, tant que la colonne `auth_id` n'existe pas.
 *
 * On vérifie deux choses à la fois :
 *  - un parent connecté est bien reconnu (sinon ses paiements restent 401) ;
 *  - l'identification par email NE s'ouvre QUE pour les comptes créés par
 *    notre inscription (marqueur app_metadata.oresto). Un compte Auth forgé
 *    ailleurs ne doit donc pas pouvoir usurper une fiche existante.
 */

const state = vi.hoisted(() => ({
  user: null as { id: string; email: string; app_metadata?: Record<string, unknown> } | null,
  users: [] as Record<string, unknown>[],
}));

vi.mock('../../api/_lib/supabaseAdmin', () => ({
  adminClient: () => ({
    from: (_table: string) => {
      const filters: [string, unknown][] = [];
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          filters.push([col, val]);
          return q;
        },
        maybeSingle: async () => {
          const found = state.users.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null;
          return { data: found, error: null };
        },
      };
      return q;
    },
  }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () =>
        state.user ? { data: { user: state.user }, error: null } : { data: { user: null }, error: { message: 'bad' } },
    },
  }),
}));

function fakeReq(token: string | null): IncomingMessage {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as unknown as IncomingMessage;
}

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon';
  state.users = [];
  state.user = null;
});

async function loadResolver() {
  const mod = await import('../../api/_lib/session');
  return mod.resolveCaller;
}

describe('Identification serveur — pont sans auth_id', () => {
  it('résout par auth_id quand la migration est faite', async () => {
    state.users = [{ username: 'awa', role: 'client', auth_id: 'uid-1', establishment_id: null }];
    state.user = { id: 'uid-1', email: 'awa@oresto-sn.com' };
    const resolveCaller = await loadResolver();
    const caller = await resolveCaller(fakeReq('tok'));
    expect(caller?.username).toBe('awa');
    expect(caller?.role).toBe('client');
  });

  it('retrouve un parent par email quand auth_id est absent', async () => {
    // Fiche sans auth_id (schéma actuel) + compte créé par notre inscription.
    state.users = [{ username: 'awa.ndiaye', role: 'client', establishment_id: null }];
    state.user = { id: 'uid-2', email: 'awa.ndiaye@oresto-sn.com', app_metadata: { oresto: 'parent' } };
    const resolveCaller = await loadResolver();
    const caller = await resolveCaller(fakeReq('tok'));
    expect(caller?.username).toBe('awa.ndiaye');
  });

  it('REFUSE le pont pour un compte Auth non créé par nous (anti-usurpation)', async () => {
    // Même email qu'une fiche « admin », mais compte forgé ailleurs : pas de marqueur.
    state.users = [{ username: 'admin', role: 'admin', establishment_id: null }];
    state.user = { id: 'uid-3', email: 'admin@oresto-sn.com', app_metadata: {} };
    const resolveCaller = await loadResolver();
    expect(await resolveCaller(fakeReq('tok'))).toBeNull();
  });

  it('refuse un email hors domaine', async () => {
    state.users = [{ username: 'awa', role: 'client', establishment_id: null }];
    state.user = { id: 'uid-4', email: 'awa@evil.com', app_metadata: { oresto: 'parent' } };
    const resolveCaller = await loadResolver();
    expect(await resolveCaller(fakeReq('tok'))).toBeNull();
  });

  it('refuse sans jeton', async () => {
    const resolveCaller = await loadResolver();
    expect(await resolveCaller(fakeReq(null))).toBeNull();
  });
});

describe('usernameFromAuthEmail', () => {
  it('extrait le nom d’un email interne, ignore tout le reste', async () => {
    const { usernameFromAuthEmail } = await import('../../api/_lib/username');
    expect(usernameFromAuthEmail('awa.ndiaye@oresto-sn.com')).toBe('awa.ndiaye');
    expect(usernameFromAuthEmail('AWA@OResto-SN.com')).toBe('awa');
    expect(usernameFromAuthEmail('awa@evil.com')).toBeNull();
    expect(usernameFromAuthEmail('@oresto-sn.com')).toBeNull();
    expect(usernameFromAuthEmail(null)).toBeNull();
  });
});

