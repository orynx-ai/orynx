/**
 * The laptop's calendar, as Home (spec 007) and Tickets (spec 008) write dates and waits. The server sends
 * calendar days and times; these turn them into words with the laptop's own clock.
 */

export const minute = 60_000;
export const hour = 60 * minute;
export const day = 24 * hour;

export const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function plural(count: number, unit: string): string {
  return `${String(count)} ${unit}${count === 1 ? '' : 's'}`;
}

/** `on` (YYYY-MM-DD) as midnight on the laptop's calendar. */
export function calendarDay(on: string): Date {
  const [year = 0, month = 1, date = 1] = on.split('-').map(Number);
  return new Date(year, month - 1, date);
}

/** Whole calendar days from today to `on`; negative when it's past. Rounded, so a clock change doesn't count. */
export function daysUntil(on: string, now: Date): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((calendarDay(on).getTime() - today.getTime()) / day);
}

/** "24 Oct" and "24 October", with the year when it isn't this year's: "3 Jan 2027". */
export function dayMonth(date: Date, now: Date): { short: string; long: string } {
  const month = months[date.getMonth()] ?? '';
  const year = date.getFullYear() === now.getFullYear() ? '' : ` ${String(date.getFullYear())}`;
  return {
    short: `${String(date.getDate())} ${month.slice(0, 3)}${year}`,
    long: `${String(date.getDate())} ${month}${year}`,
  };
}

/** A time on the laptop's clock, as `14:05` (spec 007, and spec 014's rate limit). */
export function clockText(iso: string): string {
  const time = new Date(iso);
  return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
}
