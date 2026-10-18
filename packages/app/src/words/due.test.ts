import { describe, expect, it } from 'vitest';
import { duePill, dueText } from './due.ts';

// Saturday 17 Oct 2026, 10:00 on the laptop's calendar.
const now = new Date(2026, 9, 17, 10, 0);

describe('dueText (spec 008)', () => {
  it('AC-6: due dates read as Home writes them, without "Due", and a screen reader hears them whole (Q7b)', () => {
    expect(dueText('2026-10-17', false, now)).toEqual({ text: 'Today', spoken: 'Due today', soon: true });
    expect(dueText('2026-10-18', false, now)).toEqual({ text: 'Tomorrow', spoken: 'Due tomorrow', soon: true });
    expect(dueText('2026-10-20', false, now)).toEqual({ text: 'Tue', spoken: 'Due Tuesday', soon: true });
    expect(dueText('2026-10-23', false, now)).toEqual({ text: 'Fri', spoken: 'Due Friday', soon: true });
    expect(dueText('2026-10-27', false, now)).toEqual({ text: '27 Oct', spoken: 'Due 27 October', soon: false });
  });

  it('AC-6: a ticket past its date reads overdue in warning, unless it’s Done (Q7b)', () => {
    expect(dueText('2026-10-15', false, now)).toEqual({
      text: 'Overdue · 2 d',
      spoken: 'Overdue by 2 days',
      soon: true,
    });
    expect(dueText('2026-10-16', false, now)).toEqual({
      text: 'Overdue · 1 d',
      spoken: 'Overdue by 1 day',
      soon: true,
    });
    expect(dueText('2026-10-16', true, now)).toEqual({ text: '16 Oct', spoken: 'Due 16 October', soon: false });
    expect(dueText('2026-10-20', true, now)).toEqual({ text: 'Tue', spoken: 'Due Tuesday', soon: false });
  });

  it('AC-6: a date in another year says its year (Q7b)', () => {
    expect(dueText('2027-01-03', false, now)).toEqual({
      text: '3 Jan 2027',
      spoken: 'Due 3 January 2027',
      soon: false,
    });
  });
});

describe('duePill (spec 013, Q10f)', () => {
  it('AC-9: says "Due" before the day, as session.html draws "Due Fri", and what a screen reader hears', () => {
    expect(duePill('2026-10-23', false, now)).toEqual({ text: 'Due Fri', spoken: 'Due Friday', soon: true });
    expect(duePill('2026-10-27', false, now)).toEqual({ text: 'Due 27 Oct', spoken: 'Due 27 October', soon: false });
    expect(duePill('2026-10-17', false, now)).toEqual({ text: 'Due today', spoken: 'Due today', soon: true });
    expect(duePill('2026-10-18', false, now)).toEqual({ text: 'Due tomorrow', spoken: 'Due tomorrow', soon: true });
  });

  it('AC-9: says overdue as Tickets does, unless the ticket is done', () => {
    expect(duePill('2026-10-15', false, now)).toEqual({
      text: 'Overdue · 2 d',
      spoken: 'Overdue by 2 days',
      soon: true,
    });
    expect(duePill('2026-10-15', true, now)).toMatchObject({ text: 'Due 15 Oct', soon: false });
  });
});
