import { describe, it, expect } from 'vitest';
import {
  evaluateSessionClock,
  SESSION_IDLE_MS,
  SESSION_MAX_MS,
  SESSION_WARN_MS,
} from '@/lib/sessionExpiry';

const START = 1_000_000;

function clockAt(now: number, lastActivity = START) {
  return { startedAt: START, lastActivity };
}

describe('expiration des sessions', () => {
  it('reste active tant que l’inactivité est sous la limite', () => {
    const state = evaluateSessionClock(clockAt(START + 60_000), START + 60_000);
    expect(state.status).toBe('active');
    if (state.status === 'active') {
      expect(state.remainingMs).toBe(SESSION_IDLE_MS - 60_000);
    }
  });

  it('affiche le préavis une minute avant l’expiration', () => {
    const now = START + SESSION_IDLE_MS - SESSION_WARN_MS;
    const state = evaluateSessionClock(clockAt(now), now);
    expect(state.status).toBe('warning');
    if (state.status === 'warning') {
      expect(state.remainingMs).toBe(SESSION_WARN_MS);
    }
  });

  it('ferme la session après inactivité', () => {
    const now = START + SESSION_IDLE_MS;
    expect(evaluateSessionClock(clockAt(now), now)).toEqual({
      status: 'expired',
      reason: 'inactivity',
      remainingMs: 0,
    });
  });

  it('une activité récente repousse l’inactivité sans dépasser la durée max', () => {
    const now = START + 19 * 60_000;
    const state = evaluateSessionClock(clockAt(now, now - 60_000), now);
    expect(state.status).toBe('active');

    const tooLate = START + SESSION_MAX_MS;
    expect(evaluateSessionClock(clockAt(tooLate, tooLate), tooLate)).toEqual({
      status: 'expired',
      reason: 'max-duration',
      remainingMs: 0,
    });
  });

  it('la durée maximale prime sur l’inactivité', () => {
    const now = START + SESSION_MAX_MS;
    const state = evaluateSessionClock({ startedAt: START, lastActivity: now }, now);
    expect(state.status).toBe('expired');
    if (state.status === 'expired') {
      expect(state.reason).toBe('max-duration');
    }
  });
});
