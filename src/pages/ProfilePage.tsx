import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getRoleDef } from '@/lib/roleTasks';
import {
  Lock,
  LogOut,
  Check,
  X,
  AlertCircle,
  ShieldCheck,
  UserRound,
  KeyRound,
} from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';

/**
 * Profil — compte de l'utilisateur connecté.
 * L'Espace ISM gère lui-même son identifiant de connexion et son mot de
 * passe (vérification du mot de passe actuel côté serveur). Les autres
 * profils disposent de la déconnexion et, pour les parents, du mot de passe.
 */
const ProfilePage = () => {
  const { user, logout, changePassword, changeUsername } = useAuth();
  const roleDef = getRoleDef(user?.role);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState('');
  const [currentUsernamePassword, setCurrentUsernamePassword] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameMessage, setUsernameMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!user) return null;

  const canChangeOwnPassword = user.role === 'client' || user.role === 'admin';
  const canChangeUsername = user.role === 'admin';
  const minPasswordLength = user.role === 'admin' ? 8 : 6;
  const RoleIcon = roleDef.icon;

  const closePasswordModal = () => {
    setShowChangePassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setMessage(null);
  };

  const handleChangeUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameMessage(null);
    if (!newUsername.trim()) {
      setUsernameMessage({ type: 'error', text: 'Saisissez le nouvel identifiant.' });
      return;
    }
    setUsernameSaving(true);
    try {
      const result = await changeUsername(newUsername, currentUsernamePassword);
      if (result.ok) {
        setUsernameMessage({
          type: 'success',
          text: 'Identifiant mis à jour. Utilisez-le dès votre prochaine connexion.',
        });
        setNewUsername('');
        setCurrentUsernamePassword('');
      } else {
        setUsernameMessage({
          type: 'error',
          text: result.error ?? 'Modification de l’identifiant impossible.',
        });
      }
    } finally {
      setUsernameSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Les nouveaux mots de passe ne correspondent pas.' });
      return;
    }
    if (newPassword.length < minPasswordLength) {
      setMessage({
        type: 'error',
        text: `Le mot de passe doit contenir au moins ${minPasswordLength} caractères.`,
      });
      return;
    }

    setPasswordSaving(true);
    try {
      const result = await changePassword(currentPassword, newPassword);
      if (result.ok) {
        closePasswordModal();
        setPasswordNotice('Mot de passe modifié avec succès.');
        window.setTimeout(() => setPasswordNotice(null), 5000);
      } else {
        setMessage({
          type: 'error',
          text: result.error ?? 'Mot de passe actuel incorrect.',
        });
      }
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="p-4 lg:p-8 animate-fade-in max-w-lg mx-auto">
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={logout}
        title="Déconnexion"
        message="Êtes-vous sûr de vouloir vous déconnecter ?"
        type="warning"
        confirmText="Se déconnecter"
        cancelText="Annuler"
      />
      <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Mon compte</h1>
      <p className="text-sm text-slate-500 mt-1">Identifiants et sécurité de connexion.</p>

      <div className="mt-6 overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl relative">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-emerald-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-28 -left-20 w-72 h-72 bg-slate-500/10 rounded-full blur-3xl" />

        <div className="relative px-8 pt-8 pb-6 text-center">
          <span className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${roleDef.color} inline-flex items-center justify-center shadow-lg ring-4 ring-white/10`}>
            <RoleIcon className="w-10 h-10 text-white" />
          </span>
          <p className="mt-4 text-2xl font-black tracking-tight truncate">{user.username}</p>
          <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-full bg-gradient-to-r ${roleDef.color}`}>
              <RoleIcon className="w-3.5 h-3.5" /> {roleDef.title}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Connecté
            </span>
          </div>
        </div>
      </div>

      {passwordNotice && (
        <div
          role="status"
          className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 flex items-center gap-2"
        >
          <Check className="w-4 h-4" /> {passwordNotice}
        </div>
      )}

      {canChangeUsername && (
        <section className="mt-4 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 grid place-items-center flex-shrink-0">
              <UserRound className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-black text-slate-900">Identifiant de connexion</h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                3 à 24 caractères : lettres, chiffres, point, tiret ou underscore.
              </p>
            </div>
          </div>

          <form onSubmit={handleChangeUsername} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                Identifiant actuel
              </label>
              <div className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-slate-700 font-semibold">
                {user.username}
              </div>
            </div>
            <div>
              <label htmlFor="new-username" className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                Nouvel identifiant
              </label>
              <input
                id="new-username"
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="ex : direction.ism"
                autoComplete="username"
                maxLength={24}
                spellCheck={false}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-900 font-medium focus:border-slate-900 focus:outline-none transition-colors"
                required
              />
            </div>
            <div>
              <label htmlFor="username-password" className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                Mot de passe actuel
              </label>
              <input
                id="username-password"
                type="password"
                value={currentUsernamePassword}
                onChange={(e) => setCurrentUsernamePassword(e.target.value)}
                placeholder="Confirmez avec votre mot de passe"
                autoComplete="current-password"
                maxLength={72}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-900 font-medium focus:border-slate-900 focus:outline-none transition-colors"
                required
              />
            </div>

            {usernameMessage && (
              <div
                role="alert"
                className={`rounded-xl px-4 py-3 text-sm font-semibold flex items-center gap-2 ${
                  usernameMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {usernameMessage.type === 'success' ? (
                  <Check className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                )}
                {usernameMessage.text}
              </div>
            )}

            <button
              type="submit"
              disabled={usernameSaving}
              className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <UserRound className="w-4 h-4" />
              {usernameSaving ? 'Enregistrement…' : 'Enregistrer l’identifiant'}
            </button>
          </form>
        </section>
      )}

      <section className="mt-4 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 grid place-items-center flex-shrink-0">
            <KeyRound className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-black text-slate-900">Mot de passe</h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {canChangeOwnPassword
                ? `${minPasswordLength} caractères minimum. Le mot de passe actuel est demandé à chaque changement.`
                : 'Votre mot de passe est géré par la Direction (Paramètres → Comptes).'}
            </p>
          </div>
        </div>

        {canChangeOwnPassword ? (
          <button
            onClick={() => setShowChangePassword(true)}
            className="mt-4 w-full py-3.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" /> Changer le mot de passe
          </button>
        ) : (
          <p className="mt-4 w-full py-3 rounded-xl bg-slate-100 text-slate-500 font-bold text-sm flex items-center justify-center gap-2">
            <Lock className="w-4 h-4" /> Mot de passe géré par la Direction
          </p>
        )}
      </section>

      <button
        onClick={() => setShowLogoutConfirm(true)}
        className="mt-4 w-full py-4 rounded-2xl bg-gradient-to-r from-red-500 to-pink-600 text-white font-bold text-base hover:shadow-lg hover:shadow-red-500/30 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2"
      >
        <LogOut className="w-5 h-5" /> Se déconnecter
      </button>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
        <ShieldCheck className="w-3.5 h-3.5" /> Connexion protégée — ne partagez jamais vos identifiants
      </p>

      {showChangePassword && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={closePasswordModal}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-green-50 to-emerald-50 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Lock className="w-5 h-5 text-green-600" />
                Changer le mot de passe
              </h2>
              <button
                onClick={closePasswordModal}
                aria-label="Fermer"
                className="p-2 hover:bg-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="p-6 space-y-5">
              {message && (
                <div
                  role="alert"
                  className={`p-4 rounded-xl flex items-center gap-3 ${
                    message.type === 'success'
                      ? 'bg-green-50 border-2 border-green-200 text-green-700'
                      : 'bg-red-50 border-2 border-red-200 text-red-700'
                  }`}
                >
                  {message.type === 'success' ? (
                    <Check className="w-5 h-5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  )}
                  <p className="text-sm font-medium">{message.text}</p>
                </div>
              )}

              <div>
                <label htmlFor="current-password" className="block text-sm font-semibold text-slate-700 mb-2">
                  Mot de passe actuel
                </label>
                <input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  maxLength={72}
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 focus:ring-2 focus:ring-green-600/30 focus:border-green-600 outline-none transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>

              <div>
                <label htmlFor="new-password" className="block text-sm font-semibold text-slate-700 mb-2">
                  Nouveau mot de passe
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  maxLength={72}
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 focus:ring-2 focus:ring-green-600/30 focus:border-green-600 outline-none transition-all"
                  placeholder="••••••••"
                  required
                  minLength={minPasswordLength}
                />
                <p className="text-xs text-slate-500 mt-1">Minimum {minPasswordLength} caractères</p>
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-semibold text-slate-700 mb-2">
                  Confirmer le nouveau mot de passe
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  maxLength={72}
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 focus:ring-2 focus:ring-green-600/30 focus:border-green-600 outline-none transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closePasswordModal}
                  className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Check className="w-5 h-5" />
                  {passwordSaving ? 'Modification…' : 'Modifier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
