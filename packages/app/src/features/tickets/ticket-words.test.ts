import { describe, expect, it } from 'vitest';
import { makeTickets } from '@devhub/contracts/testing';
import {
  assigneeAvatar,
  columnEmptyText,
  columnNames,
  columnOrder,
  columnRegionName,
  dueText,
  listCaption,
  listEmptyText,
  noSprintText,
  pageHeading,
  sprintMeta,
  statusTones,
  ticketCount,
  tooManyLine,
  unreachableText,
} from './ticket-words.ts';

// Saturday 17 Oct 2026, 10:00 on the laptop's calendar.
const now = new Date(2026, 9, 17, 10, 0);
const sprint = makeTickets().sprint ?? { id: 42, name: 'Sprint 42', endsAt: null, projectKey: 'PROJ' };

describe('Tickets’ words', () => {
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

  it('AC-1: the page bar says the project and when the sprint ends (Q9a, Q7c)', () => {
    expect(sprintMeta({ ...sprint, endsAt: '2026-10-24T17:00:00.000Z' }, now)).toBe('PROJ · ends 24 Oct');
    expect(sprintMeta({ ...sprint, endsAt: '2026-10-15T17:00:00.000Z' }, now)).toBe('PROJ · ended 15 Oct');
    expect(sprintMeta({ ...sprint, endsAt: null }, now)).toBe('PROJ');
    expect(sprintMeta({ ...sprint, projectKey: null, endsAt: '2026-10-24T17:00:00.000Z' }, now)).toBe('ends 24 Oct');
    expect(sprintMeta({ ...sprint, projectKey: null, endsAt: null }, now)).toBeNull();
    expect(sprintMeta({ ...sprint, endsAt: '2027-01-08T17:00:00.000Z' }, now)).toBe('PROJ · ends 8 Jan 2027');
  });

  it('AC-31: the hidden heading names the sprint', () => {
    expect(pageHeading('Sprint 42')).toBe('Sprint 42 tickets');
  });

  it('AC-1: counts tickets with real plurals (Q9b)', () => {
    expect([ticketCount(0), ticketCount(1), ticketCount(9)]).toEqual(['0 tickets', '1 ticket', '9 tickets']);
  });

  it('AC-1, AC-31: names the four columns, in order, and each column’s region with its count (Q9c)', () => {
    expect(columnOrder.map((column) => columnNames[column])).toEqual(['To do', 'In progress', 'In review', 'Done']);
    expect(columnRegionName('in_review', 2)).toBe('In review, 2 tickets');
    expect(columnRegionName('done', 1)).toBe('Done, 1 ticket');
  });

  it('AC-14, AC-15: an empty column says why (Q9d)', () => {
    expect(columnEmptyText('to_do', false)).toEqual({
      title: 'Nothing to do',
      line: "Tickets that haven't started show up here.",
    });
    expect(columnEmptyText('in_progress', false)).toEqual({
      title: 'Nothing in progress',
      line: 'Tickets being worked on show up here.',
    });
    expect(columnEmptyText('in_review', false)).toEqual({
      title: 'Nothing in review',
      line: 'Tickets move here when you open a pull request.',
    });
    expect(columnEmptyText('done', false)).toEqual({
      title: 'Nothing done yet',
      line: 'Finished tickets show up here.',
    });
    expect(columnEmptyText('in_progress', true)).toEqual({ title: 'No tickets match these filters', line: null });
  });

  it('AC-11: the list’s caption names the sprint, as the design gives it', () => {
    expect(listCaption('Sprint 42')).toBe('Tickets in Sprint 42');
  });

  it('AC-16: the list says why it’s empty (Q9e)', () => {
    expect(listEmptyText('Sprint 42', { filtered: true, onlyMine: true })).toEqual({
      title: 'No tickets match these filters',
      line: 'Turn one off, or clear them.',
    });
    expect(listEmptyText('Sprint 42', { filtered: false, onlyMine: true })).toEqual({
      title: 'Nothing assigned to you in Sprint 42',
      line: 'Turn off Assigned to me to see the whole sprint.',
    });
  });

  it('AC-2, AC-7: the avatar shows initials and says who it is (Q9f)', () => {
    expect(assigneeAvatar({ name: 'Rakesh Dhariwal', mine: true })).toEqual({
      initials: 'RD',
      label: 'Assigned to you',
    });
    expect(assigneeAvatar({ name: 'Priya Shah', mine: false })).toEqual({
      initials: 'PS',
      label: 'Assigned to Priya Shah',
    });
    expect(assigneeAvatar({ name: 'Priya', mine: false })).toEqual({ initials: 'P', label: 'Assigned to Priya' });
    expect(assigneeAvatar(null)).toBeNull();
  });

  it('AC-11: the list’s status pill takes its column’s colour', () => {
    expect(statusTones).toEqual({ to_do: 'neutral', in_progress: 'warning', in_review: 'info', done: 'success' });
  });

  it('AC-22, AC-25, AC-26: the no-sprint, can’t-load and too-many words (Q9i, Q9k, Q9l)', () => {
    expect(noSprintText).toEqual({
      title: 'None of your tickets is in an active sprint',
      line: 'Your sprint shows up here once Jira starts one with a ticket assigned to you.',
    });
    expect(unreachableText).toEqual({
      title: "Couldn't load the sprint",
      line: 'Check that Orynx is still running, then try again.',
      action: 'Try again',
    });
    expect(tooManyLine('Sprint 42')).toBe("Showing the first 300 tickets in Sprint 42, in Jira's order.");
  });
});
