import { calendarDay, dayMonth, daysUntil, plural, weekdays } from './calendar.ts';

/**
 * A ticket's due date in words, as Tickets (spec 008, Q7b) and the Session screen's Ticket tab (spec 013, Q10f)
 * write it, with the laptop's calendar.
 */

export interface DueText {
  text: string;
  /** What a screen reader hears: the calendar icon says "due" to the eye only. */
  spoken: string;
  /** Drawn in `warning`: not Done, and overdue or due within 6 days (Q7b, Q3b). */
  soon: boolean;
}

/**
 * Q7b: Home's dates without "Due". "Today", "Tomorrow", a weekday within 6 days, or "28 Oct"; a ticket that
 * isn't Done and is past its date reads "Overdue · 2 d". A Done ticket's date is never `soon`.
 */
export function dueText(on: string, done: boolean, now: Date): DueText {
  const days = daysUntil(on, now);
  if (days < 0 && !done) {
    return { text: `Overdue · ${String(-days)} d`, spoken: `Overdue by ${plural(-days, 'day')}`, soon: true };
  }
  const soon = !done && days <= 6;
  if (days === 0) return { text: 'Today', spoken: 'Due today', soon };
  if (days === 1) return { text: 'Tomorrow', spoken: 'Due tomorrow', soon };
  const due = calendarDay(on);
  if (days > 1 && days <= 6) {
    const weekday = weekdays[due.getDay()] ?? '';
    return { text: weekday.slice(0, 3), spoken: `Due ${weekday}`, soon };
  }
  const date = dayMonth(due, now);
  return { text: date.short, spoken: `Due ${date.long}`, soon };
}

/**
 * The Ticket tab's due pill (spec 013, Q10f): Tickets' words with "Due" first, as `session.html` draws "Due Fri";
 * an overdue ticket reads as on Tickets.
 */
export function duePill(on: string, done: boolean, now: Date): DueText {
  const due = dueText(on, done, now);
  if (due.text.startsWith('Overdue')) return due;
  const text = due.text === 'Today' || due.text === 'Tomorrow' ? due.spoken : `Due ${due.text}`;
  return { ...due, text };
}
