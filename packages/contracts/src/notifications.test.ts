import { describe, expect, it } from 'vitest';
import {
  apiRoutes,
  defaultNotificationSettings,
  MarkNotificationsReadSchema,
  NotificationListSchema,
  NotificationSettingsChangeSchema,
  NotificationSettingsSchema,
  ServerEventSchema,
  withNotificationChange,
} from './index.ts';
import { makeNotification, makeNotificationList } from './testing.ts';

describe('notifications (spec 029)', () => {
  it('AC-19: an approval carries its session, what it asks and whether it still waits', () => {
    const approval = makeNotification({
      what: {
        kind: 'approval',
        session: { id: '00000000000000aa', title: 'Add bulk archive', source: { kind: 'jira', key: 'PROJ-1423' } },
        approvalId: 'call-1',
        about: 'command',
        command: 'npm test -- content-list',
        waiting: true,
      },
    });
    expect(NotificationListSchema.parse(makeNotificationList([approval]))).toEqual({
      notifications: [approval],
      unread: 1,
      waiting: 1,
    });
  });

  it('AC-22: a pull request links to github.com only, and a ticket to a Jira site only', () => {
    const review = {
      ...makeNotification(),
      what: {
        kind: 'review_requested',
        pullRequest: {
          repository: 'api',
          number: 977,
          title: 'Rate-limit the export endpoint',
          url: 'https://evil.dev/x',
        },
        by: 'Arjun Mehta',
      },
    };
    expect(NotificationListSchema.safeParse({ notifications: [review], unread: 1, waiting: 0 }).success).toBe(false);
    const fromGitHub = { ...review.what.pullRequest, url: 'https://github.com/acme/api/pull/977' };
    expect(
      NotificationListSchema.safeParse({
        notifications: [{ ...review, what: { ...review.what, pullRequest: fromGitHub } }],
        unread: 1,
        waiting: 0,
      }).success,
    ).toBe(true);
    const assigned = makeNotification({
      what: {
        kind: 'jira_assigned',
        ticket: { key: 'PROJ-1450', title: 'Archive old events', url: 'https://acme.atlassian.net/browse/PROJ-1450' },
      },
    });
    expect(NotificationListSchema.safeParse(makeNotificationList([assigned])).success).toBe(true);
  });

  it('AC-13: marks some notifications read, or all of them', () => {
    expect(MarkNotificationsReadSchema.parse({ ids: ['a', 'b'] })).toEqual({ ids: ['a', 'b'] });
    expect(MarkNotificationsReadSchema.parse({ all: true })).toEqual({ all: true });
    expect(MarkNotificationsReadSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(MarkNotificationsReadSchema.safeParse({}).success).toBe(false);
    expect(apiRoutes.notifications).toBe('/api/notifications');
    expect(apiRoutes.notificationsRead).toBe('/api/notifications/read');
    expect(apiRoutes.notificationSettings).toBe('/api/notifications/settings');
  });

  it('AC-47: the event carries nothing but its type', () => {
    expect(ServerEventSchema.parse({ type: 'notifications.changed', title: 'secret' })).toEqual({
      type: 'notifications.changed',
    });
  });
});

describe('notification settings (spec 029)', () => {
  it("starts with the design's defaults", () => {
    const settings = NotificationSettingsSchema.parse(defaultNotificationSettings);
    expect(settings).toMatchObject({ popUps: true, desktop: true, onlyInBackground: true, sounds: true, volume: 60 });
    expect(settings.events.approval).toEqual({ popUp: true, desktop: true, sound: 'knock' });
    expect(settings.events.session_limit).toEqual({ popUp: true, desktop: false, sound: 'ping' });
    expect(settings.events.jira_assigned).toEqual({ popUp: false, desktop: false, sound: 'none' });
    expect(settings.quietHours).toEqual({
      on: true,
      from: '19:00',
      to: '09:00',
      days: [true, true, true, true, true, false, false],
    });
    expect(settings.doNotDisturb).toEqual({ on: false, length: 'hour', until: null });
    expect(settings.approvalsBreakThrough).toBe(true);
  });

  it('AC-39: one change sets only what it names', () => {
    const change = NotificationSettingsChangeSchema.parse({ events: { session_finished: { sound: 'ping' } } });
    const next = withNotificationChange(defaultNotificationSettings, change);
    expect(next.events.session_finished).toEqual({ popUp: true, desktop: true, sound: 'ping' });
    expect(next.events.approval).toEqual(defaultNotificationSettings.events.approval);
    expect(withNotificationChange(defaultNotificationSettings, { volume: 35 }).volume).toBe(35);
  });

  it('AC-37, AC-41: refuses a volume off its steps, a bad time, from equal to to, and an empty change', () => {
    expect(NotificationSettingsChangeSchema.safeParse({ volume: 33 }).success).toBe(false);
    expect(NotificationSettingsChangeSchema.safeParse({ volume: 105 }).success).toBe(false);
    const hours = { on: true, from: '19:00', to: '09:00', days: [true, true, true, true, true, false, false] };
    expect(NotificationSettingsChangeSchema.safeParse({ quietHours: hours }).success).toBe(true);
    expect(NotificationSettingsChangeSchema.safeParse({ quietHours: { ...hours, to: '19:00' } }).success).toBe(false);
    expect(NotificationSettingsChangeSchema.safeParse({ quietHours: { ...hours, from: '25:00' } }).success).toBe(false);
    expect(NotificationSettingsChangeSchema.safeParse({ quietHours: { ...hours, days: [true] } }).success).toBe(false);
    expect(NotificationSettingsChangeSchema.safeParse({}).success).toBe(false);
    expect(NotificationSettingsChangeSchema.safeParse({ colour: 'red' }).success).toBe(false);
  });
});
