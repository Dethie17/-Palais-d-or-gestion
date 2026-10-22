import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider } from '@/context/AuthContext';
import { RestoProvider, useResto } from '@/context/RestoContext';
import UsersPage from '@/pages/UsersPage';

type Api = ReturnType<typeof useResto>;

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
