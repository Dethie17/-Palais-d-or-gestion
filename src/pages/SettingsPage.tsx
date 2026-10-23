import { useEffect, useState } from 'react';
import { PageName } from '@/types/menu';
import { useAuth, UserRole } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { getRoleDef } from '@/lib/roleTasks';
import { getClientQrToken } from '@/lib/clientQr';
import { addLocalUserHashed, getLocalUsers, isDemoAccount, removeLocalUser } from '@/context/AuthContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { postAdminAction } from '@/lib/adminApi';
import { formatCurrency } from '@/lib/utils';
import {
  Settings as SettingsIcon, Users, Plus, Trash2, KeyRound, Wallet,
  LayoutDashboard, Receipt, UtensilsCrossed, CheckCircle, AlertCircle,
} from 'lucide-react';

interface SettingsPageProps {
  onNavigate: (page: PageName) => void;
}

interface DbUser {
  id: number;
  username: string;
  role: string;
  created_at?: string;
}

// Comptes créables : la Direction bénéficie d'un seul rôle — le Caissier.
// (Réservé à la DAF côté serveur ; rôles supérieurs ne se créent pas ici.)
const CREATABLE_ROLES: UserRole[] = ['gestionnaire'];

/**
 * Paramètres — Personnel de service (comptes du site) + Directeur Général
 * (toute la plateforme) : comptes, accès, mots de passe, vue d'ensemble.
 * Les SITES (cantines) vivent dans la section Établissements.
 */
