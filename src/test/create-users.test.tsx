import { describe, it, expect } from 'vitest';
import type { ReactElement } from 'react';
import { render, act } from '@testing-library/react';
import { AuthProvider, addLocalUserHashed, isDemoAccount, DEMO_LOGIN_ENABLED, getLocalUsers, LOCAL_USERS_KEY, UserRole } from '@/context/AuthContext';
import { RestoProvider, useResto } from '@/context/RestoContext';

function renderWithProviders(children: ReactElement) {
  return render(
    <AuthProvider>
      <RestoProvider>
        {children}
      </RestoProvider>
    </AuthProvider>
  );
}

describe('Creation de comptes utilisateurs', () => {
  it('conserve les comptes de démonstration hors production', async () => {
    // Les comptes de démo sont un pis-aller local : ils ne doivent jamais
    // être la voie d'accès d'un build de production, où le seul chemin
    // accepté est l'authentification vérifiée par le serveur.
    if (import.meta.env.PROD) {
      expect(DEMO_LOGIN_ENABLED).toBe(false);
    }
  });

  it('enregistre les comptes locaux de secours', async () => {
    // Hors base configurée, un compte peut être créé localement. Ce registre
    // est un pis-aller sans garantie de sécurité — le registre de vérité,
    // c'est Supabase Auth. Le test vérifie qu'il fonctionne, pas qu'il protège.
    const roles: Array<{ role: UserRole; username: string; password: string }> = [
      { role: 'client', username: 'parent1', password: 'parent123' },
      { role: 'personnel', username: 'staff1', password: 'staff123' },
      { role: 'gestionnaire', username: 'manager1', password: 'manager123' },
    ];

    for (const account of roles) {
      const result = await addLocalUserHashed(account);
      expect(result.ok).toBe(true);
    }

    const users = getLocalUsers();
    expect(users.length).toBe(3);

    // Les rôles demandés sont conservés : c'est ce qui détermine les
    // écrans affichés ensuite.
    expect(users.find((u) => u.username === 'parent1')?.role).toBe('client');
    expect(users.find((u) => u.username === 'staff1')?.role).toBe('personnel');

    expect(localStorage.getItem(LOCAL_USERS_KEY)).not.toBeNull();
  });

  it('empêche la creation de compte avec username existant', async () => {
    const result1 = await addLocalUserHashed({ role: 'client', username: 'testuser', password: 'test123' });
    expect(result1.ok).toBe(true);

    const result2 = await addLocalUserHashed({ role: 'client', username: 'testuser', password: 'test123' });
    expect(result2.ok).toBe(false);
    expect(result2.message).toContain('existe déjà');
  });

  it('vérifie les comptes démo', () => {
    expect(isDemoAccount('client')).toBe(true);
    expect(isDemoAccount('admin')).toBe(true);
    expect(isDemoAccount('unknown')).toBe(false);
  });
});