import { useEffect, useState } from 'react';
import { QrCode, Wallet, UtensilsCrossed } from 'lucide-react';
import OrestoLogo from './brand/OrestoLogo';

const DISPLAY_MS = 2200;
const FADE_MS = 400;

interface SplashScreenProps {
  onDone: () => void;
}

/**
 * Écran d'ouverture O RESTO : logo animé une seule fois par session.
 * Accessible : dialogue modal, fermeture Escape / clic bouton, respecte reduced-motion.
 */
const SplashScreen = ({ onDone }: SplashScreenProps) => {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('o-resto-splash-seen') === '1') {
        onDone();
        return;
      }
    } catch { /* stockage indisponible : afficher quand même */ }
    const t1 = window.setTimeout(() => setLeaving(true), DISPLAY_MS);
    const t2 = window.setTimeout(() => {
      try { sessionStorage.setItem('o-resto-splash-seen', '1'); } catch { /* ignore */ }
      onDone();
    }, DISPLAY_MS + FADE_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [onDone]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  const handleClose = () => {
    try { sessionStorage.setItem('o-resto-splash-seen', '1'); } catch { /* ignore */ }
    onDone();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenue sur O Resto"
      className={`fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center overflow-hidden transition-opacity ${leaving ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      {/* Halos décoratifs */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-green-700/30 rounded-full blur-3xl" />
      <div className="absolute -bottom-40 -right-24 w-[28rem] h-[28rem] bg-orange-600/20 rounded-full blur-3xl" />

      <div className="relative text-center px-6 splash-rise">
        <div className="inline-block bg-white rounded-3xl p-5 shadow-2xl splash-pop">
          <OrestoLogo variant="full" imgClassName="w-56 md:w-72 max-h-44 object-contain" />
        </div>
        <p className="mt-5 text-slate-300 text-sm font-semibold tracking-wide">
          Repas • Abonnements • QR Code
        </p>
        <div className="mt-4 w-56 md:w-72 mx-auto">
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-green-500 to-orange-500 splash-bar" />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1"><UtensilsCrossed aria-hidden className="w-3.5 h-3.5" /> Cantine</span>
          <span className="flex items-center gap-1"><Wallet aria-hidden className="w-3.5 h-3.5" /> Paiement Wave</span>
          <span className="flex items-center gap-1"><QrCode aria-hidden className="w-3.5 h-3.5" /> QR personnel</span>
        </div>
        <button
          onClick={handleClose}
          className="mt-6 rounded-xl border border-white/20 px-6 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10 focus-visible:outline-white"
        >
          Entrer
        </button>
      </div>
    </div>
  );
};

export default SplashScreen;
