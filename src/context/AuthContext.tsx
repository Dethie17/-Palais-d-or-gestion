import React, { createContext, useContext, ReactNode, useState, useEffect, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getClientQrToken } from '@/lib/clientQr';
import { authEmailFor, usernameFromAuthEmail } from '@/lib/authEmail';
import { useSessionExpiry, type SessionExpiryReason } from '@/lib/sessionExpiry';
import { toast } from 'sonner';
export { authEmailFor };
import {
  registerFailure,
  lockRemainingMs,
  isValidUsername,
  type AttemptRec,
} from '@/lib/authSecurity';

/**
 * Auto-réparation d'une inscription interrompue.
 *
 * Cas réel : le parent a créé son compte Auth (l'adresse est prise) mais sa
 * fiche métier n'existe pas — inscription coupée avant la fin, confirmation
 * email arrivée après coup, ou accroc réseau pendant l'enregistrement. Sans
 * ceci, il est coincé pour toujours : « créer un compte » dit que le nom est
 * pris, « se connecter » dit que le compte n'existe pas.
 *
 * On crée donc la fiche manquante, avec les mêmes droits que l'inscription
 * (rôle client, jamais plus — la politique RLS l'impose de toute façon).
 * Si le nom est déjà pris par une AUTRE identité (compte importé en attente
 * de migration), on ne touche à rien : seul l'admin peut rattacher.
 */
export interface HealClient {
  from: (table: string) => {
    insert: (
      row: Record<string, unknown>,
    ) => PromiseLike<{ error: { code?: string; message?: string } | null }>;
  };
}

export async function healMissingClientProfile(
  client: HealClient,
  session: Pick<Session, 'user'>,
): Promise<User | null> {
  // On ne recrée QUE le profil d'un PARENT. Sans cette garde, un compte de
  // personnel dont la fiche manquerait verrait un profil « client » être
  // créé à son nom — et se verrait retirer son rôle.
  const flag = (session.user.app_metadata as { oresto?: string } | undefined)?.oresto;
  if (flag !== 'parent') return null;
  let username = usernameFromAuthEmail(session.user.email);
  if (!username) {
    const emailLocal = (session.user.email ?? '').trim().toLowerCase().split('@')[0] ?? '';
    if (/^[67]\d{8}$/.test(emailLocal)) username = emailLocal;
  }
  if (!username || !isValidUsername(username)) return null;
  try {
    const { error } = await client
      .from('users')
      .insert({ username, role: 'client', auth_id: session.user.id, qr_token: getClientQrToken(username) });
    if (error) return null;
  } catch {
    return null;
  }
  return { username, role: 'client', qrToken: getClientQrToken(username) };
}

/**
 * Comptes de démonstration : DÉSACTIVÉS dès que VITE_DEMO_LOGIN=false
 * (recommandé en production dès que de vrais comptes Supabase existent).
 * En dev sans variable, reste actif pour travailler hors-ligne.
 * En production (import.meta.env.PROD), exige VITE_DEMO_LOGIN=true explicite.
 */
const DEMO_FLAG = import.meta.env.VITE_DEMO_LOGIN as string | undefined;
export const DEMO_LOGIN_ENABLED = import.meta.env.PROD ? DEMO_FLAG === 'true' : DEMO_FLAG !== 'false';

/**
 * Les 4 espaces utilisateurs O RESTO — un rôle = un espace, sans alias.
 *   client      → Parent
 *   personnel   → Superviseur cantine
 *   gestionnaire→ Caissier
 *   admin       → Espace ISM (structure partenaire)
 */
export type UserRole = 'client' | 'personnel' | 'gestionnaire' | 'admin';

const VALID_ROLES: UserRole[] = ['client', 'personnel', 'gestionnaire', 'admin'];

/**
 * Anciens rôles stockés en base avant le découpage en 4 espaces :
 * « caissier » (ancien doublon du superviseur) et « manager » (ancien DG).
 * Ils sont convertis à la lecture pour que les comptes existants
 * continuent de fonctionner sans intervention en base.
 */
const LEGACY_ROLE_ALIAS: Record<string, UserRole> = {
  caissier: 'gestionnaire',
  manager: 'admin',
};

