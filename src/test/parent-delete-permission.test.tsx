import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { canAccess, peutSupprimerParent, ROLE_PAGES } from '@/lib/permissions';
import { UserRole } from '@/context/AuthContext';
import UsersPage from '@/pages/UsersPage';
import SpaceTopNav from '@/components/layout/SpaceTopNav';

/**
 * Suppression définitive d'un parent : permise au Superviseur (personnel)
 * et au DG (Espace ISM = admin) — pas au Caissier ni au parent.
 * Le serveur /api/auth/delete-user applique la même règle (voir
 * src/test/api-delete-parent-guard.test.ts) ; ici, le bouton et sa garde UI.
 */

const états = vi.hoisted(() => ({ user: null as { username: string; role: UserRole } | null }));
vi.mock('@/context/AuthContext', () => ({
  UserRole: {},
  useAuth: () => ({
    user: états.user,
    login: vi.fn(),
    loginParent: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    isAuthenticated: true,
    loading: false,
  }),
}));

const api = vi.hoisted(() => ({ importer: null as ((row: unknown) => void) | null }));
vi.mock('@/context/RestoContext', () => ({
  RestoProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useResto: () => ({
    subscriptions: [
      { clientUsername: '771111111', status: 'active', formulaId: 'F2', mealsRemaining: 10 },
    ],
    formulas: [],
    validations: [],
    myChildren: () => [],
    parentProfiles: [
      { parentUsername: '771111111', firstName: 'Awa', lastName: 'Diallo', phone: '771111111' },
    ],
    deleteParent: vi.fn(async () => ({ ok: true })),
    inactiveParents: null,
    isParentInactive: () => false,
    setParentActive: vi.fn(),
  }),
}));

function hop(role: UserRole) {
  états.user = { username: `session-${role}`, role };
  return render(<UsersPage />);
}

describe('Permission — suppression définitive d’un parent', () => {
  it('matrice : Superviseur et DG oui — Caissier et Parent non', () => {
    expect(peutSupprimerParent('personnel')).toBe(true);
    expect(peutSupprimerParent('admin')).toBe(true);
    expect(peutSupprimerParent('gestionnaire')).toBe(false);
    expect(peutSupprimerParent('client')).toBe(false);
    expect(peutSupprimerParent(undefined)).toBe(false);

    // La page reste ouverte aux deux profils autorisés, jamais à la caisse.
    expect(canAccess('personnel', 'users')).toBe(true);
    expect(canAccess('admin', 'users')).toBe(true);
    expect(canAccess('gestionnaire', 'users')).toBe(false);
    expect(ROLE_PAGES.gestionnaire).not.toContain('users');
  });

  it('matrice : Superviseur a le menu mais plus « Mon compte »', () => {
    expect(canAccess('personnel', 'menu')).toBe(true);
    expect(canAccess('personnel', 'profile')).toBe(false);
    expect(ROLE_PAGES.personnel).toContain('menu');
    expect(ROLE_PAGES.personnel).not.toContain('profile');
  });

  it('matrice : Caissier et Parent n’ont plus « Mon compte »', () => {
    expect(canAccess('gestionnaire', 'profile')).toBe(false);
    expect(canAccess('client', 'profile')).toBe(false);
    expect(ROLE_PAGES.gestionnaire).not.toContain('profile');
    expect(ROLE_PAGES.client).not.toContain('profile');
  });

  it('matrice Dangote : plus de page « Entités » pour les rôles Dangote', () => {
    expect(canAccess('rh', 'entities')).toBe(false);
    expect(canAccess('superviseur-dangote', 'entities')).toBe(false);
    expect(canAccess('employe-dangote', 'entities')).toBe(false);
    expect(ROLE_PAGES.rh).not.toContain('entities');
    expect(ROLE_PAGES['superviseur-dangote']).not.toContain('entities');
    expect(ROLE_PAGES['employe-dangote']).not.toContain('entities');
  });

  it('nav Superviseur : « Gestion du menu » visible, « Mon compte » absent', () => {
    états.user = { username: 'session-personnel', role: 'personnel' };
    render(<SpaceTopNav currentPage="home" onNavigate={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /Gestion du menu/i }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('button', { name: /Mon compte/i })).toHaveLength(0);
  });

  it('nav Dangote : plus d’entrée « Entités »', () => {
    états.user = { username: 'session-rh', role: 'rh' };
    render(<SpaceTopNav currentPage="dangote-rh" onNavigate={vi.fn()} />);
    expect(screen.queryAllByRole('button', { name: /Entités/i })).toHaveLength(0);
  });

  it('le Superviseur voit le bouton Supprimer', async () => {
    hop('personnel');
    await screen.findByRole('heading', { name: /utilisateurs/i });
    expect(screen.getAllByRole('button', { name: /supprimer/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('le DG (Espace ISM) voit le bouton Supprimer', async () => {
    hop('admin');
    await screen.findByRole('heading', { name: /utilisateurs/i });
    expect(screen.getAllByRole('button', { name: /supprimer/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('le Caissier ne voit pas le bouton Supprimer', async () => {
    hop('gestionnaire');
    await screen.findByRole('heading', { name: /utilisateurs/i });
    expect(screen.queryByRole('button', { name: /supprimer/i })).not.toBeInTheDocument();
  });

  it('le Parent ne voit pas le bouton Supprimer', async () => {
    hop('client');
    await screen.findByRole('heading', { name: /utilisateurs/i });
    expect(screen.queryByRole('button', { name: /supprimer/i })).not.toBeInTheDocument();
  });
});
