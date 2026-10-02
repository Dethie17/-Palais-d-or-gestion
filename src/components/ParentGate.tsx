import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { isValidSnPhone } from '@/lib/wave';
import OrestoLogo from '@/components/brand/OrestoLogo';
import { UserRound, Phone, ArrowRight, AlertCircle, LogOut, BadgeCheck } from 'lucide-react';

/**
 * Portail d'accès à l'espace parent : en guise de login, chaque parent
 * renseigne nom, prénom et téléphone avant d'entrer. Une seule fois :
 * la fiche est conservée et modifiable depuis le Profil.
 */
const ParentGate = ({ username }: { username: string }) => {
  const { logout } = useAuth();
  const { saveParentProfile } = useResto();
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!lastName.trim() || !firstName.trim()) {
      setError('Indiquez votre nom et prénom.');
      return;
    }
    if (!isValidSnPhone(phone)) {
      setError('Numéro invalide : format Sénégal (ex : 77 123 45 67).');
      return;
    }
    try {
      saveParentProfile(username, firstName, lastName, phone);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-green-700/30 rounded-full blur-3xl" />
      <div className="absolute -bottom-40 -right-24 w-[28rem] h-[28rem] bg-orange-600/20 rounded-full blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-3 bg-white rounded-3xl px-5 py-3 shadow-2xl">
            <OrestoLogo variant="mark" imgClassName="w-12 h-12 object-contain" />
            <span className="text-left">
              <span className="block text-xl font-black tracking-tight leading-none"><span className="text-green-700">O</span> <span className="text-slate-900">RESTO</span></span>
              <span className="block text-[11px] text-slate-500 font-medium">Espace parent</span>
            </span>
          </div>
        </div>
        <form onSubmit={submit} className="bg-white rounded-3xl shadow-2xl overflow-hidden text-slate-800">
          <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 pt-6 pb-6 text-white">
            <p className="font-extrabold text-xl flex items-center gap-2">
              <BadgeCheck className="w-6 h-6" /> Bienvenue, parent
            </p>
            <p className="text-sm text-white/85 mt-1">
              Pour inscrire vos enfants et recevoir leurs QR Cartes, indiquez vos informations : la cantine pourra vous joindre.
            </p>
          </div>
          <div className="p-6 space-y-4">
            {error && (
              <p role="alert" className="flex items-center gap-2 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <UserRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Votre nom *" required maxLength={40} autoComplete="family-name" spellCheck={false}
                  className="w-full pl-9 pr-3 py-3 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-indigo-500" />
              </div>
              <div className="relative">
                <UserRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Votre prénom *" required maxLength={40} autoComplete="given-name" spellCheck={false}
                  className="w-full pl-9 pr-3 py-3 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-indigo-500" />
              </div>
            </div>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={16} placeholder="Téléphone (77 123 45 67) *" required
                className={`w-full pl-9 pr-3 py-3 rounded-xl border-2 text-sm outline-none ${phone === '' || isValidSnPhone(phone) ? 'border-slate-200 focus:border-indigo-500' : 'border-red-300 focus:border-red-400'}`} />
            </div>
            <button type="submit" className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 flex items-center justify-center gap-2">
              Entrer dans mon espace <ArrowRight className="w-4 h-4" />
            </button>
            <button type="button" onClick={logout} className="w-full text-xs font-bold text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1">
              <LogOut className="w-3.5 h-3.5" /> Changer de compte
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ParentGate;
