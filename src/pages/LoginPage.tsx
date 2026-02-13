import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { LogIn, User, Lock, AlertCircle } from 'lucide-react';

const LoginPage = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [selectedRole, setSelectedRole] = useState<'caissier' | 'manager' | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    const success = await login(username, password);
    if (!success) {
      setError('Nom d\'utilisateur ou mot de passe incorrect');
    }
  };

  const selectRole = (role: 'caissier' | 'manager') => {
    setSelectedRole(role);
    setUsername(role);
    setPassword('');
    setError('');
  };

  if (!selectedRole) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl">
          <div className="text-center mb-12 animate-fade-in">
            <div className="w-24 h-24 mx-auto mb-4 rounded-xl bg-white shadow-2xl p-2">
              <img 
                src="/logo.png" 
                alt="Palais d'Or" 
                className="w-full h-full object-contain"
              />
            </div>
            <h1 className="text-5xl font-bold text-white mb-4 drop-shadow-lg">
              Palais d'Or
            </h1>
            <p className="text-xl text-white/90 font-medium">
              Système de gestion de restaurant
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 animate-scale-in">
            {/* Caissier */}
            <button
              onClick={() => selectRole('caissier')}
              className="group bg-white rounded-3xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-105 border-4 border-transparent hover:border-blue-500"
            >
              <div className="flex flex-col items-center gap-6">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                  <User className="w-12 h-12 text-white" strokeWidth={2.5} />
                </div>
                <div className="text-center">
                  <h2 className="text-3xl font-bold text-slate-800 mb-2">Caissier</h2>
                  <p className="text-slate-600 font-medium mb-4">
                    Gestion des commandes et caisse
                  </p>
                  <div className="space-y-2 text-sm text-slate-500">
                    <p>✓ Menu produits</p>
                    <p>✓ Point de vente (POS)</p>
                    <p>✓ Historique commandes</p>
                  </div>
                </div>
                <div className="mt-4 px-6 py-3 bg-blue-100 text-blue-700 rounded-xl font-semibold group-hover:bg-blue-200 transition-colors">
                  Se connecter comme Caissier
                </div>
              </div>
            </button>

            {/* Manager */}
            <button
              onClick={() => selectRole('manager')}
              className="group bg-white rounded-3xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-105 border-4 border-transparent hover:border-orange-500"
            >
              <div className="flex flex-col items-center gap-6">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                  <Lock className="w-12 h-12 text-white" strokeWidth={2.5} />
                </div>
                <div className="text-center">
                  <h2 className="text-3xl font-bold text-slate-800 mb-2">Manager</h2>
                  <p className="text-slate-600 font-medium mb-4">
                    Accès complet au système
                  </p>
                  <div className="space-y-2 text-sm text-slate-500">
                    <p>✓ Tableau de bord</p>
                    <p>✓ Gestion du menu</p>
                    <p>✓ Rapports et statistiques</p>
                    <p>✓ Tous les accès</p>
                  </div>
                </div>
                <div className="mt-4 px-6 py-3 bg-orange-100 text-orange-700 rounded-xl font-semibold group-hover:bg-orange-200 transition-colors">
                  Se connecter comme Manager
                </div>
              </div>
            </button>
          </div>

          
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl p-8 animate-scale-in">
          <button
            onClick={() => setSelectedRole(null)}
            className="text-sm text-slate-600 hover:text-slate-800 mb-6 flex items-center gap-2"
          >
            ← Retour au choix du rôle
          </button>

          <div className="text-center mb-8">
            <div className={`w-20 h-20 mx-auto rounded-full ${
              selectedRole === 'caissier' 
                ? 'bg-gradient-to-br from-blue-500 to-indigo-600' 
                : 'bg-gradient-to-br from-orange-500 to-red-600'
            } flex items-center justify-center mb-4 shadow-lg`}>
              {selectedRole === 'caissier' ? (
                <User className="w-10 h-10 text-white" strokeWidth={2.5} />
              ) : (
                <Lock className="w-10 h-10 text-white" strokeWidth={2.5} />
              )}
            </div>
            <h2 className="text-3xl font-bold text-slate-800 mb-2">
              Connexion {selectedRole === 'caissier' ? 'Caissier' : 'Manager'}
            </h2>
            <p className="text-slate-600">
              Entrez vos identifiants pour continuer
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-700 animate-shake">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Nom d'utilisateur
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none transition-all"
                placeholder={selectedRole}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none transition-all"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-bold text-lg hover:shadow-lg hover:shadow-orange-500/50 transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
            >
              <LogIn className="w-5 h-5" />
              Se connecter
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
