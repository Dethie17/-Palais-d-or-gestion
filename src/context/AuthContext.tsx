import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getClientQrToken } from '@/lib/clientQr';
import { hashPassword, verifyPassword, isHashed } from '@/lib/password';
import {
  registerFailure,
  lockRemainingMs,
  isValidUsername,
  type AttemptRec,
} from '@/lib/authSecurity';

/**
 * Comptes de démonstration : DÉSACTIVÉS dès que VITE_DEMO_LOGIN=false
 * (recommandé en production dès que de vrais comptes Supabase existent).
 * En dev sans variable, reste actif pour travailler hors-ligne.
 * En production (import.meta.env.PROD), exige VITE_DEMO_LOGIN=true explicite.
 */
const DEMO_FLAG = import.meta.env.VITE_DEMO_LOGIN as string | undefined;
export const DEMO_LOGIN_ENABLED = import.meta.env.PROD ? DEMO_FLAG === 'true' : DEMO_FLAG !== 'false';

export type UserRole = 'client' | 'personnel' | 'gestionnaire' | 'admin' | 'caissier' | 'manager';

const VALID_ROLES: UserRole[] = ['client', 'personnel', 'gestionnaire', 'admin', 'caissier', 'manager'];

function isValidRole(role: unknown): role is UserRole {
  return typeof role === 'string' && (VALID_ROLES as string[]).includes(role);
}

export interface User {
  username: string;
  role: UserRole;
  password?: string;
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

/**
 * Session NON limitée : conservée dans localStorage (survit aux onglets
 * et aux redémarrages), sans expiration ni inactivité. Seule la déconnexion
 * manuelle la supprime — pensez à vous déconnecter sur appareil partagé.
 */
function readStoredSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY)
      ?? sessionStorage.getItem(SESSION_KEY)
      ?? sessionStorage.getItem(LEGACY_SESSION_KEY);
  } catch {
    return null;
  }
}

function writeStoredSession(value: User) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  } catch {
    /* stockage indisponible */
  }
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Supabase injoignable ≠ Supabase lent : borne chaque requête auth à 7 s.
 * Au-delà, on bascule sur les comptes démo/locaux au lieu de figer le login.
 */
function withAuthTimeout<T>(promise: Promise<T>, ms = 7000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('auth-timeout')), ms)),
  ]);
}

function clearStoredSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

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

export const LOCAL_USERS_KEY = 'o-resto-local-users';
const ATTEMPTS_KEY = 'o-resto-login-attempts';

function getAttempts(): Record<string, AttemptRec> {
  try {
    const raw = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? '{}') as Record<string, AttemptRec>;
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function saveAttempts(all: Record<string, AttemptRec>) {
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(all));
  } catch {
    /* stockage indisponible */
  }
}

/** Verrouillage anti brute-force pour un nom d'utilisateur (uniforme, ne révèle rien). */
export function getLoginLock(username: string): { locked: boolean; retryInMs: number } {
  const retryInMs = lockRemainingMs(getAttempts()[username.trim().toLowerCase()], Date.now());
  return { locked: retryInMs > 0, retryInMs };
}