/** Convertit un rôle brut (base, session, formulaire) en rôle canonique. */
export function normalizeRole(value: unknown): UserRole | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  if ((VALID_ROLES as string[]).includes(key)) return key as UserRole;
  return LEGACY_ROLE_ALIAS[key] ?? null;
}

function isValidRole(role: unknown): role is UserRole {
  return normalizeRole(role) !== null;
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
  /** Connexion parent : numéro de téléphone seul, sans mot de passe. */
  loginParent: (phone: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Session : elle n'est plus écrite à la main dans le navigateur.
 *
 * AVANT : un objet JSON dans localStorage (`{username, role}`). Modifier
 * cette valeur depuis la console suffisait à se proclamer administrateur —
 * aucune vérification côté serveur n'était possible, puisque la clé publique
 * de l'application lit et écrit toute la base.
 *
 * MAINTENANT : le jeton vit dans le stockage géré par le client Supabase et
 * n'est accepted par PostgreSQL que s'il est signé par le serveur Auth. Le
 * rôle est relu dans la base à chaque chargement, filtré par la politique RLS
 * qui ne renvoie que la ligne du demandeur. Ni le jeton ni le rôle ne peuvent
 * être fabriqués depuis le navigateur.
 */
const SESSION_KEY = 'o-resto-current-user';
const OLD_SESSION_KEY = 'palais-d-or-current-user';

/**
 * Rôles historiques conservés pour l'affichage des profils.
 * @deprecated lire ROLE_DEFINITIONS.
 */
export const LEGACY_ROLE_LABELS: Record<string, string> = {
  caissier: 'Caissier',
  manager: 'Direction',
};

/**
 * Session du repli de transition, conservée dans `sessionStorage`.
 *
 * ⚠️ Ce que ce stockage n'est PAS : une garantie. Tout ce que le navigateur
 * peut écrire, l'utilisateur peut l'éditer depuis la console. Une session
 * ainsi stockée reste donc falsifiable — c'est précisément ce que le
 * durcissement supprime.
 *
 * Pourquoi l'accepter ici, et seulement ici : ce chemin ne sert que tant que
 * les comptes ne sont pas migrés vers Supabase Auth, et il évite qu'une
 * cantine doive ressaisir ses identifiants à chaque rechargement de page.
 * `sessionStorage` et non `localStorage` : la session meurt avec l'onglet.
 *
 * Dès que VITE_LEGACY_LOGIN passe à false, ce stockage n'est plus ni lu ni
 * écrit, et le jeton Supabase prend le relais — lui, il est signé par le
 * serveur et illisible à la falsification.
 */
const LEGACY_SESSION_KEY = 'o-resto-legacy-session';

function writeLegacySession(user: User) {
  if (LEGACY_LOGIN_ENABLED !== true) return;
  try {
    sessionStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(user));
  } catch {
    /* stockage indisponible : la session ne survivra pas au rechargement */
  }
}

/**
 * Purge les sessions obsolètes (avant durcissement). Ne touche PAS à la
 * session du repli, qui doit survivre à un rechargement.
 */
function purgeObsoleteSessions() {
  try {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(OLD_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Déconnexion : plus aucune session ne doit subsister. */
function clearAllSessions() {
  purgeObsoleteSessions();
  try {
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Relecture de la session du repli. Le rôle est validé par `normalizeRole` :
 * cela n'empêche pas la falsification (c'est le navigateur qui décide), mais
 * garantit qu'une valeur corrompue ne fait pas planter le rendu.
 */
function readLegacySession(): User | null {
  if (LEGACY_LOGIN_ENABLED !== true) return null;
  try {
    const raw = sessionStorage.getItem(LEGACY_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<User>;
    const username = (parsed.username ?? '').trim().toLowerCase();
    const role = normalizeRole(parsed.role);
    if (!username || !role) return null;
    return {
      username,
      role,
      qrToken: getClientQrToken(username),
      establishmentId: typeof parsed.establishmentId === 'string' ? parsed.establishmentId : undefined,
    };
  } catch {
    return null;
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

// Comptes de démonstration O RESTO — un par espace.
// ATTENTION : ils ne fonctionnent que si aucun compte Supabase n'est
// configuré. Dès que la base est joignable, ces identifiants sont ignorés et
// seule l'authentification serveur est acceptée.
/**
 * Comptes de démonstration, HOLD dans le bundle SEULEMENT quand le login démo
 * est actif (dev/hors-ligne). En production le drapeau vaut false : l'objet
 * devient vide et les mots de passe (admin123…) sont éliminés du bundle par
 * le compileur — ils ne doivent jamais voyager dans le navigateur.
 */
const DEMO_ACCOUNTS: Record<string, User> = DEMO_LOGIN_ENABLED
  ? {
      client: { username: 'client', role: 'client', password: 'client123' },
      personnel: { username: 'personnel', role: 'personnel', password: 'personnel123' },
      gestionnaire: { username: 'gestionnaire', role: 'gestionnaire', password: 'gestionnaire123' },
      admin: { username: 'admin', role: 'admin', password: 'admin123' },
    }
  : {};

function toSessionUser(base: Pick<User, 'username' | 'role'>, establishmentId?: string): User {
  return {
    username: base.username,
    role: base.role,
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

/**
 * Repli de transition vers la vérification par empreinte en base.
 *
 * Actif seulement si VITE_LEGACY_LOGIN vaut true. Il permet aux comptes
 * existants (ceux créés avant la migration vers Supabase Auth) de continuer à
 * se connecter pendant que la migration a lieu.
 *
 * ⚠️ Ce n'est pas une mesure de sécurité : la fonction de hachage voyage dans
 * le bundle, et l'empreinte stockée est lisible par quiconque possède la clé
 * publique de la base. Passer à false dès que tous les comptes sont rattachés.
 */
const LEGACY_LOGIN_ENABLED = (import.meta.env.VITE_LEGACY_LOGIN as string | undefined) === 'true';

/** Ligne `users` lue par le repli de transition. */
interface LegacyUserRow {
  username: string;
  role: string;
  password: string | null;
  establishment_id?: string | null;
}

/**
 * Vérifie un mot de passe contre l'empreinte historique.
 *
 * L'empreinte existante est `sha256-` + SHA-256("o-resto$" + mot de passe).
 * Le sel est préfixé au message — ce n'est pas un sel, et SHA-256 n'est pas
 * fait pour cela : c'est pourquoi cette fonction ne sert que le temps de la
 * migration, puis disparaît avec la colonne `password`.
 */
async function verifyLegacyPassword(input: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  // Comptes creation-era : mot de passe en clair, migré au prochain login.
  if (stored === input) return true;
  if (!stored.startsWith('sha256-')) return false;

  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return false;
    const data = new TextEncoder().encode(`o-resto$${input}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `sha256-${hex}` === stored;
  } catch {
    return false;
  }
}

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

/**
 * Création d'un compte local de secours.
 *
 * Conservée pour le mode hors-ligne (démonstration sans base). En base
 * configurée, un vrai compte doit être créé dans Supabase Auth par la DAF :
 * c'est le seul endroit où le mot de passe est haché côté serveur.
 */
export async function addLocalUserHashed(account: Omit<LocalAccount, 'createdAt'>): Promise<{ ok: boolean; message: string }> {
  return addLocalUser(account);
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
  return setLocalPassword(username, newPassword);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Traduit une session Supabase en profil applicatif.
   *
   * Le rôle n'est jamais déduit du jeton ni d'une valeur locale : il est relu
   * dans la base, sous la politique RLS qui ne rend visible que la ligne du
   * demandeur. Un jeton valide sans profil rattaché ne donne aucun accès —
   * c'est le cas tant que la migration des comptes (supabase-security.sql,
   * section 8) n'est pas faite.
   */
  const profileFromSession = useCallback(async (session: Session): Promise<User | null> => {
    const isParent =
      (session.user.app_metadata as { oresto?: string } | undefined)?.oresto === 'parent';

    // Voie normale : lien direct identité ↔ Auth (colonne `auth_id`).
    // Un parent passe directement par le pont ci-dessous : la colonne n'existe
    // pas encore sur le schéma déployé, et l'interroger faisait échouer une
    // requête (HTTP 400) à chaque connexion, visible dans la console.
    const byAuthId = isParent
      ? { data: null, error: null }
      : await withAuthTimeout(
          Promise.resolve(
            supabase
              .from('users')
              .select('username, role, establishment_id')
              .eq('auth_id', session.user.id)
              .maybeSingle(),
          ),
        );

    let row = (byAuthId.error ? null : byAuthId.data) as
      | { username?: unknown; role?: unknown; establishment_id?: string | null }
      | null;

    // Pont de transition : sans colonne `auth_id` (migration pas encore faite),
    // on retrouve la fiche par l'adresse Auth — mais SEULEMENT pour les
    // comptes créés par NOTRE application (marqueur app_metadata.oresto).
    // `app_metadata` n'est modifiable que par la clé de service : un compte
    // Auth forgé ailleurs ne peut donc pas prendre un rôle élevé.
    const managedFlag = (session.user.app_metadata as { oresto?: string } | undefined)?.oresto;
    if (!row && (managedFlag === 'parent' || managedFlag === 'staff')) {
      let username = usernameFromAuthEmail(session.user.email);
      if (!username && managedFlag === 'parent') {
        const emailLocal = (session.user.email ?? '').trim().toLowerCase().split('@')[0] ?? '';
        if (/^[67]\d{8}$/.test(emailLocal)) username = emailLocal;
      }
      if (username) {
        const byName = await withAuthTimeout(
          Promise.resolve(
            supabase
              .from('users')
              .select('username, role, establishment_id')
              .eq('username', username)
              .maybeSingle(),
          ),
        );
        if (byName.error) console.error('[profileFromSession] read by username error:', byName.error);
        if (!byName.error) row = byName.data as typeof row;
      }
    }

    if (!row) return null;

    const username = typeof row.username === 'string' ? row.username.trim().toLowerCase() : '';
    const role = normalizeRole(row.role);
    if (!username || !role) return null;

    return {
      username,
      role,
      qrToken: getClientQrToken(username),
      establishmentId: row.establishment_id ?? undefined,
    };
  }, []);

  // Restauration de session : la source de vérité est le serveur Auth.
  // Si la fiche métier manque (inscription interrompue), on la recrée au
  // lieu de jeter la session — voir healMissingClientProfile.
  const resolveProfile = useCallback(async (session: Session): Promise<User | null> => {
    const profile = await profileFromSession(session);
    if (profile) return profile;
    return healMissingClientProfile(supabase, session);
  }, []);
  useEffect(() => {
    let cancelled = false;
    purgeObsoleteSessions();

    // Repli de transition : un compte pas encore migré retrouve sa session,
    // le temps que VITE_LEGACY_LOGIN soit coupé.
    const restored = readLegacySession();
    if (restored && !cancelled) {
      setUser(restored);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      if (session) {
        const profile = await resolveProfile(session);
        if (cancelled) return;
        // Jeton valide mais aucun profil : la session ne vaut rien. On la
        // ferme plutôt que de laisser une connexion à moitié établie.
        if (profile) setUser(profile);
        else await supabase.auth.signOut();
      }
      if (!cancelled) setLoading(false);
    });

    // Déconnexion initiée ailleurs (autre onglet, expiration du jeton).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT' || !session) {
        setUser(null);
        return;
      }
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        void resolveProfile(session).then((profile) => {
          if (!cancelled) setUser(profile);
        });
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [profileFromSession, resolveProfile]);

  const login = async (username: string, password: string): Promise<boolean> => {
    const name = username.trim().toLowerCase();
    if (!name || !password) return false;
    // Anti brute-force : verrouillage progressif uniforme (ne révèle rien du compte)
    if (lockRemainingMs(getAttempts()[name], Date.now()) > 0) return false;

    /**
     * Comptes de démonstration et comptes locaux : un pis-aller local, sans
     * aucune garantie côté serveur. Réservé au travail hors-ligne — dès que
     * la base est configurée, ces deux chemins sont désactivés, car ils
     * laisseraient une session se créer sans qu'aucun serveur ne l'ait
     * jamais validée.
     */
    const attemptLocalLogin = async (): Promise<boolean> => {
      if (!DEMO_LOGIN_ENABLED) return false;

      const demo = DEMO_ACCOUNTS[name];
      if (demo && demo.password === password) {
        setUser(toSessionUser(demo));
        return true;
      }

      const local = getLocalUsers().find((u) => u.username === name);
      if (local && local.password === password) {
        setUser(toSessionUser(local));
        return true;
      }
      return false;
    };

    /**
     * Repli de transition : vérification directe dans la table `users`.
     *
     * Utile tant que les comptes n'ont pas été migrés vers Supabase Auth
     * (supabase-security.sql + supabase-link-accounts.sql). Ce n'est PAS une
     * protection : la comparaison se fait dans le navigateur, contre une
     * empreinte lisible par quiconque a la clé publique.
     *
     * D'où le drapeau VITE_LEGACY_LOGIN, qui doit être false dès que la
     * migration est terminée — et le projet échoue bruyamment si la colonne
     * `password` a disparu, plutôt que de laisser croire que ça marche.
     */
    const attemptLegacyLogin = async (): Promise<boolean> => {
      if (LEGACY_LOGIN_ENABLED !== true) return false;

      try {
        const { data, error } = await withAuthTimeout(
          Promise.resolve(
            supabase.from('users').select('username, role, password, establishment_id')
              .eq('username', name)
              .maybeSingle()
              .then((r) => ({ data: r.data as LegacyUserRow | null, error: r.error })),
          ),
        );
        if (error || !data) return false;

        const ok = await verifyLegacyPassword(password, data.password);
        if (!ok) return false;

        const role = normalizeRole(data.role);
        if (!role) return false;

        const user: User = {
          username: data.username,
          role,
          qrToken: getClientQrToken(data.username),
          establishmentId: data.establishment_id ?? undefined,
        };
        setUser(user);
        writeLegacySession(user);

        /*
         * SESSION SERVEUR — sans elle, la connexion « locale » ne donne
         * accès qu'à l'interface : toutes les routes /api/* (ouvrir l'accès
         * d'un parent, importer une liste, gérer les comptes) exigent un
         * jeton vérifié par le serveur et repousseraient l'utilisateur en
         * 401. On demande donc au serveur de rattacher ce compte à une
         * identité Auth et d'ouvrir une session.
         *
         * Échec : la session locale reste valable (l'interface fonctionne),
         * mais les opérations réservées à la Direction ne le seront pas —
         * d'où le message explicite.
         */
        try {
          const res = await fetch('/api/auth/login-staff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: data.username, password }),
          });
          const payload = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            accessToken?: string;
            refreshToken?: string;
          };
          if (res.ok && payload.ok && payload.accessToken && payload.refreshToken) {
            // La session Auth est ouverte : l'écouteur `onAuthStateChange`
            // recharge le profil (rôle, établissement) depuis la base.
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: payload.accessToken,
              refresh_token: payload.refreshToken,
            });
            if (sessionError) {
              console.warn('[O RESTO] Session serveur non ouverte :', sessionError.message);
            }
          }
        } catch {
          /* serveur indisponible : on garde la session locale */
        }
        return true;
      } catch {
        return false;
      }
    };

    const ok = await (async (): Promise<boolean> => {
      if (!isSupabaseConfigured) return attemptLocalLogin();

      try {
        // La vérification se fait chez Supabase : le mot de passe n'arrive
        // jamais dans la base applicative, et l'échec ne distingue pas un
        // compte inexistant d'un mot de passe faux.
        const { data, error } = await withAuthTimeout(
          supabase.auth.signInWithPassword({ email: authEmailFor(name), password }),
        );

        if (!error && data.session) {
          let profile = await profileFromSession(data.session);
          if (!profile) profile = await healMissingClientProfile(supabase, data.session);
          if (profile) {
            setUser(profile);
            return true;
          }
          // Jeton sans profil : le compte n'existe pas encore dans Auth.
          await supabase.auth.signOut();
        }
        // Un compte peut exister dans `users` sans avoir été migré.
        return attemptLegacyLogin();
      } catch {
        // Base injoignable : on ne retombe sur les comptes locaux que si la
        // configuration s'y prête. Une base joignable mais en erreur ne doit
        // surtout pas ouvrir la session en local.
        return attemptLocalLogin();
      }
    })();

    const all = getAttempts();
    if (ok) {
      delete all[name];
    } else {
      all[name] = registerFailure(all[name], Date.now());
    }
    saveAttempts(all);
    return ok;
  };

  /**
   * Connexion PARENT : le numéro enregistré par la DAF suffit.
   *
   * Le mot de passe technique est géré côté serveur (dérivé du numéro) : le
   * navigateur ne reçoit que les jetons de session. En local sans API Vercel,
   * la connexion parent est indisponible — le message le dit clairement.
   */
  const loginParent = async (phone: string): Promise<{ ok: boolean; error?: string }> => {
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('00221') && digits.length === 14) digits = digits.slice(5);
    if (digits.startsWith('221') && digits.length === 12) digits = digits.slice(3);
    if (!/^[67]\d{8}$/.test(digits)) {
      return { ok: false, error: 'Numéro invalide : 9 chiffres (ex : 77 123 45 67).' };
    }
    if (!isSupabaseConfigured) {
      return { ok: false, error: 'Connexion parent indisponible hors ligne.' };
    }
    try {
      const res = await fetch('/api/auth/login-parent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        accessToken?: string;
        refreshToken?: string;
      };
      if (!res.ok || !payload.ok || !payload.accessToken || !payload.refreshToken) {
        return {
          ok: false,
          error: payload.error ?? 'Connexion impossible. Vérifiez le numéro enregistré à la cantine.',
        };
      }
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: payload.accessToken,
        refresh_token: payload.refreshToken,
      });
      if (sessionError) return { ok: false, error: 'Session refusée. Réessayez.' };

      const { data } = await supabase.auth.getSession();
      if (!data.session) return { ok: false, error: 'Session expirée. Réessayez.' };
      let profile = await profileFromSession(data.session);
      if (!profile) profile = await healMissingClientProfile(supabase, data.session);
      if (!profile) {
        await supabase.auth.signOut();
        return { ok: false, error: 'Profil parent introuvable. Adressez-vous à la cantine.' };
      }
      setUser(profile);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Serveur injoignable. Vérifiez votre connexion.' };
    }
  };

  const logout = async () => {
    // L'ordre importe : on ferme la session locale d'abord, pour que l'écran
    // de connexion apparaisse même si l'appel réseau échoue.
    setUser(null);
    clearAllSessions();
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      /* le jeton local est déjà purgé */
    }
  };

  // Expiration automatique : inactivité prolongée (préavis 60 s) ou durée
  // maximale atteinte — la reconnexion est exigée dans les deux cas.
  useSessionExpiry(user !== null && !loading, (reason: SessionExpiryReason) => {
    void logout();
    toast.info(
      reason === 'inactivity'
        ? 'Session fermée après inactivité. Reconnectez-vous.'
        : 'Session fermée : durée maximale atteinte. Reconnectez-vous.',
    );
  });

  const changePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
    if (!user) return false;
    // Personnel / gestionnaire : mot de passe géré UNIQUEMENT par la DAF
    // (Paramètres → Comptes → réinitialiser). Eux ne peuvent pas le changer seuls.
    if (user.role === 'personnel' || user.role === 'gestionnaire') {
      return false;
    }
    if (!newPassword || newPassword.length < 6) return false;
    const key = user.username.trim().toLowerCase();

    if (isSupabaseConfigured) {
      // Supabase exige le mot de passe actuel : c'est lui qui refuse la
      // modification sans connaître l'ancien.
      const { error: currentError } = await supabase.auth.signInWithPassword({
        email: authEmailFor(key),
        password: currentPassword,
      });
      if (currentError) return false;

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      return !error;
    }

    // Hors ligne : le compte démo ou local est mis à jour en mémoire.
    const demo = DEMO_ACCOUNTS[key];
    if (demo) {
      if (demo.password !== currentPassword) return false;
      DEMO_ACCOUNTS[key] = { ...demo, password: newPassword };
      return true;
    }

    const local = getLocalUsers().find((u) => u.username === key);
    if (local && local.password === currentPassword) {
      return setLocalPassword(key, newPassword);
    }
    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        loginParent,
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
