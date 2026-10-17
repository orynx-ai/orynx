import { describe, expect, it } from 'vitest';
import { apiRoutes, InboxItemSchema, InboxSchema, InboxToolStateSchema, ServerEventSchema } from './index.ts';
import { makeInbox, makeInboxItem } from './testing.ts';

describe('InboxSchema', () => {
  it('AC-1: carries the rows in the order the server sorted them, each tool’s sync state and the sync time', () => {
    const inbox = makeInbox({
      items: [
        makeInboxItem({ id: 'github:acme/web-app#2841', waitingSince: '2026-10-15T09:00:00.000Z' }),
        makeInboxItem({
          id: 'jira:PROJ-1377',
          source: 'jira',
          tab: 'jira',
          title: 'Search returns archived sites for guest users',
          subject: { kind: 'issue', key: 'PROJ-1377', status: 'In progress', highPriorityBug: true },
          reason: { kind: 'due', on: '2026-10-19', highPriorityBug: true },
          waitingSince: '2026-10-16T09:00:00.000Z',
          target: { kind: 'external', url: 'https://your-team.atlassian.net/browse/PROJ-1377' },
        }),
      ],
    });

    const parsed = InboxSchema.parse(inbox);

    expect(parsed.items.map((item) => item.id)).toEqual(['github:acme/web-app#2841', 'jira:PROJ-1377']);
    expect(parsed.tools.jira).toEqual({ state: 'synced', at: '2026-10-17T10:00:00.000Z' });
    expect(parsed.syncedAt).toBe('2026-10-17T10:00:00.000Z');
  });

  it('AC-12: a row can open a Claude session inside DevHub instead of a link out', () => {
    const row = makeInboxItem({
      reason: { kind: 'approval' },
      subject: { kind: 'session', source: { kind: 'jira', key: 'PROJ-1423' } },
      target: { kind: 'session', sessionId: 'session-1' },
    });

    expect(InboxItemSchema.parse(row).target).toEqual({ kind: 'session', sessionId: 'session-1' });
  });

  it('links out only to https addresses, so a row can never carry a script or a plain-http link', () => {
    for (const url of ['javascript:alert(1)', 'http://github.com/acme/web-app/pull/1', 'not a link']) {
      expect(InboxItemSchema.safeParse({ ...makeInboxItem(), target: { kind: 'external', url } }).success).toBe(false);
    }
  });

  it('keeps a due date as a calendar day, because the app works out "Due Mon" in the laptop’s own calendar', () => {
    const due = (on: string) =>
      InboxItemSchema.safeParse({ ...makeInboxItem(), reason: { kind: 'due', on, highPriorityBug: false } }).success;

    expect(due('2026-10-19')).toBe(true);
    expect(due('2026-10-19T00:00:00.000Z')).toBe(false);
  });

  it('AC-24, AC-25: a failed tool keeps the time of its last good sync next to what went wrong', () => {
    const states = [
      { state: 'failed', problem: { kind: 'no_answer' }, lastSyncedAt: '2026-10-17T09:48:00.000Z' },
      { state: 'failed', problem: { kind: 'rate_limited', until: '2026-10-17T14:05:00.000Z' }, lastSyncedAt: null },
      { state: 'failed', problem: { kind: 'rejected' }, lastSyncedAt: null },
      { state: 'failed', problem: { kind: 'sign_in_needed', site: 'your-team.atlassian.net' }, lastSyncedAt: null },
      { state: 'failed', problem: { kind: 'other', message: 'gh is signed out.' }, lastSyncedAt: null },
      { state: 'not_connected' },
      { state: 'syncing' },
    ];

    for (const state of states) expect(InboxToolStateSchema.parse(state)).toEqual(state);
  });

  it('has a path for the list, for Refresh and for Clear cache', () => {
    expect(apiRoutes.inbox).toBe('/api/inbox');
    expect(apiRoutes.inboxRefresh).toBe('/api/inbox/refresh');
    expect(apiRoutes.inboxCache).toBe('/api/inbox/cache');
  });

  it('AC-16: tells open pages when the list changed', () => {
    expect(ServerEventSchema.parse({ type: 'inbox.changed' })).toEqual({ type: 'inbox.changed' });
  });
});
