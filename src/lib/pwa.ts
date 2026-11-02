/**
 * Détection d'installation PWA — fonctions pures, testables.
 *
 * Chrome/Android expose `beforeinstallprompt` ; iOS ne l'expose pas et impose
 * le menu Partager → « Sur l'écran d'accueil ». On adapte donc le message.
 */

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'o-resto-install-dismissed-at';
export const INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

/** L'application tourne-t-elle déjà en mode installé ? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const media =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(media || iosStandalone);
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  // iPad récent se présente comme un Mac tactile.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /safari/i.test(ua) && !/chrome|crios|fxios|edgios|android/i.test(ua);
}

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod|mobile|windows phone/i.test(navigator.userAgent || '');
}

/** L'invite a-t-elle été fermée récemment ? */
export function installDismissed(now = Date.now()): boolean {
  try {
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY));
    return (
      Number.isFinite(dismissedAt) &&
      dismissedAt > 0 &&
      now - dismissedAt < INSTALL_DISMISS_MS
    );
  } catch {
    return false;
  }
}

export function dismissInstall(now = Date.now()): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(now));
  } catch {
    /* stockage indisponible : l'invite pourra revenir au prochain chargement */
  }
}
