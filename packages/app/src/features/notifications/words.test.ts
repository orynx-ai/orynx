import { describe, expect, it } from 'vitest';
import type { NotificationWhat } from '@devhub/contracts';
import { makeNotification } from '@devhub/contracts/testing';
import { notificationGroups, notificationPlace, notificationTime, notificationWords } from './words.ts';

const session = {
  id: '00000000000000aa',
  title: 'Add bulk archive',
  source: { kind: 'jira' as const, key: 'PROJ-1423' },
};
const pullRequest = {
  repository: 'api',
  number: 977,
  title: 'Rate-limit the export endpoint',
  url: 'https://github.com/acme/api/pull/977',
};
const approval = (about: 'command' | 'edit' | 'push' | 'pull_request', command: string | null): NotificationWhat => ({
  kind: 'approval',
  session,
  approvalId: 'call-1',
  about,
  command,
  waiting: true,
});

describe('notification words (spec 029)', () => {
  it('AC-19: says what Claude waits for, with the ticket, the session and the command; never the command on the desktop', () => {
    expect(notificationWords(approval('command', 'npm test -- content-list'))).toEqual({
      title: 'Claude wants to run a command',
      detail: 'PROJ-1423 · Add bulk archive · npm test -- content-list',
      desktop: 'PROJ-1423 · Add bulk archive',
    });
    expect(notificationWords(approval('edit', null)).title).toBe('Claude wants to edit a file');
    expect(notificationWords(approval('push', 'git push origin feat/x')).title).toBe('Claude wants to push');
    expect(notificationWords(approval('pull_request', 'gh pr create')).title).toBe(
      'Claude wants to open a pull request',
    );
  });

  it('AC-19, AC-20: names how a session ended, and a session with no ticket by its title alone', () => {
    const titles = (['session_stopped', 'session_failed', 'session_limit'] as const).map(
      (kind) => notificationWords({ kind, session }).title,
    );
    // Finished says what Claude left it ready for (spec 031).
    const finished = (['pull_request', 'push', 'nothing'] as const).map(
      (ready) => notificationWords({ kind: 'session_finished', session, ready }).title,
    );
    expect(finished).toEqual([
      'Session finished, ready for a pull request',
      'Session finished, ready to push',
      'Session finished',
    ]);
    expect(titles).toEqual(['Session stopped', 'Session failed', 'Session hit Claude’s usage limit']);
    expect(
      notificationWords({ kind: 'session_finished', session: { ...session, source: null }, ready: 'nothing' }).detail,
    ).toBe('Add bulk archive');
  });

  it('AC-22: names who asked for a review, the pull request and the ticket', () => {
    const number = `#${String(pullRequest.number)}`;
    expect(notificationWords({ kind: 'review_requested', pullRequest, by: 'Arjun Mehta' })).toEqual({
      title: 'Arjun M. requested your review',
      detail: `api ${number} · Rate-limit the export endpoint`,
      desktop: `api ${number} · Rate-limit the export endpoint`,
    });
    expect(notificationWords({ kind: 'review_requested', pullRequest, by: null }).title).toBe(
      'Someone requested your review',
    );
    expect(notificationWords({ kind: 'checks_failed', pullRequest }).title).toBe('Checks failed on your pull request');
    expect(
      notificationWords({
        kind: 'jira_assigned',
        ticket: { key: 'PROJ-1450', title: 'Archive old events', url: 'https://acme.atlassian.net/browse/PROJ-1450' },
      }),
    ).toMatchObject({ title: 'PROJ-1450 assigned to you', detail: 'Archive old events' });
  });

  it('AC-7, AC-8: a session opens its Session screen; a pull request or a ticket opens outside Orynx', () => {
    expect(notificationPlace(approval('command', 'npm test'))).toEqual({ kind: 'session', sessionId: session.id });
    expect(notificationPlace({ kind: 'checks_failed', pullRequest })).toEqual({
      kind: 'external',
      url: 'https://github.com/acme/api/pull/977',
    });
  });

  it('says when: just now, minutes or hours ago today, yesterday, then the date', () => {
    const now = new Date(2026, 9, 19, 10, 0);
    const at = (date: Date) => date.toISOString();
    expect(notificationTime(at(new Date(2026, 9, 19, 9, 59, 30)), now)).toBe('Just now');
    expect(notificationTime(at(new Date(2026, 9, 19, 9, 58)), now)).toBe('2 min ago');
    expect(notificationTime(at(new Date(2026, 9, 19, 8, 30)), now)).toBe('1 h ago');
    expect(notificationTime(at(new Date(2026, 9, 18, 23, 0)), now)).toBe('Yesterday');
    expect(notificationTime(at(new Date(2026, 9, 12, 9, 0)), now)).toBe('12 Oct');
  });

  it('AC-4: groups them under Today and Earlier by the laptop’s day, keeping their order, and leaves out an empty group', () => {
    const now = new Date(2026, 9, 19, 10, 0);
    const today = makeNotification({ id: 'today', at: new Date(2026, 9, 19, 0, 5).toISOString() });
    const yesterday = makeNotification({ id: 'yesterday', at: new Date(2026, 9, 18, 23, 55).toISOString() });

    expect(notificationGroups([today, yesterday], now)).toEqual([
      { heading: 'Today', notifications: [today] },
      { heading: 'Earlier', notifications: [yesterday] },
    ]);
    expect(notificationGroups([yesterday], now)).toEqual([{ heading: 'Earlier', notifications: [yesterday] }]);
  });
});
