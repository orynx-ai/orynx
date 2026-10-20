import { open as openFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheFilePath, openInboxCache, type InboxCache } from './inbox-cache.ts';

const issue = { id: 'PROJ-1423', data: { key: 'PROJ-1423', summary: 'Add bulk archive to the content list' } };
const pull = { id: 'acme/web-app#2841', data: { number: 2841, title: 'Lazy-load the people directory' } };
const jiraAccount = 'your-team.atlassian.net dev@example.com';

let home: string;
let opened: InboxCache[];

function open(path: string = cacheFilePath(home), onReset?: () => void, onUnusable?: () => void): InboxCache {
  const cache = openInboxCache(path, {
    ...(onReset === undefined ? {} : { onReset }),
    ...(onUnusable === undefined ? {} : { onUnusable }),
  });
  opened.push(cache);
  return cache;
}

beforeEach(async () => {
  home = join(await mkdtemp(join(tmpdir(), 'devhub-cache-')), 'home');
  opened = [];
});

afterEach(async () => {
  for (const cache of opened) cache.close();
  await rm(join(home, '..'), { recursive: true, force: true });
});

/**
 * Overwrites everything after the 100-byte header with noise, as a truncated copy or a bad disk would.
 * `touchHeader` also bumps SQLite's change counter, so an open connection reads the pages again.
 */
async function damagePages(path: string, { touchHeader = false }: { touchHeader?: boolean } = {}) {
  const file = await openFile(path, 'r+');
  const { size } = await file.stat();
  await file.write(Buffer.alloc(size - 100, 0x5a), 0, size - 100, 100);
  if (touchHeader) await file.write(Buffer.from([0x7f, 0x7f, 0x7f, 0x7f]), 0, 4, 24);
  await file.close();
}

