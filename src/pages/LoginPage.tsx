import { useState } from 'react';
import { useAuth, UserRole } from '@/context/AuthContext';
import { ROLE_DEFINITIONS } from '@/lib/roleTasks';
import OrestoLogo from '@/components/brand/OrestoLogo';
import {
  LogIn, AlertCircle, QrCode, Wallet, ArrowRight, ArrowLeft,
  UserRound, LockKeyhole, Eye, EyeOff, ScanLine, Zap,
  ShoppingCart, Users, LayoutDashboard, Settings, ShieldCheck,
  KeyRound, Loader2,
  type LucideIcon,
} from 'lucide-react';

const ROLE_ORDER: UserRole[] = ['client', 'personnel', 'gestionnaire', 'admin'];

/** Points forts affichés sur chaque carte profil (100 % icônes Lucide). */
const ROLE_HIGHLIGHTS: Record<UserRole, { icon: LucideIcon; label: string }[]> = {
  client: [
    { icon: QrCode, label: 'QR personnel' },
    { icon: Wallet, label: 'Paiement Wave' },
  ],
  personnel: [
    { icon: ScanLine, label: 'Scan caméra' },
    { icon: Zap, label: 'Service rapide' },
  ],
  gestionnaire: [
    { icon: ShoppingCart, label: 'Caisse POS' },
    { icon: Users, label: 'Abonnés' },
  ],
  admin: [
    { icon: LayoutDashboard, label: 'Rapports' },
    { icon: Settings, label: 'Gérants' },
  ],
  caissier: [
    { icon: ScanLine, label: 'Scan caméra' },
    { icon: Zap, label: 'Service rapide' },
  ],
  manager: [
    { icon: LayoutDashboard, label: 'Rapports' },
    { icon: Settings, label: 'Gérants' },
  ],
};

