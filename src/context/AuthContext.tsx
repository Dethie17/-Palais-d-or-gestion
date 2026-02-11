import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export type UserRole = 'caissier' | 'manager';

export interface User {
  username: string;
  role: UserRole;
  password: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Charger l'utilisateur depuis sessionStorage au démarrage
    const savedUser = sessionStorage.getItem('miam-current-user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (error) {
        console.error('Erreur chargement session:', error);
        sessionStorage.removeItem('miam-current-user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      // Vérifier les credentials dans Supabase
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .single();

      if (error || !data) {
        console.error('Erreur authentification:', error);
        return false;
      }

      // Utilisateur trouvé, créer la session
      const authenticatedUser: User = {
        username: data.username,
        role: data.role as UserRole,
        password: '', // Ne jamais stocker le mot de passe en session
      };

      setUser(authenticatedUser);
      sessionStorage.setItem('miam-current-user', JSON.stringify(authenticatedUser));
      return true;
    } catch (error) {
      console.error('Erreur login:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    sessionStorage.removeItem('miam-current-user');
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
    if (!user) return false;

    try {
      // Vérifier le mot de passe actuel
      const { data: foundUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('username', user.username)
        .eq('password', currentPassword)
        .single();

      if (fetchError || !foundUser) {
        console.error('Mot de passe actuel incorrect');
        return false;
      }

      // Mettre à jour le mot de passe
      const { error: updateError } = await supabase
        .from('users')
        .update({ password: newPassword })
        .eq('username', user.username);

      if (updateError) {
        console.error('Erreur mise à jour mot de passe:', updateError);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Erreur changement mot de passe:', error);
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        changePassword,
        isAuthenticated: user !== null,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
