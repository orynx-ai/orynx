import { describe, expect, it } from 'vitest';
import {
  apiRoutes,
  defaultNotificationSettings,
  notificationEventOf,
  NotificationListSchema,
  ServerEventSchema,
  UpdateInstallSchema,
  UpdatesSchema,
} from './index.ts';
import { makeNotification, makeNotificationList, makeRelease, makeUpdates } from './testing.ts';

describe('updates (spec 045)', () => {
  it('AC-1, AC-2: says which Orynx runs, the release it came from, and how far a clone is past it', () => {
    expect(UpdatesSchema.parse(makeUpdates()).kind).toBe('desktop');
    const clone = makeUpdates({
      kind: 'service',
      folder: '~/Code/orynx',
      running: { release: '0.1.37', commits: 4, commit: 'abc1234' },
    });
    expect(UpdatesSchema.parse(clone).running).toEqual({ release: '0.1.37', commits: 4, commit: 'abc1234' });
    const untagged = { ...clone, running: { release: null, commits: 0, commit: 'abc1234' } };
    expect(UpdatesSchema.safeParse(untagged).success).toBe(true);
    expect(UpdatesSchema.safeParse({ ...clone, kind: 'laptop' }).success).toBe(false);
  });

  it('AC-6, AC-10: carries when GitHub last answered and whether the last check failed', () => {
    const checked = makeUpdates({ checkedAt: '2026-10-22T10:00:00.000Z', checkFailed: true });
    expect(UpdatesSchema.parse(checked)).toMatchObject({ checkedAt: '2026-10-22T10:00:00.000Z', checkFailed: true });
    expect(UpdatesSchema.safeParse({ ...checked, checkedAt: '5 minutes ago' }).success).toBe(false);
  });

  it('AC-14: lists at most 10 releases, each marked newer or mine, with a page on github.com only', () => {
    const releases = Array.from({ length: 10 }, (_, index) => makeRelease({ version: `0.1.${String(40 - index)}` }));
    expect(UpdatesSchema.safeParse(makeUpdates({ releases })).success).toBe(true);
    expect(UpdatesSchema.safeParse({ ...makeUpdates(), releases: [...releases, makeRelease()] }).success).toBe(false);
    expect(makeRelease({ newer: true, mine: false })).toMatchObject({ newer: true, mine: false });
    expect(() => makeRelease({ url: 'https://evil.dev/orynx/releases/tag/v0.1.40' })).toThrow();
    expect(() => makeRelease({ version: 'v0.1.40' })).toThrow();
  });

  it('AC-17: a release with no notes has empty notes', () => {
    expect(makeRelease({ notes: '' }).notes).toBe('');
  });

  it('AC-18 to AC-28: an update is idle, downloading, ready, updating, failed or refused for a reason', () => {
    for (const update of [
      { state: 'idle' },
      { state: 'downloading', version: '0.1.40' },
      { state: 'ready', version: '0.1.40' },
      { state: 'updating' },
      { state: 'failed', log: '~/.devhub/update.log' },
      { state: 'failed', log: null },
      { state: 'refused', reason: 'changes' },
      { state: 'refused', reason: 'diverged' },
    ]) {
      expect(UpdatesSchema.parse(makeUpdates({ update } as never)).update).toEqual(update);
    }
    expect(UpdatesSchema.safeParse({ ...makeUpdates(), update: { state: 'refused', reason: 'why' } }).success).toBe(
      false,
    );
  });

  it('AC-22, AC-29, AC-30: says when a session holds the update back, and what the update offers', () => {
    expect(makeUpdates({ busy: true }).busy).toBe(true);
    for (const action of ['update', 'download', 'commands', 'none'] as const) {
      expect(makeUpdates({ action }).action).toBe(action);
    }
  });

  it('AC-19, AC-25: the install request is Update or Restart to update, and nothing else', () => {
    expect(UpdateInstallSchema.parse({ step: 'update' })).toEqual({ step: 'update' });
    expect(UpdateInstallSchema.parse({ step: 'restart' })).toEqual({ step: 'restart' });
    expect(UpdateInstallSchema.safeParse({ step: 'update', command: 'rm -rf /' }).success).toBe(false);
    expect(UpdateInstallSchema.safeParse({}).success).toBe(false);
  });

  it('AC-12: has its routes, and its event carries nothing but its type', () => {
    expect(apiRoutes.updates).toBe('/api/updates');
    expect(apiRoutes.updatesCheck).toBe('/api/updates/check');
    expect(apiRoutes.updatesInstall).toBe('/api/updates/install');
    expect(ServerEventSchema.parse({ type: 'updates.changed', version: '0.1.40' })).toEqual({
      type: 'updates.changed',
    });
  });

  it('AC-13: an update notification names its version and has its own row, which pops up by default', () => {
    const out = makeNotification({ what: { kind: 'update_available', version: '0.1.40' } });
    expect(NotificationListSchema.parse(makeNotificationList([out])).notifications[0]?.what).toEqual({
      kind: 'update_available',
      version: '0.1.40',
    });
    expect(notificationEventOf('update_available')).toBe('update_available');
    expect(defaultNotificationSettings.events.update_available).toEqual({ popUp: true, desktop: false, sound: 'none' });
  });
});