describe('inbox cache', () => {
  it('knows nothing about a tool that never synced', () => {
    const cache = open(':memory:');

    expect(cache.tool('jira')).toBeNull();
    expect(cache.syncedAt()).toBeNull();
  });

  it('AC-19: keeps the last sync in cache.db, readable only by this user, so a restart shows it at once', async () => {
    const first = open();
    first.synced('jira', { connection: jiraAccount, at: '2026-10-17T09:35:00.000Z', records: [issue] });
    first.setSyncedAt('2026-10-17T09:35:00.000Z');
    first.close();

    const again = open();

    expect(again.tool('jira')).toEqual({
      connection: jiraAccount,
      syncedAt: '2026-10-17T09:35:00.000Z',
      problem: null,
      records: [issue.data],
    });
    expect(again.syncedAt()).toBe('2026-10-17T09:35:00.000Z');
    expect((await stat(cacheFilePath(home))).mode & 0o777).toBe(0o600);
    expect((await stat(home)).mode & 0o777).toBe(0o700);
  });

  it('a good sync replaces the tool’s records and leaves the other tool’s alone', () => {
    const cache = open(':memory:');
    cache.synced('jira', { connection: jiraAccount, at: '2026-10-17T09:00:00.000Z', records: [issue] });
    cache.synced('github', { connection: 'gh', at: '2026-10-17T09:00:00.000Z', records: [pull] });

    cache.synced('jira', { connection: jiraAccount, at: '2026-10-17T09:02:00.000Z', records: [] });

    expect(cache.tool('jira')?.records).toEqual([]);
    expect(cache.tool('github')?.records).toEqual([pull.data]);
  });

  it('AC-24: a failed sync keeps the last good records and says what went wrong', () => {
    const cache = open(':memory:');
    cache.synced('github', { connection: 'gh', at: '2026-10-17T09:48:00.000Z', records: [pull] });

    cache.failed('github', { connection: 'gh', problem: { kind: 'no_answer' } });

    expect(cache.tool('github')).toEqual({
      connection: 'gh',
      syncedAt: '2026-10-17T09:48:00.000Z',
      problem: { kind: 'no_answer' },
      records: [pull.data],
    });
  });

  it('a failed sync for another account drops the old account’s records', () => {
    const cache = open(':memory:');
    cache.synced('jira', { connection: jiraAccount, at: '2026-10-17T09:00:00.000Z', records: [issue] });

    cache.failed('jira', { connection: 'other.atlassian.net dev@example.com', problem: { kind: 'rejected' } });

    expect(cache.tool('jira')).toEqual({
      connection: 'other.atlassian.net dev@example.com',
      syncedAt: null,
      problem: { kind: 'rejected' },
      records: [],
    });
  });

  it('AC-30: forgetting a tool removes its records and its sync, and nothing else', () => {
    const cache = open(':memory:');
    cache.synced('jira', { connection: jiraAccount, at: '2026-10-17T09:00:00.000Z', records: [issue] });
    cache.synced('github', { connection: 'gh', at: '2026-10-17T09:00:00.000Z', records: [pull] });

    cache.forget('jira');

    expect(cache.tool('jira')).toBeNull();
    expect(cache.tool('github')?.records).toEqual([pull.data]);
  });

  it('AC-31: clearing empties the cache file', async () => {
    const cache = open();
    cache.synced('jira', { connection: jiraAccount, at: '2026-10-17T09:00:00.000Z', records: [issue] });
    cache.setSyncedAt('2026-10-17T09:00:00.000Z');

    cache.clear();
    cache.close();

    const again = open();
    expect(again.tool('jira')).toBeNull();
    expect(again.syncedAt()).toBeNull();
    expect(await readFile(cacheFilePath(home))).not.toContain(Buffer.from('bulk archive'));
  });

  it('AC-29: a cache.db that isn’t a database is deleted and made again', async () => {
    const onReset = vi.fn();
    const cache = open(cacheFilePath(home));
    cache.close();
    await writeFile(cacheFilePath(home), 'this is not a database, it was damaged');

    const again = open(cacheFilePath(home), onReset);
    again.synced('jira', { connection: jiraAccount, at: '2026-10-17T09:00:00.000Z', records: [issue] });

    expect(onReset).toHaveBeenCalledOnce();
    expect(again.tool('jira')?.records).toEqual([issue.data]);
  });

  it('AC-29: a cache.db whose header is fine but whose pages are damaged is made again when it opens', async () => {
    const cache = open();
    cache.synced('jira', { connection: jiraAccount, at: '2026-10-17T09:00:00.000Z', records: [issue] });
    cache.close();
    await damagePages(cacheFilePath(home));
    const onReset = vi.fn();

    const again = open(cacheFilePath(home), onReset);

    expect(onReset).toHaveBeenCalledOnce();
    expect(again.tool('jira')).toBeNull();
  });

  it('AC-29, AC-31: a cache.db damaged while DevHub runs is made again, so reads and Clear cache keep working', async () => {
    const onReset = vi.fn();
    const cache = open(cacheFilePath(home), onReset);
    cache.synced('jira', { connection: jiraAccount, at: '2026-10-17T09:00:00.000Z', records: [issue] });

    await damagePages(cacheFilePath(home), { touchHeader: true });

    expect(cache.tool('jira')).toBeNull();
    expect(onReset).toHaveBeenCalledOnce();
    cache.clear();
    cache.synced('jira', { connection: jiraAccount, at: '2026-10-17T09:05:00.000Z', records: [issue] });
    expect(cache.tool('jira')?.records).toEqual([issue.data]);
  });

  it('keeps the cache in memory, and says so, when a folder sits where cache.db goes', async () => {
    await mkdir(cacheFilePath(home), { recursive: true });
    const onUnusable = vi.fn();

    const cache = open(cacheFilePath(home), undefined, onUnusable);
    cache.synced('jira', { connection: jiraAccount, at: '2026-10-17T09:00:00.000Z', records: [issue] });

    expect(onUnusable).toHaveBeenCalledOnce();
    expect(cache.tool('jira')?.records).toEqual([issue.data]);
    expect((await stat(cacheFilePath(home))).isDirectory()).toBe(true);
  });

  it('AC-29: a cache.db another version of DevHub wrote is deleted and made again', () => {
    const cache = open();
    cache.synced('jira', { connection: jiraAccount, at: '2026-10-17T09:00:00.000Z', records: [issue] });
    cache.close();
    const other = new Database(cacheFilePath(home));
    other.pragma('user_version = 99');
    other.close();
    const onReset = vi.fn();

    const again = open(cacheFilePath(home), onReset);

    expect(onReset).toHaveBeenCalledOnce();
    expect(again.tool('jira')).toBeNull();
  });

  it('spec 029, AC-18: keeps notifications newest first, unread, each id once', () => {
    const cache = open();
    cache.addNotifications([
      { id: 'a', at: '2026-10-19T09:00:00.000Z', data: { kind: 'one' } },
      { id: 'b', at: '2026-10-19T10:00:00.000Z', data: { kind: 'two' } },
    ]);
    cache.addNotifications([{ id: 'a', at: '2026-10-19T11:00:00.000Z', data: { kind: 'again' } }]);

    expect(cache.notifications()).toEqual([
      { id: 'b', at: '2026-10-19T10:00:00.000Z', read: false, data: { kind: 'two' } },
      { id: 'a', at: '2026-10-19T09:00:00.000Z', read: false, data: { kind: 'one' } },
    ]);
  });

  it('spec 029, AC-18: keeps the newest 200, and none from before the cut-off', () => {
    const cache = open();
    const at = (minute: number) => new Date(Date.UTC(2026, 9, 19, 0, minute)).toISOString();
    cache.addNotifications(
      Array.from({ length: 201 }, (_, minute) => ({ id: `n${String(minute)}`, at: at(minute), data: {} })),
    );
    expect(cache.notifications()).toHaveLength(200);
    expect(cache.notifications().at(-1)?.id).toBe('n1');

    cache.addNotifications([], { before: at(150) });
    expect(cache.notifications()).toHaveLength(51);
    expect(cache.notifications().at(-1)?.id).toBe('n150');
  });

  it('spec 029, AC-13: marks some notifications read, or all, and says how many changed', () => {
    const cache = open();
    cache.addNotifications([
      { id: 'a', at: '2026-10-19T09:00:00.000Z', data: {} },
      { id: 'b', at: '2026-10-19T10:00:00.000Z', data: {} },
      { id: 'c', at: '2026-10-19T11:00:00.000Z', data: {} },
    ]);

    expect(cache.markNotificationsRead(['a', 'missing'])).toBe(1);
    expect(cache.markNotificationsRead(['a'])).toBe(0);
    expect(cache.notifications().map((row) => row.read)).toEqual([false, false, true]);
    expect(cache.markNotificationsRead('all')).toBe(2);
    expect(cache.notifications().every((row) => row.read)).toBe(true);
  });

  it('spec 029, AC-12: changes what a notification holds, and leaves the rest alone', () => {
    const cache = open();
    cache.addNotifications([{ id: 'a', at: '2026-10-19T09:00:00.000Z', data: { waiting: true } }]);

    expect(cache.changeNotification('a', (data) => ({ ...(data as object), waiting: false }))).toBe(true);
    expect(cache.changeNotification('missing', (data) => data)).toBe(false);
    expect(cache.notifications()).toEqual([
      { id: 'a', at: '2026-10-19T09:00:00.000Z', read: false, data: { waiting: false } },
    ]);
  });

  it('spec 029: Clear cache empties the notifications too', async () => {
    const cache = open();
    cache.addNotifications([{ id: 'a', at: '2026-10-19T09:00:00.000Z', data: { title: 'Rate-limit the export' } }]);

    cache.clear();

    expect(cache.notifications()).toEqual([]);
    cache.close();
    expect(await readFile(cacheFilePath(home))).not.toContain(Buffer.from('Rate-limit'));
  });

  it('reads a problem it can’t make sense of as no problem, rather than failing', () => {
    const cache = open();
    cache.failed('jira', { connection: jiraAccount, problem: { kind: 'no_answer' } });
    cache.close();
    const raw = new Database(cacheFilePath(home));
    raw.prepare('UPDATE tools SET problem = ?').run('{"kind":"from a newer DevHub"}');
    raw.close();

    expect(open().tool('jira')?.problem).toBeNull();
  });

  describe('the sync log (spec 035)', () => {
    const run = (tool: 'jira' | 'github', startedAt: string, worked = true, changed = 0) => ({
      tool,
      startedAt,
      tookMs: 1200,
      worked,
      changed,
      data: { problem: worked ? null : { kind: 'rejected' }, changes: [], moreChanges: 0 },
    });
    const keepAll = { after: '2026-01-01T00:00:00.000Z' };

    it('AC-32: keeps each run, newest first, for one tool or all, and the failed ones alone', () => {
      const cache = open();
      cache.logSync(run('jira', '2026-10-20T10:31:00.000Z'), keepAll);
      cache.logSync(run('github', '2026-10-20T10:34:00.000Z', false), keepAll);
      cache.logSync(run('jira', '2026-10-20T10:41:00.000Z'), keepAll);

      const all = cache.syncRuns({ failedOnly: false, limit: 100 });
      expect(all.map((row) => [row.tool, row.startedAt])).toEqual([
        ['jira', '2026-10-20T10:41:00.000Z'],
        ['github', '2026-10-20T10:34:00.000Z'],
        ['jira', '2026-10-20T10:31:00.000Z'],
      ]);
      expect(all[0]).toMatchObject({ tookMs: 1200, data: { problem: null, changes: [], moreChanges: 0 } });
      expect(cache.syncRuns({ tool: 'jira', failedOnly: false, limit: 100 })).toHaveLength(2);
      expect(cache.syncRuns({ failedOnly: true, limit: 100 }).map((row) => row.tool)).toEqual(['github']);
      expect(cache.syncRuns({ failedOnly: false, limit: 1 })).toHaveLength(1);
    });

    it('AC-34: a run from before the cut-off goes when the next one is written', () => {
      const cache = open();
      cache.logSync(run('jira', '2026-09-19T10:00:00.000Z'), keepAll);
      cache.logSync(run('jira', '2026-10-20T10:00:00.000Z'), { after: '2026-09-20T10:00:00.000Z' });

      expect(cache.syncRuns({ failedOnly: false, limit: 100 }).map((row) => row.startedAt)).toEqual([
        '2026-10-20T10:00:00.000Z',
      ]);
    });

    it('AC-9, AC-10: works out the last sync, the last good one, the failures since, and today’s figures', () => {
      const cache = open();
      cache.logSync(run('jira', '2026-10-19T23:50:00.000Z', true, 5), keepAll);
      cache.logSync(run('jira', '2026-10-20T09:40:00.000Z', true, 2), keepAll);
      cache.logSync(run('jira', '2026-10-20T09:42:00.000Z', false), keepAll);
      cache.logSync(run('jira', '2026-10-20T09:47:00.000Z', false), keepAll);
      cache.logSync(run('github', '2026-10-20T09:50:00.000Z', true, 9), keepAll);

      expect(
        cache.syncFigures('jira', { today: '2026-10-20T00:00:00.000Z', twoHours: '2026-10-20T08:00:00.000Z' }),
      ).toEqual({
        lastSyncAt: '2026-10-20T09:47:00.000Z',
        lastGoodSyncAt: '2026-10-20T09:40:00.000Z',
        failingSince: '2026-10-20T09:42:00.000Z',
        failedInARow: 2,
        changesToday: 2,
        lastTwoHours: { worked: 1, total: 3 },
      });
      expect(
        cache.syncFigures('github', { today: '2026-10-20T00:00:00.000Z', twoHours: '2026-10-20T08:00:00.000Z' }),
      ).toMatchObject({ failingSince: null, failedInARow: 0, changesToday: 9 });
    });

    it('AC-19: a tool with no runs has no figures', () => {
      expect(
        open().syncFigures('jira', { today: '2026-10-20T00:00:00.000Z', twoHours: '2026-10-20T08:00:00.000Z' }),
      ).toEqual({
        lastSyncAt: null,
        lastGoodSyncAt: null,
        failingSince: null,
        failedInARow: 0,
        changesToday: 0,
        lastTwoHours: { worked: 0, total: 0 },
      });
    });

    it('AC-35: Clear cache empties the log, in the file too', async () => {
      const cache = open();
      cache.logSync(
        { ...run('jira', '2026-10-20T10:00:00.000Z'), data: { changes: [{ title: 'Rate-limit the export' }] } },
        keepAll,
      );

      cache.clear();

      expect(cache.syncRuns({ failedOnly: false, limit: 100 })).toEqual([]);
      cache.close();
      expect(await readFile(cacheFilePath(home))).not.toContain(Buffer.from('Rate-limit'));
    });

    it('AC-36: a cache.db from before the log gains it, and keeps its inbox and notifications', async () => {
      await mkdir(home, { recursive: true });
      const old = new Database(cacheFilePath(home));
      old.exec(`
        CREATE TABLE records (tool TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (tool, id));
        CREATE TABLE tools (tool TEXT PRIMARY KEY, connection TEXT NOT NULL, synced_at TEXT, problem TEXT);
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE notifications (id TEXT PRIMARY KEY, at TEXT NOT NULL, read INTEGER NOT NULL, data TEXT NOT NULL);
        PRAGMA user_version = 2;
      `);
      old.prepare('INSERT INTO records VALUES (?, ?, ?)').run('jira', issue.id, JSON.stringify(issue.data));
      old.prepare('INSERT INTO tools VALUES (?, ?, ?, NULL)').run('jira', jiraAccount, '2026-10-19T09:00:00.000Z');
      old.prepare('INSERT INTO notifications VALUES (?, ?, 0, ?)').run('a', '2026-10-19T09:00:00.000Z', '{}');
      old.close();
      const onReset = vi.fn();

      const cache = open(cacheFilePath(home), onReset);
      cache.logSync(run('jira', '2026-10-20T10:00:00.000Z'), keepAll);

      expect(onReset).not.toHaveBeenCalled();
      expect(cache.tool('jira')?.records).toEqual([issue.data]);
      expect(cache.notifications().map((row) => row.id)).toEqual(['a']);
      expect(cache.syncRuns({ failedOnly: false, limit: 100 })).toHaveLength(1);
    });
  });
});
