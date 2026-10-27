import { describe, expect, it } from 'vitest';
import { defaultPreferences, type Inbox, type InboxItem, type InboxReason } from '@devhub/contracts';
import { makeInbox, makeInboxItem } from '@devhub/contracts/testing';
import { emptyText, reasonPill, rowAction, subLine, syncLine, tabCounts, toolLine, waitText } from './inbox-words.ts';

// Saturday 17 October 2026, 10:00 on the laptop's own clock, whatever its time zone.
const now = new Date(2026, 9, 17, 10, 0);
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

function pill(reason: InboxReason, waited = 2 * day) {
  return reasonPill(makeInboxItem({ reason, waitingSince: ago(waited) }), now);
}

describe('Home’s words', () => {
  it('AC-13: waits read in minutes, hours or days, and in whole words for a screen reader (Q2c)', () => {
    expect(waitText(40_000)).toEqual({ short: '1 min', spoken: '1 minute' });
    expect(waitText(12 * minute)).toEqual({ short: '12 min', spoken: '12 minutes' });
    expect(waitText(59 * minute + 59_000)).toEqual({ short: '59 min', spoken: '59 minutes' });
    expect(waitText(hour)).toEqual({ short: '1 h', spoken: '1 hour' });
    expect(waitText(3 * hour)).toEqual({ short: '3 h', spoken: '3 hours' });
    expect(waitText(day)).toEqual({ short: '1 d', spoken: '1 day' });
    expect(waitText(9 * day)).toEqual({ short: '9 d', spoken: '9 days' });
    expect(waitText(40 * day)).toEqual({ short: '40 d', spoken: '40 days' });
  });

  it('AC-6, AC-9, AC-10, AC-12: each pill ends with its wait (Q2a, Q2b)', () => {
    expect(pill({ kind: 'review_requested' })).toEqual({
      text: 'Review requested · 2 d',
      spoken: 'Review requested, 2 days',
      tone: 'warning',
    });
    expect(pill({ kind: 'checks_failing' }, 3 * hour)).toEqual({
      text: 'Checks failing · 3 h',
      spoken: 'Checks failing, 3 hours',
      tone: 'danger',
    });
    expect(pill({ kind: 'unresolved_comments', count: 2 }, day)).toMatchObject({
      text: '2 unresolved comments · 1 d',
      tone: 'warning',
    });
    expect(pill({ kind: 'unresolved_comments', count: 1 }, 4 * hour).text).toBe('1 unresolved comment · 4 h');
    expect(pill({ kind: 'approval' }, 5 * minute)).toMatchObject({ text: 'Approve command · 5 min', tone: 'warning' });
  });

  it('AC-6: a review request is info under a day and warning from a day, as Home draws it (Q2d)', () => {
    expect(pill({ kind: 'review_requested' }, 5 * hour).tone).toBe('info');
    expect(pill({ kind: 'review_requested' }, day).tone).toBe('warning');
  });

  it('AC-5: an issue with no due date reads as a bug or as its status category (Q2e)', () => {
    expect(pill({ kind: 'bug' }, 3 * day)).toMatchObject({ text: 'Bug · 3 d', tone: 'danger' });
    expect(pill({ kind: 'status', category: 'to_do' }, 4 * day)).toMatchObject({
      text: 'To do · 4 d',
      tone: 'neutral',
    });
    expect(pill({ kind: 'status', category: 'in_progress' })).toMatchObject({
      text: 'In progress · 2 d',
      tone: 'warning',
    });
  });

  it('AC-5: a due date is its own reason, in the laptop’s calendar (Q2a, Q2e)', () => {
    const due = (on: string, highPriorityBug = false) => pill({ kind: 'due', on, highPriorityBug });

    expect(due('2026-10-15')).toEqual({ text: 'Overdue · 2 d', spoken: 'Overdue by 2 days', tone: 'danger' });
    expect(due('2026-10-16')).toMatchObject({ text: 'Overdue · 1 d', spoken: 'Overdue by 1 day' });
    expect(due('2026-10-17')).toEqual({ text: 'Due today', spoken: 'Due today', tone: 'warning' });
    expect(due('2026-10-18')).toMatchObject({ text: 'Due tomorrow', tone: 'warning' });
    expect(due('2026-10-19')).toEqual({ text: 'Due Mon', spoken: 'Due Monday', tone: 'warning' });
    expect(due('2026-10-20')).toMatchObject({ text: 'Due Tue', tone: 'neutral' });
    expect(due('2026-10-23')).toMatchObject({ text: 'Due Fri', tone: 'neutral' });
    expect(due('2026-10-28')).toEqual({ text: 'Due 28 Oct', spoken: 'Due 28 October', tone: 'neutral' });
    expect(due('2026-10-21', true)).toMatchObject({ text: 'Due Wed', tone: 'danger' });
    // Due later is neutral, even for a high-priority bug (Q2e).
    expect(due('2026-10-28', true)).toMatchObject({ text: 'Due 28 Oct', tone: 'neutral' });
  });

  it('AC-2, AC-6, AC-9, AC-12: each sub line says what the row is about (Q8a)', () => {
    const sub = (subject: InboxItem['subject']) => subLine(makeInboxItem({ subject }));

    expect(sub({ kind: 'issue', key: 'PROJ-1423', status: 'In progress', highPriorityBug: false })).toBe(
      'PROJ-1423 · In progress',
    );
    expect(sub({ kind: 'issue', key: 'PROJ-1377', status: 'To Do', highPriorityBug: true })).toBe(
      'PROJ-1377 · Bug · high priority',
    );
    expect(
      sub({ kind: 'pull_request', repository: 'web-app', number: 2841, author: 'Priya Sharma', mine: false }),
    ).toBe('web-app #2841 · by Priya S.');
    expect(sub({ kind: 'pull_request', repository: 'api', number: 977, author: 'dependabot', mine: false })).toBe(
      'api #977 · by dependabot',
    );
    expect(sub({ kind: 'pull_request', repository: 'api', number: 978, author: null, mine: false })).toBe('api #978');
    expect(sub({ kind: 'pull_request', repository: 'web-app', number: 2836, author: 'Rakesh D', mine: true })).toBe(
      'web-app #2836 · your pull request',
    );
    expect(sub({ kind: 'session', source: { kind: 'jira', key: 'PROJ-1423' } })).toBe('PROJ-1423 · Claude session');
    expect(sub({ kind: 'session', source: { kind: 'pull_request', number: 2836 } })).toBe('PR #2836 · Claude session');
    expect(sub({ kind: 'session', source: null })).toBe('Claude session');
  });

  it('a sub line keeps a title-like status as it is, with nothing added', () => {
    expect(
      subLine(makeInboxItem({ subject: { kind: 'issue', key: 'PROJ-1', status: '', highPriorityBug: false } })),
    ).toBe('PROJ-1');
  });

  it('022 AC-30: a pull request’s one action adds it to the composer, named for it', () => {
    for (const reason of [
      { kind: 'review_requested' },
      { kind: 'checks_failing' },
      { kind: 'unresolved_comments', count: 2 },
    ] as const) {
      expect(rowAction(makeInboxItem({ reason }))).toEqual({
        kind: 'compose',
        chip: { kind: 'pull_request', owner: 'acme', name: 'web-app', number: 2841 },
        label: 'web-app #2841',
      });
    }
  });

  it('spec 047, AC-6, AC-7: your own pull request’s comments or failing checks get Fix, with what it sends', () => {
    const yours = (reason: InboxReason, path: string, fork = false) =>
      rowAction(
        makeInboxItem({
          id: 'github:acme/web-app/pull/2836',
          title: 'Fix timezone shift in event cards',
          subject: {
            kind: 'pull_request',
            repository: 'web-app',
            number: 2836,
            author: 'The Octocat',
            mine: true,
            ...(fork ? { fork: true } : {}),
          },
          reason,
          target: { kind: 'external', url: `https://github.com/acme/web-app/pull/2836${path}` },
        }),
      );
    const chip = { kind: 'pull_request', owner: 'acme', name: 'web-app', number: 2836 };

    expect(yours({ kind: 'unresolved_comments', count: 2 }, '')).toEqual({
      kind: 'fix',
      chip,
      label: 'Fix review comments',
      name: 'Fix review comments: web-app #2836',
      message: 'Fix the unresolved review comments on web-app #2836.',
    });
    expect(yours({ kind: 'checks_failing' }, '/checks')).toEqual({
      kind: 'fix',
      chip,
      label: 'Fix failing checks',
      name: 'Fix failing checks: web-app #2836',
      message: 'Fix the failing checks on web-app #2836.',
    });
    // One from a fork keeps + (its branch isn't in your repository).
    expect(yours({ kind: 'checks_failing' }, '/checks', true)).toEqual({
      kind: 'compose',
      chip,
      label: 'web-app #2836',
    });
  });

  it('022 AC-26, AC-32: an issue’s one action adds it to the composer, or opens its session once that’s live', () => {
    const issue = (target: InboxItem['target'], reason: InboxReason = { kind: 'status', category: 'to_do' }) =>
      rowAction(
        makeInboxItem({
          source: 'jira',
          tab: 'jira',
          title: 'Add bulk archive',
          subject: { kind: 'issue', key: 'PROJ-1', status: 'To Do', highPriorityBug: false },
          reason,
          target,
        }),
      );
    const jira = { kind: 'external', url: 'https://acme.atlassian.net/browse/PROJ-1' } as const;
    for (const reason of [
      { kind: 'bug' },
      { kind: 'status', category: 'to_do' },
      { kind: 'due', on: '2026-10-19', highPriorityBug: false },
    ] as const) {
      expect(issue(jira, reason)).toEqual({ kind: 'compose', chip: { kind: 'jira', key: 'PROJ-1' }, label: 'PROJ-1' });
    }
    const live = {
      kind: 'session',
      sessionId: 'session-1',
      label: 'Open session',
      name: 'Open session: Add bulk archive',
    };
    expect(issue({ kind: 'session', sessionId: 'session-1' })).toEqual(live);
    expect(issue({ kind: 'session', sessionId: 'session-1' }, { kind: 'approval' })).toEqual(live);
  });

  it('AC-1: counts the rows in each tab, with All counting every row', () => {
    const items = [
      makeInboxItem({ id: '1', tab: 'jira' }),
      makeInboxItem({ id: '2', tab: 'pull_requests' }),
      makeInboxItem({ id: '3', tab: 'pull_requests' }),
      makeInboxItem({ id: '4', tab: null }),
    ];

    expect(tabCounts(items)).toEqual({ all: 4, jira: 1, pull_requests: 2 });
  });

  it('AC-16, AC-19, AC-20: the page bar says how long ago the list was synced (Q8c)', () => {
    const synced = (at: string | null, tools?: Inbox['tools']) =>
      syncLine(makeInbox({ syncedAt: at, ...(tools === undefined ? {} : { tools }) }), now);

    expect(synced(ago(20_000))).toBe('Synced just now');
    expect(synced(ago(minute))).toBe('Synced 1 min ago');
    expect(synced(ago(25 * minute))).toBe('Synced 25 min ago');
    expect(synced(ago(2 * hour))).toBe('Synced 2 h ago');
    expect(synced(ago(3 * day))).toBe('Synced 3 d ago');
    expect(synced(null, { jira: { state: 'syncing' }, github: { state: 'not_connected' } })).toBe('Syncing');
    expect(synced(null, { jira: { state: 'not_connected' }, github: { state: 'not_connected' } })).toBeNull();
    expect(
      synced(null, {
        jira: { state: 'failed', problem: { kind: 'no_answer' }, lastSyncedAt: null },
        github: { state: 'syncing' },
      }),
    ).toBeNull();
  });

  it("AC-23: a tool that isn't connected says so in the product spec’s words (Q5a)", () => {
    expect(toolLine('github', { state: 'not_connected' }, now)).toEqual({
      message: 'GitHub is not connected.',
      action: { text: 'Connect it in Settings', tab: 'connections' },
    });
  });

  it('AC-24, AC-25: a tool whose sync failed says what happened and how old its rows are (Q5b)', () => {
    const failed = (problem: Parameters<typeof toolLine>[1] & { state: 'failed' }) => toolLine('github', problem, now);
    const at = ago(12 * minute);

    expect(failed({ state: 'failed', problem: { kind: 'no_answer' }, lastSyncedAt: at })).toEqual({
      message: "GitHub didn't answer. These are from 12 min ago.",
      action: null,
    });
    expect(failed({ state: 'failed', problem: { kind: 'no_answer' }, lastSyncedAt: null })?.message).toBe(
      "GitHub didn't answer.",
    );
    expect(
      failed({
        state: 'failed',
        problem: { kind: 'rate_limited', until: new Date(2026, 9, 17, 14, 5).toISOString() },
        lastSyncedAt: at,
      })?.message,
    ).toBe("GitHub's rate limit is used up until 14:05. These are from 12 min ago.");
    expect(
      failed({ state: 'failed', problem: { kind: 'rate_limited', until: null }, lastSyncedAt: null })?.message,
    ).toBe("GitHub's rate limit is used up.");
    expect(failed({ state: 'failed', problem: { kind: 'rejected' }, lastSyncedAt: at })).toEqual({
      message: 'GitHub refused the saved token.',
      action: { text: 'Reconnect it in Settings', tab: 'connections' },
    });
    expect(
      toolLine(
        'jira',
        { state: 'failed', problem: { kind: 'sign_in_needed', site: 'your-team.atlassian.net' }, lastSyncedAt: at },
        now,
      ),
    ).toEqual({
      message: 'Jira wants you to sign in on the web first. Sign in at your-team.atlassian.net, then press Refresh.',
      action: null,
    });
    expect(
      toolLine('jira', { state: 'failed', problem: { kind: 'no_answer' }, lastSyncedAt: ago(30_000) }, now)?.message,
    ).toBe("Jira didn't answer. These are from 1 min ago.");
    expect(
      failed({ state: 'failed', problem: { kind: 'other', message: "gh isn't signed in." }, lastSyncedAt: null }),
    ).toEqual({ message: "gh isn't signed in.", action: null });
  });

  it('a synced or syncing tool has no line', () => {
    expect(toolLine('jira', { state: 'synced', at: ago(minute) }, now)).toBeNull();
    expect(toolLine('jira', { state: 'syncing' }, now)).toBeNull();
  });

  it('AC-22, AC-26: each tab has its empty text, and says so when its rules are off (Q8b)', () => {
    const rules = defaultPreferences.inboxRules;
    const off = {
      jira_assigned: false,
      review_requested: false,
      checks_failing: false,
      unresolved_comments: false,
      session_waiting: false,
    };

    expect(emptyText('all', rules)).toEqual({
      title: 'Nothing needs you',
      line: 'Tickets assigned to you and pull requests waiting on you show up here.',
      rulesOff: false,
    });
    expect(emptyText('jira', rules)).toEqual({
      title: 'No Jira tickets need you',
      line: "Tickets assigned to you that aren't done show up here.",
      rulesOff: false,
    });
    expect(emptyText('pull_requests', rules)).toEqual({
      title: 'No pull requests need you',
      line: 'Review requests, and your pull requests with failing checks or unresolved comments, show up here.',
      rulesOff: false,
    });
    expect(emptyText('jira', { ...rules, jira_assigned: false })).toEqual({
      title: 'The Jira rule is off',
      line: 'Turn them on in Settings › Inbox rules.',
      rulesOff: true,
    });
    expect(
      emptyText('pull_requests', {
        ...rules,
        review_requested: false,
        checks_failing: false,
        unresolved_comments: false,
      }),
    ).toEqual({
      title: 'The pull request rules are off',
      line: 'Turn them on in Settings › Inbox rules.',
      rulesOff: true,
    });
    expect(emptyText('pull_requests', { ...rules, review_requested: false })).toMatchObject({ rulesOff: false });
    expect(emptyText('all', off)).toEqual({
      title: 'Every inbox rule is off',
      line: 'Turn some on in Settings › Inbox rules.',
      rulesOff: true,
    });
  });
});
