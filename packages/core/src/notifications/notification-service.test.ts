import { describe, expect, it } from 'vitest';
import type { ServerEvent } from '@devhub/contracts';
import { makeSession, makeSessionApproval } from '@devhub/contracts/testing';
import { createEventBus } from '../events/event-bus.ts';
import { openInboxCache } from '../inbox/inbox-cache.ts';
import { createNotificationService } from './notification-service.ts';

const clock = Date.parse('2026-10-19T10:00:00.000Z');
const working = makeSession({ id: '00000000000000aa', state: 'working' });
const asked = { ...working, state: 'needs_you' as const, approvals: [makeSessionApproval({ id: 'call-1' })] };

const pull = {
  id: 'acme/api#977',
  repository: 'api',
  number: 977,
  title: 'Rate-limit the export endpoint',
  url: 'https://github.com/acme/api/pull/977',
  author: 'Arjun Mehta',
  mine: false,
  openedAt: null,
  reviewRequestedAt: null,
  checksFailedAt: null,
  unresolved: null,
};
const issue = {
  key: 'PROJ-1450',
  summary: 'Archive old events',
  status: 'To Do',
  category: 'to_do',
  highPriorityBug: false,
  dueDate: null,
  waitingSince: '2026-10-18T10:00:00.000Z',
  url: 'https://acme.atlassian.net/browse/PROJ-1450',
};

function setup(now = () => clock) {
  const cache = openInboxCache(':memory:');
  const events = createEventBus();
  const heard: ServerEvent[] = [];
  events.subscribe((event) => heard.push(event));
  const errors: unknown[] = [];
  const service = createNotificationService({ cache, events, now, onError: (error) => errors.push(error) });
  return { service, cache, heard, errors };
}

describe('notification service (spec 029)', () => {
  it('AC-19: a session waiting for approval adds an unread notification, counted as waiting, and tells every tab', () => {
    const { service, heard } = setup();

    service.sessionChanged(working, asked);

    const list = service.list();
    expect(list).toMatchObject({ unread: 1, waiting: 1 });
    expect(list.notifications[0]).toMatchObject({
      at: '2026-10-19T10:00:00.000Z',
      read: false,
      what: { kind: 'approval', approvalId: 'call-1', waiting: true },
    });
    expect(heard).toEqual([{ type: 'notifications.changed' }]);
  });

  it('AC-12: an approval answered anywhere stops waiting but stays unread; the same change twice adds one', () => {
    const { service } = setup();
    service.sessionChanged(working, asked);
    service.sessionChanged(working, asked);

    service.sessionChanged(asked, working);

    const list = service.list();
    expect(list).toMatchObject({ unread: 1, waiting: 0 });
    expect(list.notifications).toHaveLength(1);
    expect(list.notifications[0]?.what).toMatchObject({ kind: 'approval', waiting: false });
  });

  it('AC-7, AC-13: marks one read, then all, and tells every tab only when something changed', () => {
    const { service, heard } = setup();
    service.sessionChanged(working, asked);
    service.sessionChanged(asked, { ...working, state: 'done', endedAt: '2026-10-19T10:30:00.000Z' });
    const [finished, approval] = service.list().notifications;
    heard.length = 0;

    service.markRead({ ids: [finished?.id ?? ''] });
    expect(service.list().unread).toBe(1);
    service.markRead({ ids: [finished?.id ?? ''] });
    expect(heard).toEqual([{ type: 'notifications.changed' }]);

    service.markRead({ all: true });
    expect(service.list().unread).toBe(0);
    expect(approval?.read).toBe(false);
  });

  it('AC-18: keeps none older than 30 days', () => {
    let now = clock;
    const { service } = setup(() => now);
    service.sessionChanged(working, { ...working, state: 'done', endedAt: '2026-10-19T10:30:00.000Z' });

    now = clock + 31 * 24 * 60 * 60 * 1000;
    service.sessionChanged(working, { ...working, state: 'done', endedAt: '2026-11-19T10:30:00.000Z' });

    expect(service.list().notifications.map((notification) => notification.at)).toEqual(['2026-11-19T10:00:00.000Z']);
  });

  it('AC-21: the first answered sync of each tool since Orynx started raises nothing, whatever the cache held', () => {
    const { service } = setup();
    const asked = { ...pull, reviewRequestedAt: '2026-10-19T09:58:00.000Z' };

    service.inboxSynced('github', [pull], [asked]);
    service.inboxSynced('jira', [], [issue]);
    expect(service.list().notifications).toEqual([]);

    service.inboxSynced('github', [pull], [asked]);
    service.inboxSynced('jira', [], [issue]);
    expect(
      service
        .list()
        .notifications.map((notification) => notification.what.kind)
        .sort(),
    ).toEqual(['jira_assigned', 'review_requested']);
  });

  it('AC-21: a sync with nothing before it (a new account, Clear cache) raises nothing', () => {
    const { service } = setup();
    service.inboxSynced('jira', [], [issue]);

    service.inboxSynced('jira', null, [issue, { ...issue, key: 'PROJ-1451' }]);

    expect(service.list().notifications).toEqual([]);
  });

  it('skips records it can’t read, and a cache that fails is reported, never thrown into the sync', () => {
    const { service, cache, errors } = setup();
    service.inboxSynced('jira', [], [issue]);
    service.inboxSynced('jira', [{ nonsense: true }], [{ nonsense: true }, { ...issue, key: 'PROJ-1451' }]);
    expect(service.list().notifications).toHaveLength(1);

    cache.close();
    expect(() => {
      service.inboxSynced('jira', [], [{ ...issue, key: 'PROJ-1452' }]);
      service.sessionChanged(working, asked);
    }).not.toThrow();
    expect(errors).toHaveLength(2);
  });

  it('a notification the cache holds in a shape it can’t read is left out', () => {
    const { service, cache } = setup();
    cache.addNotifications([{ id: 'odd', at: '2026-10-19T09:00:00.000Z', data: { kind: 'from a newer Orynx' } }]);

    expect(service.list()).toEqual({ notifications: [], unread: 0, waiting: 0 });
  });
});

describe('the update notification (spec 045)', () => {
  it('AC-13: tells you a newer Orynx is out, unread, and tells every tab', () => {
    const { service, heard } = setup();
    service.updateAvailable('0.1.40');
    expect(service.list()).toEqual({
      notifications: [
        {
          id: 'update_available:0.1.40',
          at: '2026-10-19T10:00:00.000Z',
          read: false,
          what: { kind: 'update_available', version: '0.1.40' },
        },
      ],
      unread: 1,
      waiting: 0,
    });
    expect(heard).toEqual([{ type: 'notifications.changed' }]);
  });
});
