import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { User, Lock, LogOut, Key, Check, X, AlertCircle } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';

const ProfilePage = () => {
  const { user, logout, changePassword } = useAuth();
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

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  if (!user) return null;

  return (
    <div className="p-4 lg:p-8 space-y-6 animate-fade-in">
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Profil utilisateur</h1>
          <p className="text-sm text-slate-600 mt-1">Gérez votre compte et vos paramètres</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Informations utilisateur */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            <User className="w-5 h-5 text-orange-600" />
            Informations du compte
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <div>
                <p className="text-sm text-slate-600 font-medium">Nom d'utilisateur</p>
                <p className="text-lg font-bold text-slate-800">{user.username}</p>
              </div>
              <div className={`px-4 py-2 rounded-full text-sm font-bold ${
                user.role === 'manager' 
                  ? 'bg-orange-100 text-orange-700' 
                  : 'bg-blue-100 text-blue-700'
              }`}>
                {user.role === 'manager' ? '👑 Manager' : '👤 Caissier'}
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl">
              <p className="text-sm text-slate-600 font-medium mb-2">Permissions</p>
              <div className="space-y-2">
                {user.role === 'manager' ? (
                  <>
                    <p className="text-sm text-slate-700">✓ Accès complet au tableau de bord</p>
                    <p className="text-sm text-slate-700">✓ Gestion du menu</p>
                    <p className="text-sm text-slate-700">✓ Gestion des commandes</p>
                    <p className="text-sm text-slate-700">✓ Point de vente (POS)</p>
                    <p className="text-sm text-slate-700">✓ Rapports et statistiques</p>
                    <p className="text-sm text-slate-700">✓ Gestion du profil</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-700">✓ Consultation du menu</p>
                    <p className="text-sm text-slate-700">✓ Point de vente (POS)</p>
                    <p className="text-sm text-slate-700">✓ Gestion des commandes</p>
                    <p className="text-sm text-slate-400">✗ Tableau de bord</p>
                    <p className="text-sm text-slate-400">✗ Gestion du menu</p>
                    <p className="text-sm text-slate-400">✗ Rapports</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Actions rapides */}
        <div className="space-y-4">
          {/* Changer le mot de passe */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Key className="w-5 h-5 text-orange-600" />
              Sécurité
            </h3>
            <button
              onClick={() => setShowChangePassword(!showChangePassword)}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-blue-500/50 transition-all flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              Changer le mot de passe
            </button>
          </div>

          {/* Déconnexion */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <LogOut className="w-5 h-5 text-red-600" />
              Session
            </h3>
            <button
              onClick={handleLogout}
              className="w-full py-3 bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-red-500/50 transition-all flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Se déconnecter
            </button>
          </div>
        </div>
      </div>

      {/* Modal Changement de mot de passe */}
      {showChangePassword && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowChangePassword(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Lock className="w-5 h-5 text-blue-600" />
                Changer le mot de passe
              </h2>
              <button onClick={() => setShowChangePassword(false)} className="p-2 hover:bg-white rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="p-6 space-y-5">
              {message && (
                <div className={`p-4 rounded-xl flex items-center gap-3 ${
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
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none transition-all"
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
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none transition-all"
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
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none transition-all"
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
                  className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold hover:shadow-lg hover:shadow-blue-500/50 transition-all flex items-center justify-center gap-2"
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
