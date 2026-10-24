import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/**
 * Expiration automatique des sessions.
 *
 * Deux horloges indépendantes :
 *   - inactivité : après VITE_SESSION_IDLE_MINUTES (défaut 20) sans
 *     interaction, la session se ferme avec un préavis de 60 s (toast
 *     « Rester connecté ») ;
 *   - durée maximale : après VITE_SESSION_MAX_HOURS (défaut 12), la session
 *     se ferme même si l'utilisateur est actif — la reconnexion est alors
 *     obligatoire, surtout sur un poste partagé.
 *
 * Les horloges survivent au rechargement (localStorage) : impossible de
 * repousser l'expiration en actualisant la page.
 */
const CLOCK_KEY = 'o-resto-session-clock';
const TOAST_ID = 'o-resto-session-expiry';

const envIdleMinutes = Number(import.meta.env.VITE_SESSION_IDLE_MINUTES as string | undefined);
const envMaxHours = Number(import.meta.env.VITE_SESSION_MAX_HOURS as string | undefined);
const IDLE_MS = Math.max(1, Number.isFinite(envIdleMinutes) && envIdleMinutes > 0 ? envIdleMinutes : 20) * 60_000;
const MAX_MS = Math.max(1, Number.isFinite(envMaxHours) && envMaxHours > 0 ? envMaxHours : 12) * 3_600_000;
const WARN_MS = 60_000;
const TICK_MS = 15_000;
const WRITE_THROTTLE_MS = 30_000;

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;

export type SessionExpiryReason = 'inactivity' | 'max-duration';

interface SessionClock {
  startedAt: number;
  lastActivity: number;
}

function readClock(): SessionClock | null {
  try {
    const raw = localStorage.getItem(CLOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionClock>;
    const startedAt = Number(parsed.startedAt);
    const lastActivity = Number(parsed.lastActivity);
    if (!Number.isFinite(startedAt) || !Number.isFinite(lastActivity)) return null;
    return { startedAt, lastActivity };
  } catch {
    return null;
  }
}

function writeClock(clock: SessionClock) {
  try {
    localStorage.setItem(CLOCK_KEY, JSON.stringify(clock));
  } catch {
    /* stockage indisponible : l'expiration suivra l'onglet courant seulement */
  }
}

function clearClock() {
  try {
    localStorage.removeItem(CLOCK_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Active la surveillance quand `active` est vrai — c'est-à-dire dès qu'un
 * utilisateur est connecté. À l'expiration, `onExpire` est appelé une fois
 * (déconnexion + message), puis l'écoute s'arrête puisque `active` repasse
 * à faux via l'état d'authentification.
 */
export function useSessionExpiry(active: boolean, onExpire: (reason: SessionExpiryReason) => void) {
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    if (!active) {
      clearClock();
      return;
    }

    const start = Date.now();
    const initial = readClock();
    if (initial && initial.startedAt > start + 5_000) {
      // Horloge incohérente (futur, ex : export d'état) : on repart à zéro.
      clearClock();
    }
    if (!readClock()) writeClock({ startedAt: start, lastActivity: start });

    let warned = false;
    let expired = false;

    const markActivity = () => {
      if (expired) return;
      const current = readClock();
      if (!current) return;
      if (Date.now() - current.lastActivity < WRITE_THROTTLE_MS) return;
      writeClock({ ...current, lastActivity: Date.now() });
      if (warned) {
        warned = false;
        toast.dismiss(TOAST_ID);
      }
    };

    const finish = (reason: SessionExpiryReason) => {
      if (expired) return;
      expired = true;
      warned = false;
      toast.dismiss(TOAST_ID);
      clearClock();
      onExpireRef.current(reason);
    };

    const check = () => {
      if (expired) return;
      let current = readClock();
      if (!current) {
        current = { startedAt: Date.now(), lastActivity: Date.now() };
        writeClock(current);
      }
      const now = Date.now();
      if (now - current.startedAt >= MAX_MS) {
        finish('max-duration');
        return;
      }
      const idleFor = now - current.lastActivity;
      if (idleFor >= IDLE_MS) {
        finish('inactivity');
        return;
      }
      const remainingMs = IDLE_MS - idleFor;
      if (remainingMs <= WARN_MS) {
        warned = true;
        const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
        toast.warning(
          `Session expirée dans ${seconds} s — « Rester connecté » pour continuer.`,
          {
            id: TOAST_ID,
            duration: WARN_MS,
            action: {
              label: 'Rester connecté',
              onClick: () => {
                const fresh = readClock();
                if (fresh) writeClock({ ...fresh, lastActivity: Date.now() });
                warned = false;
                toast.dismiss(TOAST_ID);
              },
            },
          },
        );
      } else if (warned) {
        warned = false;
        toast.dismiss(TOAST_ID);
      }
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActivity, { passive: true, capture: true });
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(check, TICK_MS);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActivity, { capture: true });
      }
      toast.dismiss(TOAST_ID);
    };
  }, [active]);
}
