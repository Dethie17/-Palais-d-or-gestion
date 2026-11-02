import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  dismissInstall,
  installDismissed,
  INSTALL_DISMISS_MS,
  isIos,
  isMobileDevice,
  isSafari,
} from '@/lib/pwa';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function setUserAgent(userAgent: string) {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('détection PWA mobile', () => {
  it('reconnaît iPhone/Safari et propose le chemin « Sur l’écran d’accueil »', () => {
    setUserAgent(IPHONE_SAFARI);
    expect(isIos()).toBe(true);
    expect(isSafari()).toBe(true);
    expect(isMobileDevice()).toBe(true);
  });

  it('reconnaît Android/Chrome sans le confondre avec Safari', () => {
    setUserAgent(ANDROID_CHROME);
    expect(isIos()).toBe(false);
    expect(isSafari()).toBe(false);
    expect(isMobileDevice()).toBe(true);
  });

  it('ne propose rien sur un ordinateur de bureau', () => {
    setUserAgent(DESKTOP_CHROME);
    expect(isMobileDevice()).toBe(false);
  });

  it('mémorise la fermeture de l’invite pendant 7 jours', () => {
    const now = 1_000_000_000;
    expect(installDismissed(now)).toBe(false);
    dismissInstall(now);
    expect(installDismissed(now + INSTALL_DISMISS_MS - 1)).toBe(true);
    expect(installDismissed(now + INSTALL_DISMISS_MS + 1)).toBe(false);
  });
});
