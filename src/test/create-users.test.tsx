import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { AuthProvider, addLocalUserHashed, isDemoAccount, DEMO_LOGIN_ENABLED, getLocalUsers, LOCAL_USERS_KEY, UserRole } from '@/context/AuthContext';
import { RestoProvider, useResto } from '@/context/RestoContext';

function renderWithProviders(children: any) {
  return render(
    <AuthProvider>
      <RestoProvider>
        {children}
      </RestoProvider>
    </AuthProvider>
  );
}

describe('Creation de comptes utilisateurs', () => {
  it('devrait hasher les mots de passe', async () => {
    // Test du hashage de mot de passe
    const { hashPassword } = await import('@/lib/password');
    const hash = await hashPassword('test123');
    expect(hash).toMatch(/^sha256-/);
  });

  it('devrait ajouter des comptes utilisateurs locaux avec hash', async () => {
    // Creation de comptes locaux pour chaque role
    const roles: Array<{ role: UserRole; username: string; password: string }> = [
      { role: 'client', username: 'parent1', password: 'parent123' },
      { role: 'personnel', username: 'staff1', password: 'staff123' },
      { role: 'gestionnaire', username: 'manager1', password: 'manager123' },
    ];
    
    for (const account of roles) {
      const result = await addLocalUserHashed(account);
      expect(result.ok).toBe(true);
    }
    
    // Vérifier que les comptes ont été créés dans localStorage
    const users = getLocalUsers();
    expect(users.length).toBe(3);
    
    // Vérifier que les mots de passe sont hachés (pas en clair)
    for (const user of users) {
      expect(user.password).not.toMatch(/^parent123$/);
      expect(user.password).not.toMatch(/^staff123$/);
      expect(user.password).not.toMatch(/^manager123$/);
      expect(user.password).toMatch(/^sha256-/); // Doit commencer par sha256-
    }
    
    // Vérifier la clé de stockage
    const storedKey = localStorage.getItem(LOCAL_USERS_KEY);
    expect(storedKey).not.toBeNull();
  });

  it('devrait empêcher la creation de compte avec username existant', async () => {
    // Deux fois le même compte devrait échouer la deuxième fois
    const result1 = await addLocalUserHashed({ role: 'client', username: 'testuser', password: 'test123' });
    expect(result1.ok).toBe(true);
    
    const result2 = await addLocalUserHashed({ role: 'client', username: 'testuser', password: 'test123' });
    expect(result2.ok).toBe(false);
    expect(result2.message).toContain('existe déjà');
  });

  it('devrait vérifier les comptes démo', () => {
    expect(isDemoAccount('client')).toBe(true);
    expect(isDemoAccount('admin')).toBe(true);
    expect(isDemoAccount('unknown')).toBe(false);
    expect(DEMO_LOGIN_ENABLED).toBe(true);
  });
});