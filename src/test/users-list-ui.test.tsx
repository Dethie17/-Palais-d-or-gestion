import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider } from '@/context/AuthContext';
import { RestoProvider, useResto } from '@/context/RestoContext';
import UsersPage from '@/pages/UsersPage';

type Api = ReturnType<typeof useResto>;

/**
 * Session de test ADMIN : la page Utilisateurs porte des rappels visibles
 * uniquement de la Direction (porte de création des accès parent). Le mock
 * global (src/test/setup.ts) renvoie un profil « client » : ici, la chaîne
 * PostgREST simulée redonne le même comportement, avec un rôle admin.
 */
vi.mock('@/lib/supabase', async (importOriginal) => {
  const base = await importOriginal<typeof import('@/lib/supabase')>();
  const TEST_AUTH_UID = '00000000-0000-4000-8000-000000000001';
  const TEST_PROFILE = {
    username: 'admin',
    role: 'admin',
    establishment_id: null,
    auth_id: TEST_AUTH_UID,
  };
  const terminal = { data: null, error: null };
  const makeChain = (table?: string, state: { columns?: string } = {}): Record<string, unknown> => {
    const resolve = (cb?: (v: unknown) => unknown) => {
      const isProfileRead =
        table === 'users' && typeof state.columns === 'string' && state.columns.includes('username');
      return Promise.resolve(isProfileRead ? { data: TEST_PROFILE, error: null } : terminal).then(
        cb as never,
      );
    };
    return new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') return resolve;
          if (prop === 'data' || prop === 'error') return null;
          if (prop === 'select') return (cols?: string) => ((state.columns = cols), makeChain(table, state));
          if (typeof prop === 'string' && prop !== 'then') return () => makeChain(table, state);
          return undefined;
        },
      },
    );
  };
  return {
    isSupabaseConfigured: true,
    supabase: {
      from: (table: string) => makeChain(table),
      rpc: () => makeChain(),
      auth: {
        getSession: () =>
          Promise.resolve({
            data: {
              session: {
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token',
                expires_in: 3600,
                token_type: 'bearer',
                user: { id: TEST_AUTH_UID, aud: 'authenticated', email: 'admin@oresto-sn.com' },
              },
            },
            error: null,
          }),
        signInWithPassword: () => Promise.resolve({ data: null, error: null }),
        signOut: () => Promise.resolve({ error: null }),
        updateUser: () => Promise.resolve({ data: { user: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    },
  };
});

function Harness({ onReady }: { onReady: (api: Api) => void }) {
  const api = useResto();
  onReady(api);
  return null;
}

function mountUsers() {
  let api!: Api;
  render(
    <AuthProvider>
      <RestoProvider>
        <Harness onReady={(a) => { api = a; }} />
        <UsersPage />
      </RestoProvider>
    </AuthProvider>,
  );
  return { latest: () => api };
}

beforeEach(() => {
  window.localStorage.clear();
});

/**
 * La liste Utilisateurs est un registre : plus de formulaire de création
 * (déplacé dans Import → Import Parent), un tableau de suivi lisible.
 */
describe('Utilisateurs — liste professionnelle', () => {
  it('ne contient plus le formulaire de création de compte', async () => {
    mountUsers();
    await screen.findByRole('heading', { name: /utilisateurs/i });
    expect(screen.queryByTestId('create-parent-form')).not.toBeInTheDocument();
    expect(screen.queryByText(/créer un compte parent/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Import → Import Parent/)).toBeInTheDocument();
  });

  it('affiche les parents en tableau avec identifiant, enfants et actions', async () => {
    const { latest } = mountUsers();
    await screen.findByRole('heading', { name: /utilisateurs/i });

    act(() => { latest().saveParentProfile('771234567', 'Awa', 'Diallo', '771234567'); });
    act(() => { latest().addChild('771234567', 'Moussa', 'Diallo', 'CE2', 'primaire'); });

    expect(await screen.findByTestId('users-table')).toBeInTheDocument();
    expect(screen.getByText('Diallo Awa')).toBeInTheDocument();
    expect(screen.getByText('77 123 45 67')).toBeInTheDocument();
    expect(screen.getByText(/Moussa Diallo · CE2/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /supprimer/i }).length).toBeGreaterThanOrEqual(1);

    // Les colonnes du registre professionnel (le suivi « dernière validation »
    // a été retiré : la carte prépayée et l'historique le montrent déjà).
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.trim());
    expect(headers).toEqual([
      'Parent', 'Identifiant', 'Enfants', 'Abonnement', 'Repas', 'État', 'Actions',
    ]);

    // L'identifiant du parent EST son numéro : c'est ce qu'il communique
    // à sa famille pour se connecter à l'Espace Abonné.
    const identifiant = screen.getByRole('columnheader', { name: /identifiant/i });
    expect(identifiant).toBeInTheDocument();
    const row = screen.getByText('Diallo Awa').closest('tr');
    expect(row?.textContent).toContain('77 123 45 67');
  });
});
