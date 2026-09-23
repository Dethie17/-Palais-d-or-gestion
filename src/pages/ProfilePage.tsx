import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getRoleDef } from '@/lib/roleTasks';
import { ROLE_PAGES, PAGE_LABEL } from '@/lib/permissions';
import OrestoLogo from '@/components/brand/OrestoLogo';
import { User, Lock, LogOut, Key, Check, X, AlertCircle, LayoutGrid, Gauge } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';

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
  const myPages = ROLE_PAGES[user.role] ?? [];

  return (
    <div className="p-4 lg:p-8 space-y-6 animate-fade-in max-w-5xl mx-auto">
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
          <p className="text-sm text-slate-600 mt-1">Votre compte et votre périmètre d’accès.</p>
        </div>
        <div className="w-16 h-16 bg-white border rounded-2xl p-1 shadow overflow-hidden">
          <OrestoLogo variant="mark" imgClassName="w-full h-full object-contain" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Informations utilisateur */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            <User className="w-5 h-5 text-green-700" />
            Informations du compte
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <div>
                <p className="text-sm text-slate-600 font-medium">Nom d'utilisateur</p>
                <p className="text-lg font-bold text-slate-800 capitalize">{user.username}</p>
                {user.qrToken && <p className="text-xs font-mono text-slate-500">{user.qrToken}</p>}
              </div>
              <div className={`px-4 py-2 rounded-full text-sm font-bold bg-gradient-to-r ${roleDef.color} text-white flex items-center gap-1.5`}>
                <RoleIcon className="w-4 h-4" /> {roleDef.title}
              </div>
            </div>

            <div className={`p-4 rounded-xl bg-gradient-to-r ${roleDef.color} text-white`}>
              <p className="text-sm font-bold">Votre mission</p>
              <p className="text-sm opacity-95 mt-1">{roleDef.mission}</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl">
              <p className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5"><LayoutGrid className="w-4 h-4" /> Mon périmètre d’accès</p>
              <div className="flex flex-wrap gap-1.5">
                {myPages.map((p) => (
                  <span key={p} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white border text-slate-600">
                    {PAGE_LABEL[p] ?? p}
                  </span>
                ))}
              </div>
              {roleDef.kpis.length > 0 && (
                <p className="text-xs font-bold text-slate-500 mt-3 mb-1.5 flex items-center gap-1"><Gauge className="w-3.5 h-3.5" /> Indicateurs suivis</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {roleDef.kpis.map((k) => (
                  <span key={k} className="text-xs px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-green-800 font-semibold">
                    {k}
                  </span>
                ))}
              </div>
              {roleDef.forbidden.length > 0 && (
                <div className="mt-3 p-3 bg-white border border-dashed rounded-xl">
                  <p className="text-xs font-bold text-slate-500">Hors périmètre (réservé aux autres profils) :</p>
                  <p className="text-xs text-slate-400 mt-1">{roleDef.forbidden.join(' • ')}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions rapides */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Key className="w-5 h-5 text-green-700" />
              Sécurité
            </h3>
            <button
              onClick={() => setShowChangePassword(!showChangePassword)}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              Changer le mot de passe
            </button>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <LogOut className="w-5 h-5 text-red-600" />
              Session
            </h3>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="w-full py-3 bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Se déconnecter
            </button>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-xs text-green-800">
            <p className="font-bold">Rappel O RESTO</p>
            <p className="mt-1">Client : gardez votre QR. Personnel : 1 scan = 1 repas servi. Gérant de cantine : encaissez les espèces et tenez la caisse POS. Directeur : exportez les rapports PDF/Excel.</p>
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
                  className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2"
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
