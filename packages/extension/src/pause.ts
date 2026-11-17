import { PAUSE_DURATION_MS } from './constants';

/**
 * The five pauses the popup offers. Four end at a timestamp the extension can
 * compute, and `session` ends with the browser, so the session store clears it
 * and no clock is needed.
 */
export type PauseKind = '5m' | '30m' | '1h' | 'today' | 'session';

export const PAUSE_KINDS: readonly PauseKind[] = ['5m', '30m', '1h', 'today', 'session'];

const FIVE_MINUTES_MS = 300000;
const THIRTY_MINUTES_MS = 1800000;

/**
 * The end of today in the reader's own time zone. Adding the day before clearing
 * the hours keeps the answer later than `now`, even at 00:00:01.
 */
export function nextMidnight(now: number): number {
  const today = new Date(now);

  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime();
}

/** The timestamp a kind ends at, or 0 for the kind that the browser ends. */
export function pauseUntilFor(kind: PauseKind, now: number): number {
  switch (kind) {
    case '5m':
      return now + FIVE_MINUTES_MS;
    case '30m':
      return now + THIRTY_MINUTES_MS;
    case '1h':
      return now + PAUSE_DURATION_MS;
    case 'today':
      return nextMidnight(now);
    case 'session':
      return 0;
  }
}

/**
 * How much of a timed pause is left, rounded up so the last second reads one
 * second rather than zero. A session pause has no remainder.
 */
export function remainingOf(until: number, now: number): number | null {
  return until > now ? until - now : null;
}