const LoginPage = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    setSubmitting(true);
    try {
      const success = await login(username, password);
      if (!success) {
        setError("Nom d'utilisateur ou mot de passe incorrect");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const selectRole = (role: UserRole) => {
    setSelectedRole(role);
    setUsername(role);
    setPassword(`${role}123`);
    setError('');
  };

  const activeRole = selectedRole ? ROLE_DEFINITIONS[selectedRole] : null;

  if (!selectedRole) {
    return (
      <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
        {/* Décor vert/orange O RESTO */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-green-700/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-24 w-[28rem] h-[28rem] bg-orange-600/20 rounded-full blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-4 py-10 md:py-14">
          {/* Hero logo officiel */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-3 bg-white rounded-3xl px-5 py-3 shadow-2xl mb-5">
              <OrestoLogo variant="mark" imgClassName="w-14 h-14 object-contain" />
              <span className="text-left">
                <span className="block text-2xl font-black tracking-tight leading-none"><span className="text-green-700">O</span> <span className="text-slate-900">RESTO</span></span>
                <span className="block text-[11px] text-slate-500 font-medium">Repas • Abonnements • QR Code</span>
              </span>
            </div>
            <div className="mx-auto max-w-md bg-white rounded-3xl p-4 shadow-xl">
              <OrestoLogo variant="full" imgClassName="w-full max-h-56 object-contain" />
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mt-6">
              La cantine <span className="bg-gradient-to-r from-green-400 to-orange-400 bg-clip-text text-transparent">sans file d’attente</span>
            </h1>
            <p className="text-slate-300 mt-3 text-base md:text-lg">
              Menus • Abonnements • QR Code • Paiement Wave
            </p>
            <p className="text-slate-400 mt-1 text-sm">La gestion des repas et abonnements pour les écoles et entreprises</p>
            <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1"><QrCode className="w-4 h-4" /> 1 QR = 1 repas</span>
              <span className="flex items-center gap-1"><Wallet className="w-4 h-4" /> Paiement en 1 minute</span>
            </div>
          </div>

          {/* Choix du profil */}
          <p className="text-center text-sm font-semibold text-slate-300 mb-4 uppercase tracking-widest">Qui êtes-vous ?</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ROLE_ORDER.map((id) => {
              const r = ROLE_DEFINITIONS[id];
              const RoleIcon = r.icon;
              return (
                <button
                  key={r.role}
                  onClick={() => selectRole(r.role)}
                  className="group text-center bg-white/5 backdrop-blur border border-white/10 rounded-3xl p-6 transition-all duration-300 hover:scale-[1.03] hover:bg-white/10 ring-2 ring-transparent hover:ring-green-400"
                >
                  <div className={`w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br ${r.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                    <RoleIcon className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-xl font-bold mt-4">{r.title}</h2>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2 min-h-8">{r.mission}</p>
                  <div className="mt-3 flex items-center justify-center gap-2">
                    {ROLE_HIGHLIGHTS[r.role].map((h) => (
                      <span key={h.label} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-slate-200">
                        <h.icon className="w-3 h-3" /> {h.label}
                      </span>
                    ))}
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-white/90 group-hover:gap-2 transition-all">
                    Entrer <ArrowRight className="w-4 h-4" />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Comptes démo */}
          <div className="mt-8 mx-auto max-w-3xl bg-white/5 border border-white/10 rounded-2xl p-4 text-center text-sm text-slate-300">
            <p className="font-semibold text-slate-200 mb-2">Comptes de démonstration — mot de passe = nom + 123</p>
            <div className="flex flex-wrap justify-center gap-2">
              {['client', 'personnel', 'gestionnaire', 'admin'].map((a) => (
                <code key={a} className="px-3 py-1 rounded-full bg-black/40 border border-white/10 font-mono text-xs">{a} / {a}123</code>
              ))}
            </div>
          </div>

          <p className="text-center text-xs text-slate-500 mt-6">O RESTO — Écoles & entreprises • Thiès, Sénégal</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className={`absolute -top-32 -right-24 w-96 h-96 rounded-full blur-3xl bg-gradient-to-br ${activeRole?.color ?? 'from-green-600 to-orange-600'} opacity-20`} />
      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
          {/* Bandeau profil */}
          <div className={`bg-gradient-to-r ${activeRole?.color ?? 'from-green-600 to-orange-600'} px-6 pt-5 pb-6 text-white relative overflow-hidden`}>
            <div className="absolute -right-10 -top-10 w-44 h-44 bg-white/10 rounded-full blur-2xl" />
            <button
              onClick={() => setSelectedRole(null)}
              className="relative text-[13px] text-white/85 hover:text-white mb-4 flex items-center gap-1.5 font-semibold transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Changer de profil
            </button>
            <div className="relative flex items-center gap-3">
              <span className="w-14 h-14 rounded-2xl bg-white/20 border border-white/25 shadow-lg flex items-center justify-center flex-shrink-0">
                {activeRole && <activeRole.icon className="w-7 h-7 text-white" />}
              </span>
              <span className="min-w-0">
                <span className="block text-xl font-extrabold leading-tight">{activeRole?.title}</span>
                <span className="block text-xs text-white/80 mt-0.5 leading-snug">{activeRole?.mission}</span>
              </span>
            </div>
            {activeRole && (
              <div className="relative mt-3 flex flex-wrap gap-1.5">
                {ROLE_HIGHLIGHTS[activeRole.role].map((h) => (
                  <span key={h.label} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/15 border border-white/20">
                    <h.icon className="w-3 h-3" /> {h.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleLogin} className="p-6 md:p-8 space-y-5">
            {error && (
              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-700 animate-shake">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}

            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-400">
              <KeyRound className="w-3.5 h-3.5" /> Identifiants
            </p>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Nom d'utilisateur
              </label>
              <div className="relative">
                <UserRound className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 focus:ring-2 focus:ring-green-600/30 focus:border-green-600 outline-none transition-all"
                  placeholder={selectedRole ?? 'utilisateur'}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Mot de passe
              </label>
              <div className="relative">
                <LockKeyhole className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full pl-12 pr-12 py-3 rounded-xl border-2 border-slate-200 text-slate-800 focus:ring-2 focus:ring-green-600/30 focus:border-green-600 outline-none transition-all"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Démo pré-remplie : il suffit de valider
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`w-full py-4 bg-gradient-to-r ${activeRole?.color ?? 'from-green-600 to-orange-600'} text-white rounded-xl font-bold text-lg hover:shadow-lg transition-all hover:scale-[1.02] disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2`}
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              {submitting ? 'Connexion…' : 'Entrer dans O RESTO'}
            </button>

            <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 pt-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Session conservée sur cet appareil uniquement
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
