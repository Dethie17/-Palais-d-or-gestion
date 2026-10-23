import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImportElevesPage from '@/pages/ImportElevesPage';
import { postAdminJson } from '@/lib/adminApi';
import type { SchoolCycle } from '@/types/menu';

vi.mock('@/lib/adminApi', () => ({ postAdminJson: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { username: 'daf', role: 'admin', firstName: 'DAF' },
    login: vi.fn(),
    loginParent: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    isAuthenticated: true,
    loading: false,
  }),
}));

const importStudentRow = vi.fn();
const refreshRemote = vi.fn(async () => undefined);

vi.mock('@/context/RestoContext', () => ({
  RestoProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useResto: () => ({
    parentProfiles: [
      { parentUsername: '776000001', firstName: 'Aminata', lastName: 'Fall', phone: '776000001' },
    ],
    children: [{ parentUsername: '776000001', firstName: 'Adama', lastName: 'Fall' }],
    importStudentRow: (...a: unknown[]) => importStudentRow(...a),
    refreshRemote: () => refreshRemote(),
  }),
}));

/**
 * Interface d'inscription automatique après création du parent :
 * elle s'ouvre dès que l'accès est créé, enchaîne les enfants un par
 * un (classe libre, cycle déduit) et se ferme sur « Terminer ».
 */
describe('Import Parent — interface d’inscription des enfants', () => {
  const creerAcces = () => screen.getByRole('button', { name: /créer l’accès/i });

  beforeEach(() => {
    importStudentRow.mockReset();
    refreshRemote.mockClear();
  });

  it('créer un parent ouvre l’interface d’inscription automatique, enchaîne deux enfants puis termine', async () => {
    vi.mocked(postAdminJson).mockResolvedValueOnce({
      ok: true,
      data: { created: [{ phone: '770333444', name: 'Ibra Ndiaye' }] },
    } as never);
    importStudentRow.mockResolvedValue({ childId: 'C-1', parentCreated: false, duplicate: false });

    render(<ImportElevesPage />);

    fireEvent.change(screen.getByPlaceholderText('Nom *'), { target: { value: 'Ndiaye' } });
    fireEvent.change(screen.getByPlaceholderText('Prénom *'), { target: { value: 'Ibra' } });
    fireEvent.change(screen.getByPlaceholderText('77 123 45 67 *'), { target: { value: '77 033 44 44' } });
    fireEvent.click(creerAcces());

    // L'interface s'ouvre automatiquement (session « nouveau parent »).
    await screen.findByTestId('child-create-panel');
    expect(screen.getByTestId('child-create-nouveau')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /inscrire ses enfants/i })).toBeInTheDocument();

    // 1er enfant — classe libre « cm2 » (minuscule) canonisée en « CM2 ».
    fireEvent.change(screen.getByTestId('child-create-firstname'), { target: { value: 'Mariama' } });
    fireEvent.change(screen.getByTestId('child-create-lastname'), { target: { value: 'Ndiaye' } });
    fireEvent.change(screen.getByTestId('child-create-classe'), { target: { value: 'cm2' } });
    expect(screen.getByTestId('child-create-apercu')).toHaveTextContent('CM2');
    fireEvent.click(screen.getByTestId('child-create-save'));

    await waitFor(() => expect(importStudentRow).toHaveBeenCalledTimes(1));
    expect(importStudentRow.mock.calls[0][0]).toMatchObject({ prenom: 'Mariama', nom: 'Ndiaye', classe: 'CM2', cycle: 'primaire' as SchoolCycle });
    await screen.findByText(/ajouter un autre enfant, ou terminer/i);

    // La session reste ouverte, champs réinitialisés pour l'enfant suivant.
    expect(screen.getByTestId('child-create-panel')).toBeInTheDocument();
    expect((screen.getByTestId('child-create-firstname') as HTMLInputElement).value).toBe('');

    // 2e enfant — classe inconnue « M4 » : acceptée telle quelle (repli primaire).
    importStudentRow.mockResolvedValue({ childId: 'C-2', parentCreated: false, duplicate: false });
    fireEvent.change(screen.getByTestId('child-create-firstname'), { target: { value: 'Ousmane' } });
    fireEvent.change(screen.getByTestId('child-create-lastname'), { target: { value: 'Ndiaye' } });
    fireEvent.change(screen.getByTestId('child-create-classe'), { target: { value: 'M4' } });
    expect(screen.getByTestId('child-create-apercu')).toHaveTextContent('M4');
    expect(screen.getByTestId('child-create-apercu')).toHaveTextContent(/hors référentiel/i);
    fireEvent.click(screen.getByTestId('child-create-save'));

    await waitFor(() => expect(importStudentRow).toHaveBeenCalledTimes(2));
    expect(importStudentRow.mock.calls[1][0]).toMatchObject({ prenom: 'Ousmane', nom: 'Ndiaye', classe: 'M4', cycle: 'primaire' as SchoolCycle });

    // « Terminer » ferme la session d'inscription.
    fireEvent.click(screen.getByTestId('child-create-terminer'));
    await waitFor(() => expect(screen.queryByTestId('child-create-panel')).not.toBeInTheDocument());
  });

  it('un doublon (parent déjà actif) n’ouvre PAS l’interface automatique', async () => {
    vi.mocked(postAdminJson).mockResolvedValueOnce({
      ok: true,
      data: { duplicates: [{ phone: '776000001', name: 'Aminata Fall' }] },
    } as never);

    render(<ImportElevesPage />);

    fireEvent.change(screen.getByPlaceholderText('Nom *'), { target: { value: 'Fall' } });
    fireEvent.change(screen.getByPlaceholderText('Prénom *'), { target: { value: 'Aminata' } });
    fireEvent.change(screen.getByPlaceholderText('77 123 45 67 *'), { target: { value: '776 000 00 1' } });
    fireEvent.click(creerAcces());

    await screen.findByText(/déjà enregistré et actif/i);
    expect(screen.queryByTestId('child-create-panel')).not.toBeInTheDocument();
  });
});
