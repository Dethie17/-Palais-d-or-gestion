import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getRoleDef } from '@/lib/roleTasks';
import { Lock, LogOut, Check, X, AlertCircle, ShieldCheck } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';

/**
 * Profil — volontairement minimal, identique pour tous les rôles :
 * déconnexion + changement de mot de passe, rien d'autre.
 * Présentation premium : carte sombre, avatar rôle, boutons soignés.
 */
const ProfilePage = () => {
  const { user, logout, changePassword } = useAuth();
  const roleDef = getRoleDef(user?.role);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Les nouveaux mots de passe ne correspondent pas' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Le mot de passe doit contenir au moins 6 caractères' });
      return;
    }

    const success = await changePassword(currentPassword, newPassword);
    if (success) {
      setMessage({ type: 'success', text: 'Mot de passe modifié avec succès !' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setShowChangePassword(false);
        setMessage(null);
      }, 2000);
    } else {
      setMessage({ type: 'error', text: 'Mot de passe actuel incorrect' });
    }
  };

  if (!user) return null;

  const RoleIcon = roleDef.icon;
  // Seuls parents et DG changent leur mot de passe seuls ;
  // personnel / gérant : réinitialisé uniquement par le DG (Paramètres → Comptes).
  const canChangeOwnPassword = user.role === 'client' || user.role === 'admin' || user.role === 'manager';

  return (
    <div className="p-4 lg:p-8 animate-fade-in max-w-md mx-auto">
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
      <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Profil</h1>
      <p className="text-sm text-slate-500 mt-1">Votre compte en un coup d’œil.</p>

      <div className="mt-6 overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl relative">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-emerald-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-28 -left-20 w-72 h-72 bg-orange-500/10 rounded-full blur-3xl" />

        <div className="relative px-8 pt-8 pb-6 text-center">
          <span className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${roleDef.color} inline-flex items-center justify-center shadow-lg ring-4 ring-white/10`}>
            <RoleIcon className="w-10 h-10 text-white" />
          </span>
          <p className="mt-4 text-2xl font-black tracking-tight capitalize">{user.username}</p>
          <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-full bg-gradient-to-r ${roleDef.color}`}>
              <RoleIcon className="w-3.5 h-3.5" /> {roleDef.title}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Connecté
            </span>
          </div>
        </div>

        <div className="relative bg-white rounded-t-3xl p-6 space-y-3">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-red-500 to-pink-600 text-white font-bold text-base hover:shadow-lg hover:shadow-red-500/30 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2"
          >
            <LogOut className="w-5 h-5" /> Se déconnecter
          </button>
          {canChangeOwnPassword ? (
            <button
              onClick={() => setShowChangePassword(!showChangePassword)}
              className="w-full py-3.5 rounded-2xl bg-slate-900 text-white font-bold hover:bg-slate-700 hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" /> Changer le mot de passe
            </button>
          ) : (
            <p className="w-full py-3 rounded-2xl bg-slate-100 text-slate-500 font-bold text-sm flex items-center justify-center gap-2">
              <Lock className="w-4 h-4" /> Mot de passe géré par la Direction
            </p>
          )}
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 pt-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Connexion protégée — ne partagez jamais vos identifiants
          </p>
        </div>
      </div>

      {/* Modal Changement de mot de passe */}
      {showChangePassword && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowChangePassword(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-green-50 to-emerald-50 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Lock className="w-5 h-5 text-green-600" />
                Changer le mot de passe
              </h2>
              <button onClick={() => setShowChangePassword(false)} className="p-2 hover:bg-white rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="p-6 space-y-5">
              {message && (
                <div role="alert" className={`p-4 rounded-xl flex items-center gap-3 ${
                  message.type === 'success'
                    ? 'bg-green-50 border-2 border-green-200 text-green-700'
                    : 'bg-red-50 border-2 border-red-200 text-red-700'
                }`}>
                  {message.type === 'success' ? (
                    <Check className="w-5 h-5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  )}
                  <p className="text-sm font-medium">{message.text}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Mot de passe actuel
                </label>
                <input
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
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Nouveau mot de passe
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  maxLength={72}
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 focus:ring-2 focus:ring-green-600/30 focus:border-green-600 outline-none transition-all"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
                <p className="text-xs text-slate-500 mt-1">Minimum 6 caractères</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Confirmer le nouveau mot de passe
                </label>
                <input
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
                  onClick={() => setShowChangePassword(false)}
                  className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <Check className="w-5 h-5" />
                  Modifier
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
