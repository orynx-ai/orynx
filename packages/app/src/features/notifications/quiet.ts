import {
  notificationEventOf,
  type DoNotDisturb,
  type NotificationSettings,
  type NotificationSound,
  type NotificationWhat,
  type PauseLength,
  type QuietHours,
} from '@devhub/contracts';
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

function minutesOf(clock: string): number {
  const [hours = 0, minutes = 0] = clock.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Monday is 0, as Settings lists the days. */
function weekday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * Whether quiet hours hold at `now` on the laptop's clock (AC-30). Hours that cross midnight belong to the day they
 * start: Friday 19:00 to Saturday 09:00 is Friday's.
 */
export function inQuietHours(hours: QuietHours, now: Date): boolean {
  if (!hours.on) return false;
  const from = minutesOf(hours.from);
  const to = minutesOf(hours.to);
  const at = now.getHours() * 60 + now.getMinutes();
  const today = hours.days[weekday(now)] === true;
  if (from < to) return today && at >= from && at < to;
  const yesterday = hours.days[(weekday(now) + 6) % 7] === true;
  return (today && at >= from) || (yesterday && at < to);
}

/** How one notification reaches you at `now`, beyond the list: each `false`, or no sound, when it shouldn't. */
export interface Delivery {
  popUp: boolean;
  desktop: boolean;
  sound: Exclude<NotificationSound, 'none'> | null;
}

/**
 * Settings › Notifications applied to one notification (AC-26, AC-28, AC-29, AC-30): its row's choices, under the
 * three switches, all paused by Do not disturb or quiet hours, unless it's an approval and those break through.
 */
export function delivery(what: NotificationWhat, settings: NotificationSettings, now: Date): Delivery {
  const quiet = pausedNow(settings.doNotDisturb, now) || inQuietHours(settings.quietHours, now);
  if (quiet && !(what.kind === 'approval' && settings.approvalsBreakThrough)) {
    return { popUp: false, desktop: false, sound: null };
  }
  const choice = settings.events[notificationEventOf(what.kind)];
  return {
    popUp: settings.popUps && choice.popUp,
    desktop: settings.desktop && choice.desktop,
    sound: settings.sounds && choice.sound !== 'none' ? choice.sound : null,
  };
}