function persistSession(u: User) {
  writeStoredSession(u);
}

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
  if (!isValidUsername(username)) {
    return { ok: false, message: 'Nom d’utilisateur : 3 à 24 caractères (lettres, chiffres, . _ -).' };
  }
  if (!isValidRole(account.role)) {
    return { ok: false, message: 'Rôle invalide.' };
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

export async function addLocalUserHashed(account: Omit<LocalAccount, 'createdAt'>): Promise<{ ok: boolean; message: string }> {
  const base = addLocalUser(account);
  if (!base.ok) return base;
  const users = getLocalUsers();
  const hashed = await hashPassword(account.password);
  saveLocalUsers(users.map((u) => (u.username === account.username.trim().toLowerCase() ? { ...u, password: hashed } : u)));
  return { ok: true, message: `Compte « ${account.username.trim().toLowerCase()} » créé.` };
}

export function removeLocalUser(username: string) {
  saveLocalUsers(getLocalUsers().filter((u) => u.username !== username.trim().toLowerCase()));
}

export function setLocalPassword(username: string, newPassword: string): boolean {
  const key = username.trim().toLowerCase();
  if (!newPassword || newPassword.length < 6) return false;
  const users = getLocalUsers();
  const found = users.some((u) => u.username === key);
  if (!found) return false;
  saveLocalUsers(users.map((u) => (u.username === key ? { ...u, password: newPassword } : u)));
  return true;
}

export async function setLocalPasswordHashed(username: string, newPassword: string): Promise<boolean> {
  if (!newPassword || newPassword.length < 6) return false;
  const hashed = await hashPassword(newPassword);
  return setLocalPassword(username, hashed);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Charger la session persistante (sans limite) + validation stricte anti-élévation.
    const savedUser = readStoredSession();
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser) as Partial<User>;
        const username = (parsed.username ?? '').trim().toLowerCase();
        if (!username || !isValidRole(parsed.role)) throw new Error('Session invalide');
        const clean: User = {
          username,
          role: parsed.role as UserRole,
          qrToken: getClientQrToken(username),
          establishmentId: typeof parsed.establishmentId === 'string' ? parsed.establishmentId : undefined,
        };
        setUser(clean);
        persistSession(clean);
        // Revalidation best-effort du rôle distant (anti-élévation si Supabase joignable)
        supabase.from('users').select('role,establishment_id').eq('username', username).single()
          .then(({ data, error }) => {
            if (!error && data && isValidRole((data as { role: unknown }).role)) {
              const d = data as { role: UserRole; establishment_id?: string };
              if (d.role !== clean.role || (d.establishment_id ?? undefined) !== clean.establishmentId) {
                const updated: User = { ...clean, role: d.role, establishmentId: d.establishment_id ?? undefined };
                setUser(updated);
                persistSession(updated);
              }
            }
          }, () => undefined);
      } catch (error) {
        clearStoredSession();
      }
    }
    setLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    const name = username.trim().toLowerCase();
    if (!name || !password) return false;
    // Anti brute-force : verrouillage progressif uniforme (ne révèle rien du compte)
    if (lockRemainingMs(getAttempts()[name], Date.now()) > 0) return false;
    const startSession = (u: Pick<User, 'username' | 'role'>, establishmentId?: string) => {
      const authenticatedUser = toSessionUser(u, establishmentId);
      setUser(authenticatedUser);
      persistSession(authenticatedUser);
    };
    const attemptLogin = async (): Promise<boolean> => {
      try {
        // Supabase : on récupère par username puis vérification hash (compatible legacy en clair).
        // Timeout 7 s : si la base ne répond pas, repli immédiat démo/local (jamais de login figé).
        const supabaseResult = await withAuthTimeout(
          supabase.from('users').select('*').eq('username', name).single() as unknown as Promise<{ data: any; error: any }>,
        );
        const { data, error } = supabaseResult;

        if (!error && data && isValidRole(data.role)) {
          const ok = await verifyPassword(password, data.password as string);
          if (ok) {
            // Auto-migration vers hash si encore en clair
            if (!isHashed(data.password as string)) {
              const hashed = await hashPassword(password);
              supabase.from('users').update({ password: hashed }).eq('username', name)
                .then(() => undefined, () => undefined);
            }
            startSession({ username: data.username, role: data.role as UserRole }, data.establishment_id ?? undefined);
            return true;
          }
        }

        // Repli : comptes de démonstration (désactivables en prod via VITE_DEMO_LOGIN=false)
        if (DEMO_LOGIN_ENABLED) {
          const demo = DEMO_ACCOUNTS[name];
          if (demo && (await verifyPassword(password, demo.password ?? ''))) {
            startSession(demo);
            return true;
          }
        }

        // Repli : comptes créés localement depuis Paramètres (Supabase injoignable)
        const local = getLocalUsers().find((u) => u.username === name);
        if (local && (await verifyPassword(password, local.password))) {
          startSession(local);
          return true;
        }

        return false;
      } catch (error) {
        if (DEMO_LOGIN_ENABLED) {
          const demo = DEMO_ACCOUNTS[name];
          if (demo && (await verifyPassword(password, demo.password ?? ''))) {
            startSession(demo);
            return true;
          }
        }
        const local = getLocalUsers().find((u) => u.username === name);
        if (local && (await verifyPassword(password, local.password))) {
          startSession(local);
          return true;
        }
        return false;
      }
    };
    const ok = await attemptLogin();
    const all = getAttempts();
    if (ok) {
      delete all[name];
    } else {
      all[name] = registerFailure(all[name], Date.now());
    }
    saveAttempts(all);
    return ok;
  };

  const logout = () => {
    setUser(null);
    clearStoredSession();
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
    if (!user) return false;
    // Personnel / caissier : mot de passe géré UNIQUEMENT par le DG
    // (Paramètres → Comptes → réinitialiser). Eux ne peuvent pas le changer seuls.
    if (user.role === 'personnel' || user.role === 'caissier' || user.role === 'gestionnaire') {
      return false;
    }
    if (!newPassword || newPassword.length < 6) return false;
    const key = user.username.trim().toLowerCase();

    // Compte démo : changement en mémoire + miroir local haché (volatil, à changer en base en prod)
    if (DEMO_ACCOUNTS[key]) {
      const ok = await verifyPassword(currentPassword, DEMO_ACCOUNTS[key].password ?? '');
      if (!ok) return false;
      const hashed = await hashPassword(newPassword);
      DEMO_ACCOUNTS[key] = { ...DEMO_ACCOUNTS[key], password: hashed };
      return true;
    }

    try {
      // Vérifier le mot de passe actuel (compatible legacy)
      const { data: foundUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('username', key)
        .single();

      if (fetchError || !foundUser || !(await verifyPassword(currentPassword, foundUser.password as string))) {
        // Repli : compte local (Supabase injoignable)
        const local = getLocalUsers().find((u) => u.username === key);
        if (local && (await verifyPassword(currentPassword, local.password))) {
          await setLocalPasswordHashed(key, newPassword);
          return true;
        }
        return false;
      }

      // Mettre à jour avec hash
      const hashed = await hashPassword(newPassword);
      const { error: updateError } = await supabase
        .from('users')
        .update({ password: hashed })
        .eq('username', key);

      if (updateError) {
        return false;
      }

      return true;
    } catch (error) {
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
