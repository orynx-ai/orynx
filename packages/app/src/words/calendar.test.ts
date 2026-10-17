import { describe, expect, it } from 'vitest';
import { calendarDay, daysUntil, months, plural, weekdays } from './calendar.ts';

// Saturday 17 Oct 2026, 10:00 on the laptop's calendar.
const now = new Date(2026, 9, 17, 10, 0);

describe('calendar words', () => {
  it('reads a calendar day as midnight on the laptop’s calendar', () => {
    expect(calendarDay('2026-10-20')).toEqual(new Date(2026, 9, 20));
  });

  it('counts whole calendar days from today, negative when past', () => {
    expect(daysUntil('2026-10-17', now)).toBe(0);
    expect(daysUntil('2026-10-18', now)).toBe(1);
    expect(daysUntil('2026-10-15', now)).toBe(-2);
    // Late at night still counts the calendar, not 24-hour stretches.
    expect(daysUntil('2026-10-18', new Date(2026, 9, 17, 23, 59))).toBe(1);
  });

  it('names weekdays from Sunday and months from January, and makes real plurals', () => {
    expect(weekdays[calendarDay('2026-10-20').getDay()]).toBe('Tuesday');
    expect(months[9]).toBe('October');
    expect([plural(1, 'day'), plural(2, 'day')]).toEqual(['1 day', '2 days']);
  });
});