const SettingsPage = ({ onNavigate }: SettingsPageProps) => {
  const { user } = useAuth();
  const { subscriptions, validations, payments } = useResto();
  const isStaff = user?.role === 'personnel';
  // Le personnel ne crée jamais de comptes caissier (rôle Direction) :
  // il se limite aux comptes client et personnel.
  const allowedRoles: UserRole[] = isStaff ? ['client', 'personnel'] : CREATABLE_ROLES;

  const [dbUsers, setDbUsers] = useState<DbUser[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('gestionnaire');
  const [resetUser, setResetUser] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    const local: DbUser[] = getLocalUsers().map((u, i) => ({
      id: -(i + 1),
      username: u.username,
      role: u.role,
    }));
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, role, created_at')
        .order('username', { ascending: true });
      if (error) throw error;
      const remote = ((data ?? []) as DbUser[]);
      const seen = new Set(remote.map((u) => u.username));
      // Toujours afficher les comptes locaux (ils permettent la connexion hors-ligne)
      setDbUsers([...remote, ...local.filter((u) => !seen.has(u.username))]);
      setOffline(false);
    } catch {
      setOffline(true);
      setDbUsers(local);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const flash = (type: 'ok' | 'err', text: string) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 4000);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const username = newUsername.trim().toLowerCase();
    if (!username || !newPassword || newPassword.length < 6) {
      flash('err', 'Nom d’utilisateur requis et mot de passe de 6 caractères minimum.');
      return;
    }
    if (isStaff && !(['client', 'personnel'] as string[]).includes(newRole)) {
      flash('err', 'Le personnel ne peut créer que des comptes client ou personnel.');
      return;
    }
    if (isDemoAccount(username)) {
      flash('err', `« ${username} » est un compte de démonstration réservé.`);
      return;
    }
    // Création d'un compte : c'est le serveur qui porte le rôle, parce que
    // seul lui détient la clé permettant de créer le compte d'authentification.
    let remote = false;
    if (isSupabaseConfigured) {
      const created = await postAdminAction('/api/auth/create-user', {
        username,
        password: newPassword,
        role: newRole,
      });
      if (!created.ok) {
        flash('err', created.error ?? 'Création impossible.');
        return;
      }
      remote = true;
    } else {
      // Hors-ligne : registre local, sans aucune garantie de sécurité.
      const local = await addLocalUserHashed({ username, role: newRole, password: newPassword });
      if (!local.ok) {
        flash('err', local.message);
        return;
      }
    }
    setNewUsername('');
    setNewPassword('');
    flash('ok', `Compte « ${username} » (${getRoleDef(newRole).title}) créé${remote ? '.' : ' (mode local : à recréer côté serveur dès que la base répond).'}`);
    loadUsers();
  };

  const handleDelete = async (username: string) => {
    const key = username.trim().toLowerCase();
    if (key === (user?.username ?? '').trim().toLowerCase()) {
      flash('err', 'Vous ne pouvez pas supprimer votre propre compte.');
      return;
    }
    if (confirmDelete !== username) {
      setConfirmDelete(username);
      return;
    }
    setConfirmDelete(null);

    if (isSupabaseConfigured) {
      // La suppression passe par le serveur : elle touche au compte
      // d'authentification, ce que le navigateur n'a pas le droit de faire.
      const done = await postAdminAction('/api/auth/delete-user', { username: key });
      if (!done.ok) {
        flash('err', done.error ?? 'Suppression impossible.');
        return;
      }
    }

    removeLocalUser(key);
    flash('ok', `Compte « ${key} » supprimé.`);
    loadUsers();
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = resetUser.trim().toLowerCase();
    if (!key || resetPassword.length < 8) {
      flash('err', 'Choisissez un compte et un mot de passe de 8 caractères minimum.');
      return;
    }

    if (isSupabaseConfigured) {
      const done = await postAdminAction('/api/auth/set-password', {
        username: key,
        password: resetPassword,
      });
      if (!done.ok) {
        flash('err', done.error ?? 'Mise à jour impossible.');
        return;
      }
    }
    setResetPassword('');
    flash('ok', `Mot de passe de « ${key} » mis à jour.`);
  };

  const activeSubs = subscriptions.filter((s) => s.status === 'active').length;
  const paidRevenue = payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
          Comptes & accès
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900 flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-slate-700" /> Paramètres
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {isStaff
            ? <>Espace <strong>Personnel</strong> — comptes du site et accès. Les sites sont dans <strong>Établissements</strong>.</>
            : <>Réservé à la <strong>Direction</strong> — comptes, accès et supervision de la plateforme.</>}
        </p>
      </div>

      {message && (
        <div className={`rounded-2xl border p-4 flex items-center gap-2 text-sm font-medium ${message.type === 'ok' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {message.type === 'ok' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {message.text}
        </div>
      )}

      {/* Vue d'ensemble */}
      <div className="grid sm:grid-cols-3 gap-3">
        <button onClick={() => onNavigate('subscriptions')} className="bg-white rounded-2xl border p-4 text-left hover:shadow-md transition-shadow">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1"><Wallet className="w-4 h-4" /> Abonnements actifs</p>
          <p className="text-3xl font-black text-slate-900 mt-1">{activeSubs}</p>
          <p className="text-xs text-green-700 font-semibold mt-1">CA encaissé : {formatCurrency(paidRevenue)} →</p>
        </button>
        <button onClick={() => onNavigate('users')} className="bg-white rounded-2xl border p-4 text-left hover:shadow-md transition-shadow">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1"><Users className="w-4 h-4" /> Comptes</p>
          <p className="text-3xl font-black text-slate-900 mt-1">{dbUsers.length}</p>
          <p className="text-xs text-green-700 font-semibold mt-1">Voir utilisateurs & accès →</p>
        </button>
        <button onClick={() => onNavigate('dashboard')} className="bg-white rounded-2xl border p-4 text-left hover:shadow-md transition-shadow">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1"><LayoutDashboard className="w-4 h-4" /> Repas validés</p>
          <p className="text-3xl font-black text-slate-900 mt-1">{validations.filter((v) => v.status === 'accepted').length}</p>
          <p className="text-xs text-green-700 font-semibold mt-1">Ouvrir le tableau de bord →</p>
        </button>
      </div>

      {offline ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-800">
          <p className="font-bold">⚠️ Base utilisateurs injoignable (mode hors-ligne).</p>
          <p className="mt-1">La gestion des comptes nécessite la connexion Supabase avec la table <code>users</code> migrée (<code>supabase-oresto-migration.sql</code>). Les comptes démo restent utilisables pour la connexion.</p>
        </div>
      ) : (
        <>
          {/* Ajouter un compte */}
          <form onSubmit={handleAdd} className="bg-white rounded-2xl border p-5">
            <p className="font-bold text-slate-800 flex items-center gap-2"><Plus className="w-5 h-5 text-green-700" /> Ajouter un compte{isStaff ? ' (client, personnel)' : ' (caissier)'}</p>
            <div className="mt-3 grid sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Nom d’utilisateur</label>
                <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="ex : parent1" className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm focus:border-green-600 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Rôle</label>
                <select value={allowedRoles.includes(newRole) ? newRole : allowedRoles[0]} onChange={(e) => setNewRole(e.target.value as UserRole)} className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm focus:border-green-600 outline-none bg-white">
                  {allowedRoles.map((r) => (
                    <option key={r} value={r}>{getRoleDef(r).title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Mot de passe (min 6)</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••" className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm focus:border-green-600 outline-none" />
              </div>
              <div className="flex items-end">
                <button type="submit" className="w-full py-2.5 rounded-xl bg-green-700 text-white font-bold text-sm hover:bg-green-800">Créer le compte</button>
              </div>
            </div>
          </form>

          {/* Liste des comptes */}
          <div className="bg-white rounded-2xl border overflow-hidden">
            <p className="p-4 font-bold text-slate-800">Comptes enregistrés ({dbUsers.length})</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr><th className="text-left p-3">Compte</th><th className="text-left p-3">Rôle</th><th className="text-left p-3">Créé le</th><th className="text-right p-3">Actions</th></tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={4} className="p-4 text-center text-slate-400">Chargement…</td></tr>
                  ) : dbUsers.map((u) => {
                    const def = getRoleDef(u.role as UserRole);
                    const isSelf = u.username.trim().toLowerCase() === (user?.username ?? '').trim().toLowerCase();
                    return (
                      <tr key={u.username} className="border-t">
                        <td className="p-3 font-bold capitalize">{u.username}{isSelf && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">vous</span>}</td>
                        <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-bold bg-gradient-to-r ${def.color} text-white`}>{def.title}</span></td>
                        <td className="p-3 text-xs text-slate-500">{u.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR') : '—'}</td>
                        <td className="p-3 text-right">
                          <button onClick={() => handleDelete(u.username)} disabled={isSelf} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${confirmDelete === u.username ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'} disabled:opacity-40`}>
                            <Trash2 className="w-3 h-3 inline mr-1" />{confirmDelete === u.username ? 'Confirmer ?' : 'Supprimer'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && dbUsers.length === 0 && (
                    <tr><td colSpan={4} className="p-4 text-center text-slate-400">Aucun compte en base.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Changer un mot de passe */}
          <form onSubmit={handleResetPassword} className="bg-white rounded-2xl border p-5">
            <p className="font-bold text-slate-800 flex items-center gap-2"><KeyRound className="w-5 h-5 text-green-600" /> Changer le mot de passe d’un compte</p>
            <div className="mt-3 grid sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Compte</label>
                <select value={resetUser} onChange={(e) => setResetUser(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm focus:border-green-600 outline-none bg-white">
                  <option value="">— Choisir —</option>
                  {dbUsers.map((u) => <option key={u.username} value={u.username}>{u.username} ({getRoleDef(u.role as UserRole).title})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Nouveau mot de passe (min 6)</label>
                <input type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="••••••" className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm focus:border-green-600 outline-none" />
              </div>
              <div className="flex items-end">
                <button type="submit" className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-700">Mettre à jour</button>
              </div>
            </div>
          </form>
        </>
      )}

      {/* Raccourcis */}
      <div className="grid sm:grid-cols-3 gap-3">
        <button onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 bg-white border rounded-2xl p-4 text-sm font-bold text-slate-700 hover:shadow-md"><LayoutDashboard className="w-5 h-5 text-slate-500" /> Tableau de bord</button>
        <button onClick={() => onNavigate('history')} className="flex items-center gap-2 bg-white border rounded-2xl p-4 text-sm font-bold text-slate-700 hover:shadow-md"><Receipt className="w-5 h-5 text-blue-500" /> Historiques</button>
        <button onClick={() => onNavigate('menu')} className="flex items-center gap-2 bg-white border rounded-2xl p-4 text-sm font-bold text-slate-700 hover:shadow-md"><UtensilsCrossed className="w-5 h-5 text-green-700" /> Menus</button>
      </div>
    </div>
  );
};

export default SettingsPage;
