import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { xlsxFile } from '@/test/helpers/xlsxFixture';
import { RestoProvider } from '@/context/RestoContext';
import ImportElevesPage from '@/pages/ImportElevesPage';

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

function parentWorkbook(rows: unknown[][]): Promise<File> {
  return xlsxFile(rows, 'parents.xlsx', 'Parents');
}

/**
 * Import Parent : la DAF crée les accès parents par numéro de téléphone,
 * sans mot de passe. Les élèves ne s'importent plus ici : ils sont créés
 * automatiquement avec leur parent.
 */
describe('Import Parent', () => {
  it('affiche directement le formulaire sans mot de passe (plus d’onglet élèves)', () => {
    render(
      <RestoProvider>
        <ImportElevesPage />
      </RestoProvider>,
    );

    expect(screen.getByRole('heading', { name: /import/i })).toBeInTheDocument();

    expect(screen.getByTestId('parent-create-form')).toBeInTheDocument();
    expect(screen.getByText(/aucun mot de passe n’est créé/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Nom *')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Prénom *')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('77 123 45 67 *')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/mot de passe/i)).not.toBeInTheDocument();
    expect(screen.getByText(/prenom · nom · telephone/)).toBeInTheDocument();
    expect(screen.getByText('Parents enregistrés')).toBeInTheDocument();
  });

  it('analyse un fichier parents et chiffre les accès à créer', async () => {
    const { container } = render(
      <RestoProvider>
        <ImportElevesPage />
      </RestoProvider>,
    );

    const file = await parentWorkbook([
      ['prenom', 'nom', 'telephone'],
      ['Awa', 'Diallo', '77 123 45 67'],
      ['Moussa', 'Ndiaye', '76 000 00 00'],
      ['Sans', 'Numero', '123'],
    ]);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/Confirmer : créer 2 accès parents/)).toBeInTheDocument();
    expect(screen.getByText('Awa Diallo')).toBeInTheDocument();
    expect(screen.getByText('77 123 45 67')).toBeInTheDocument();
    expect(screen.getByText(/Ligne 4 : téléphone invalide/)).toBeInTheDocument();
  });
});
