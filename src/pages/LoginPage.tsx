import { useEffect, useState } from 'react';
import { useAuth, UserRole, addLocalUserHashed, getLoginLock } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { supabase } from '@/lib/supabase';
import { hashPassword } from '@/lib/password';
import { getClientQrToken } from '@/lib/clientQr';
import { isValidSnPhone } from '@/lib/wave';
import { formatCountdown } from '@/lib/authSecurity';
import { ROLE_DEFINITIONS } from '@/lib/roleTasks';
import OrestoLogo from '@/components/brand/OrestoLogo';
import {
  LogIn, AlertCircle, UserRound, LockKeyhole, Eye, EyeOff, ScanLine, UtensilsCrossed, Smartphone,
  ShoppingCart, Users, LayoutDashboard, Settings, ShieldCheck, KeyRound, Loader2, UserPlus,
  ArrowRight, ArrowLeft, QrCode, Wallet,
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
    { icon: UtensilsCrossed, label: 'Menus du jour' },
  ],
  gestionnaire: [
    { icon: ShoppingCart, label: 'Caisse POS' },
    { icon: LayoutDashboard, label: 'Tableau de bord' },
  ],
  admin: [
    { icon: LayoutDashboard, label: 'Rapports' },
    { icon: Settings, label: 'Gérants' },
  ],
  caissier: [
    { icon: ScanLine, label: 'Scan caméra' },
    { icon: UtensilsCrossed, label: 'Menus du jour' },
  ],
  manager: [
    { icon: LayoutDashboard, label: 'Rapports' },
    { icon: Settings, label: 'Gérants' },
  ],
};

/**
 * Accueil à cartes de profils.
 * - Parent : self-service (connexion + création de compte).
 * - Personnel, gérant, DG : connexion seule, champs vides —
 *   identifiants fournis par le DG via Paramètres → Comptes.
 */
