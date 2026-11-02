import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import {
  dismissInstall,
  installDismissed,
  isIos,
  isMobileDevice,
  isSafari,
  isStandalone,
  type BeforeInstallPromptEvent,
} from '@/lib/pwa';

/**
 * Invite d'installation discrète sur mobile.
 *
 * Android/Chrome : le navigateur fournit `beforeinstallprompt`, on déclenche
 * l'installation native. iOS/Safari : aucune API, on explique le chemin
 * Partager → « Sur l'écran d'accueil ». Une fermeture est mémorisée 7 jours.
 */
const InstallAppPrompt = () => {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isStandalone() || installDismissed() || !isMobileDevice()) return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setIos(false);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    if (isIos() && isSafari()) {
      setIos(true);
      setVisible(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!visible) return null;

  const install = async () => {
    if (!deferred) return;
    setBusy(true);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') setVisible(false);
      else dismissInstall();
    } catch {
      /* le navigateur a refusé l'invite : on ne bloque pas l'utilisateur */
    } finally {
      setBusy(false);
      setDeferred(null);
    }
  };

  const close = () => {
    dismissInstall();
    setVisible(false);
  };

  return (
    <div
      className="fixed inset-x-3 bottom-3 z-[80] sm:left-auto sm:right-4 sm:w-[380px]"
      role="region"
      aria-label="Installer O RESTO"
      data-testid="install-app"
    >
      <div
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-green-700 text-white grid place-items-center flex-shrink-0">
            <Download aria-hidden className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold text-slate-900 text-sm">Installer O RESTO</p>
            {ios ? (
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Sur iPhone/iPad : appuyez sur{' '}
                <Share aria-hidden className="inline w-3.5 h-3.5 -mt-0.5" />{' '}
                <strong>Partager</strong>, puis <strong>Sur l’écran d’accueil</strong>.
              </p>
            ) : (
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Accès direct depuis l’écran d’accueil, comme une application.
              </p>
            )}
            {!ios && (
              <button
                type="button"
                onClick={() => void install()}
                disabled={busy || !deferred}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-700 text-white text-xs font-bold hover:bg-green-800 disabled:opacity-60"
              >
                <Download aria-hidden className="w-3.5 h-3.5" />
                {busy ? 'Ouverture…' : 'Installer'}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Fermer l’invite d’installation"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X aria-hidden className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallAppPrompt;
