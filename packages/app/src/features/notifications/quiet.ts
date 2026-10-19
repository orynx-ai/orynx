import type { DoNotDisturb, PauseLength } from '@devhub/contracts';
import { hour } from '../../words/calendar.ts';

/**
 * When Pause now ends if turned on at `now` (spec 029): in an hour, at 9:00 tomorrow on the laptop's clock, or
 * never (null) until you turn it off.
 */
export function pauseUntil(length: PauseLength, now: Date): string | null {
  if (length === 'until_off') return null;
  if (length === 'hour') return new Date(now.getTime() + hour).toISOString();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0).toISOString();
}

/** Whether Do not disturb holds at `now`: on, and not past its end, so it turns itself off (AC-31). */
export function pausedNow(doNotDisturb: DoNotDisturb, now: Date): boolean {
  return doNotDisturb.on && (doNotDisturb.until === null || Date.parse(doNotDisturb.until) > now.getTime());
}
