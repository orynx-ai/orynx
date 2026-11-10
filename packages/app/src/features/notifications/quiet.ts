import type { PauseLength } from '@devhub/contracts';
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
