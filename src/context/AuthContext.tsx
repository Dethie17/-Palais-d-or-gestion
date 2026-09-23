import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getClientQrToken } from '@/lib/clientQr';

export type UserRole = 'client' | 'personnel' | 'gestionnaire' | 'admin' | 'caissier' | 'manager';

export interface User {
  username: string;
  role: UserRole;
  password: string;
  qrToken?: string;
  establishmentId?: string;
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

const SESSION_KEY = 'o-resto-current-user';
const LEGACY_SESSION_KEY = 'palais-d-or-current-user';

// Comptes de démonstration O RESTO (utilisés si Supabase ne répond pas / table users non migrée)
// Le QR Code est personnel et stable : attribué à la connexion via getClientQrToken.
const DEMO_ACCOUNTS: Record<string, User> = {
  client: { username: 'client', role: 'client', password: 'client123' },
  personnel: { username: 'personnel', role: 'personnel', password: 'personnel123' },
  gestionnaire: { username: 'gestionnaire', role: 'gestionnaire', password: 'gestionnaire123' },
  admin: { username: 'admin', role: 'admin', password: 'admin123' },
  caissier: { username: 'caissier', role: 'caissier', password: 'caissier123' },
  manager: { username: 'manager', role: 'manager', password: 'manager123' },
};

function toSessionUser(base: Pick<User, 'username' | 'role'>, establishmentId?: string): User {
  return {
    username: base.username,
    role: base.role,
    password: '', // Ne jamais stocker le mot de passe en session
    qrToken: getClientQrToken(base.username),
    establishmentId,
  };
}

/**
 * Registre LOCAL des comptes créés depuis Paramètres.
 * Si Supabase est injoignable, les comptes créés y sont quand même
 * enregistrés ici — leurs utilisateurs peuvent donc toujours se connecter.
 */
export interface LocalAccount {
  username: string;
  role: UserRole;
  password: string;
  createdAt: string;
}

const LOCAL_USERS_KEY = 'o-resto-local-users';

export function isDemoAccount(username: string): boolean {
  return username.trim().toLowerCase() in DEMO_ACCOUNTS;
}

export function getLocalUsers(): LocalAccount[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) ?? '[]') as LocalAccount[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveLocalUsers(users: LocalAccount[]) {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {
    /* stockage indisponible */
  }
}

export function addLocalUser(account: Omit<LocalAccount, 'createdAt'>): { ok: boolean; message: string } {
  const username = account.username.trim().toLowerCase();
  if (!username || !account.password || account.password.length < 6) {
    return { ok: false, message: 'Nom d’utilisateur requis et mot de passe de 6 caractères minimum.' };
  }
  if (isDemoAccount(username)) {
    return { ok: false, message: `« ${username} » est un compte de démonstration réservé.` };
  }
  const users = getLocalUsers();
  if (users.some((u) => u.username === username)) {
    return { ok: false, message: `Le compte « ${username} » existe déjà.` };
  }
  saveLocalUsers([...users, { ...account, username, createdAt: new Date().toISOString() }]);
  return { ok: true, message: `Compte « ${username} » créé.` };
}

export function removeLocalUser(username: string) {
  saveLocalUsers(getLocalUsers().filter((u) => u.username !== username.trim().toLowerCase()));
}

export function setLocalPassword(username: string, newPassword: string): boolean {
  const key = username.trim().toLowerCase();
  const users = getLocalUsers();
  const found = users.some((u) => u.username === key);
  if (!found) return false;
  saveLocalUsers(users.map((u) => (u.username === key ? { ...u, password: newPassword } : u)));
  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Charger l'utilisateur depuis sessionStorage au démarrage (avec reprise ancien format)
    const savedUser = sessionStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(LEGACY_SESSION_KEY);
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser) as User;
        // Normaliser : QR personnel stable (anciennes sessions incluses)
        parsed.qrToken = getClientQrToken(parsed.username);
        setUser(parsed);
      } catch (error) {
        console.error('Erreur chargement session:', error);
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(LEGACY_SESSION_KEY);
      }
    }
    setLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    const name = username.trim().toLowerCase();
    const startSession = (u: Pick<User, 'username' | 'role'>, establishmentId?: string) => {
      const authenticatedUser = toSessionUser(u, establishmentId);
      setUser(authenticatedUser);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(authenticatedUser));
    };
    try {
      // Vérifier les credentials dans Supabase
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', name)
        .eq('password', password)
        .single();

      if (!error && data) {
        // Utilisateur trouvé, créer la session (QR personnel stable)
        startSession({ username: data.username, role: data.role as UserRole }, data.establishment_id ?? undefined);
        return true;
      }

      // Repli : comptes de démonstration O RESTO (table users non migrée ou hors ligne)
      const demo = DEMO_ACCOUNTS[name];
      if (demo && demo.password === password) {
        startSession(demo);
        return true;
      }

      // Repli : comptes créés localement depuis Paramètres (Supabase injoignable)
      const local = getLocalUsers().find((u) => u.username === name);
      if (local && local.password === password) {
        startSession(local);
        return true;
      }

      console.error('Erreur authentification:', error);
      return false;
    } catch (error) {
      const demo = DEMO_ACCOUNTS[name];
      if (demo && demo.password === password) {
        startSession(demo);
        return true;
      }
      const local = getLocalUsers().find((u) => u.username === name);
      if (local && local.password === password) {
        startSession(local);
        return true;
      }
      console.error('Erreur login:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
    if (!user) return false;

    // Compte démo local : accepter le changement sans persistance distante
    if (DEMO_ACCOUNTS[user.username] && currentPassword === DEMO_ACCOUNTS[user.username].password) {
      DEMO_ACCOUNTS[user.username] = { ...DEMO_ACCOUNTS[user.username], password: newPassword };
      return true;
    }

    try {
      // Vérifier le mot de passe actuel
      const { data: foundUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('username', user.username)
        .eq('password', currentPassword)
        .single();

      if (fetchError || !foundUser) {
        // Repli : compte local (Supabase injoignable) — vérifier puis mettre à jour ici
        const local = getLocalUsers().find((u) => u.username === user.username);
        if (local && local.password === currentPassword) {
          setLocalPassword(user.username, newPassword);
          return true;
        }
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