const LoginPage = () => {
  const { login } = useAuth();
  const { saveParentProfile } = useResto();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  // Espace parent : onglets connexion / création de compte
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [suLast, setSuLast] = useState('');
  const [suFirst, setSuFirst] = useState('');
  const [suPhone, setSuPhone] = useState('');
  // Verrouillage anti brute-force : compte à rebours live
  const [lockUntil, setLockUntil] = useState(0);
  const [lockLeft, setLockLeft] = useState('');

  useEffect(() => {
    if (!lockUntil) return;
    const tick = () => {
      const left = lockUntil - Date.now();
      if (left <= 0) {
        setLockUntil(0);
        setLockLeft('');
        setError('');
        return;
      }
      setLockLeft(formatCountdown(left));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [lockUntil]);

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
        const lock = getLoginLock(username);
        if (lock.locked) {
          setLockUntil(Date.now() + lock.retryInMs);
          setError(`Trop de tentatives. Réessayez dans ${formatCountdown(lock.retryInMs)}.`);
        } else {
          setError("Nom d'utilisateur ou mot de passe incorrect");
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const selectRole = (role: UserRole) => {
    setSelectedRole(role);
    // Champs toujours vides : parent comme staff saisissent leurs propres identifiants
    // (staff : fournis par le DG via Paramètres → Comptes).
    setUsername('');
    setPassword('');
    setError('');
    setLockUntil(0);
    setAuthMode('login');
    setSuLast('');
    setSuFirst('');
    setSuPhone('');
  };

  const backToRoles = () => {
    setSelectedRole(null);
    setUsername('');
    setPassword('');
    setError('');
    setLockUntil(0);
    setAuthMode('login');
  };

  const switchModeAuth = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setError('');
    setLockUntil(0);
    setUsername('');
    setPassword('');
    setSuLast('');
    setSuFirst('');
    setSuPhone('');
  };

  const activeRole = selectedRole ? ROLE_DEFINITIONS[selectedRole] : null;
  const isParentSignup = selectedRole === 'client' && authMode === 'signup';

  /** Création de compte parent : identifiants + fiche parent, puis entrée directe. */
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const name = username.trim().toLowerCase();
    if (!name || password.length < 6) {
      setError('Choisissez un nom d’utilisateur et un mot de passe de 6 caractères minimum.');
      return;
    }
    if (!suLast.trim() || !suFirst.trim()) {
      setError('Indiquez votre nom et prénom.');
      return;
    }
    if (!isValidSnPhone(suPhone)) {
      setError('Numéro invalide : format Sénégal (ex : 77 123 45 67).');
      return;
    }
    setSubmitting(true);
    try {
      // 1) Compte local haché (fonctionne même hors-ligne)
      const local = await addLocalUserHashed({ username: name, role: 'client', password });
      if (!local.ok) {
        setError(local.message);
        return;
      }
      // 2) Base distante si joignable (mot de passe haché, jamais en clair)
      try {
        const hashed = await hashPassword(password);
        await supabase.from('users').insert({
          username: name, password: hashed, role: 'client', qr_token: getClientQrToken(name),
        });
      } catch {
        /* hors-ligne : le compte local suffit */
      }
      // 3) Fiche parent + connexion
      saveParentProfile(name, suFirst, suLast, suPhone);
      const ok = await login(name, password);
      if (!ok) setError("Compte créé : reconnectez-vous avec vos identifiants.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!selectedRole) {
    return (
      <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-green-700/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-24 w-[28rem] h-[28rem] bg-orange-600/20 rounded-full blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-4 py-10 md:py-14">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-3 bg-white rounded-3xl px-5 py-3 shadow-2xl">
              <OrestoLogo variant="mark" imgClassName="w-12 h-12 object-contain" />
              <span className="text-left">
                <span className="block text-xl font-black tracking-tight leading-none"><span className="text-green-700">O</span> <span className="text-slate-900">RESTO</span></span>
                <span className="block text-[11px] text-slate-500 font-medium">Cantine scolaire</span>
              </span>
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
              onClick={backToRoles}
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

          <form onSubmit={isParentSignup ? handleSignup : handleLogin} className="p-6 md:p-8 space-y-5">
            {error && (
              <div role="alert" aria-live="assertive" className="bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-700 animate-shake">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-medium">{lockUntil ? `Trop de tentatives. Réessayez dans ${lockLeft}.` : error}</p>
              </div>
            )}

            {selectedRole === 'client' && (
              <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-slate-100">
                <button
                  type="button"
                  onClick={() => switchModeAuth('login')}
                  className={`py-2.5 rounded-xl text-sm font-bold transition ${!isParentSignup ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Se connecter
                </button>
                <button
                  type="button"
                  onClick={() => switchModeAuth('signup')}
                  className={`py-2.5 rounded-xl text-sm font-bold transition ${isParentSignup ? 'bg-green-700 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Créer un compte
                </button>
              </div>
            )}

            {selectedRole !== 'client' && (
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 flex-shrink-0 text-slate-400" />
                Identifiants fournis par la Direction (Paramètres → Comptes).
              </p>
            )}

            {isParentSignup && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <UserRound className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text" value={suLast} onChange={(e) => setSuLast(e.target.value)}
                      autoComplete="family-name" maxLength={40} spellCheck={false}
                      className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 focus:ring-2 focus:ring-green-600/30 focus:border-green-600 outline-none transition-all"
                      placeholder="Votre nom *" required
                    />
                  </div>
                  <div className="relative">
                    <UserRound className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text" value={suFirst} onChange={(e) => setSuFirst(e.target.value)}
                      autoComplete="given-name" maxLength={40} spellCheck={false}
                      className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 focus:ring-2 focus:ring-green-600/30 focus:border-green-600 outline-none transition-all"
                      placeholder="Votre prénom *" required
                    />
                  </div>
                </div>
                <div>
                  <div className="relative">
                    <Smartphone className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="tel" value={suPhone} onChange={(e) => setSuPhone(e.target.value)}
                      autoComplete="tel" maxLength={16}
                      className={`w-full pl-12 pr-4 py-3 rounded-xl border-2 outline-none transition-all ${suPhone === '' || isValidSnPhone(suPhone) ? 'border-slate-200 focus:ring-2 focus:ring-green-600/30 focus:border-green-600' : 'border-red-300 focus:border-red-400'}`}
                      placeholder="Téléphone (77 123 45 67) *" required
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">La cantine utilisera ce numéro pour vous joindre.</p>
                </div>
              </>
            )}

            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-400">
              <KeyRound className="w-3.5 h-3.5" /> Identifiants
            </p>

            <div>
              <label htmlFor="login-username" className="block text-sm font-semibold text-slate-700 mb-2">
                {isParentSignup ? "Choisissez un nom d'utilisateur" : "Nom d'utilisateur"}
              </label>
              <div className="relative">
                <UserRound className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  maxLength={32}
                  spellCheck={false}
                  className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 focus:ring-2 focus:ring-green-600/30 focus:border-green-600 outline-none transition-all"
                  placeholder={isParentSignup ? 'ex : awa2026' : 'Votre nom d’utilisateur'}
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-semibold text-slate-700 mb-2">
                {isParentSignup ? 'Créez un mot de passe (6 caractères min)' : 'Mot de passe'}
              </label>
              <div className="relative">
                <LockKeyhole className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isParentSignup ? 'new-password' : 'current-password'}
                  maxLength={72}
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
              {isParentSignup && (
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Votre QR Carte personnel sera généré à la connexion
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || !!lockUntil}
              className={`w-full py-4 bg-gradient-to-r ${activeRole?.color ?? 'from-green-600 to-orange-600'} text-white rounded-xl font-bold text-lg hover:shadow-lg transition-all hover:scale-[1.02] disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2`}
            >
              {submitting
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : lockUntil ? <LockKeyhole className="w-5 h-5" />
                : isParentSignup ? <UserPlus className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
              {submitting ? (isParentSignup ? 'Création…' : 'Connexion…') : lockUntil ? `Réessayez dans ${lockLeft}` : (isParentSignup ? 'Créer mon compte parent' : 'Entrer dans O RESTO')}
            </button>

            <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 pt-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Vous restez connecté — déconnectez-vous sur appareil partagé
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
