import { chmodSync, lstatSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { and, desc, eq, inArray, lt, notInArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { InboxProblemSchema, notificationLimits, type InboxProblem } from '@devhub/contracts';

/**
 * `<DEVHUB_HOME>/cache.db` (spec 007): what the last sync read from each tool, so Home opens at once, and the
 * notifications under the bell (spec 029).
 * Records are titles and metadata only, never descriptions or comment text. It's a cache: a file DevHub
 * can't read, or one another version wrote, is deleted and made again.
 */

export type InboxTool = 'jira' | 'github';

/** A part of the cache with its own records and last sync: a tool's inbox, or Tickets' sprint (spec 008). */
export type CachePart = InboxTool | 'jira_sprint';

/** Goes up whenever the tables or a record's shape change, so an older file is made again. */
const version = 2;

const records = sqliteTable(
  'records',
  {
    tool: text('tool').notNull(),
    id: text('id').notNull(),
    /** The record as JSON; the sync service checks it with the tool's schema on the way out. */
    data: text('data').notNull(),
  },
  (table) => [primaryKey({ columns: [table.tool, table.id] })],
);

const tools = sqliteTable('tools', {
  tool: text('tool').primaryKey(),
  /** Which saved connection the records belong to, such as the Jira site and email. */
  connection: text('connection').notNull(),
  /** When the tool last answered. */
  syncedAt: text('synced_at'),
  /** The last sync's problem as JSON, or null when it answered. */
  problem: text('problem'),
});

const meta = sqliteTable('meta', { key: text('key').primaryKey(), value: text('value').notNull() });

const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  at: text('at').notNull(),
  read: integer('read', { mode: 'boolean' }).notNull(),
  /** What it is about as JSON; the notification service checks it with the contract on the way out. */
  data: text('data').notNull(),
});

const createTables = `
  CREATE TABLE records (tool TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (tool, id));
  CREATE TABLE tools (tool TEXT PRIMARY KEY, connection TEXT NOT NULL, synced_at TEXT, problem TEXT);
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE notifications (id TEXT PRIMARY KEY, at TEXT NOT NULL, read INTEGER NOT NULL, data TEXT NOT NULL);
  PRAGMA user_version = ${String(version)};
`;

const syncedAtKey = 'synced_at';

/** One tool's part of the cache. */
export interface CachedTool {
  connection: string;
  /** When the tool last answered, or null when it never has for this connection. */
  syncedAt: string | null;
  problem: InboxProblem | null;
  /** The records from the last good sync, as they were written. */
  records: unknown[];
}

/** A record to keep, under an id that is unique within its tool. */
export interface CacheRecord {
  id: string;
  data: unknown;
}

/** A notification as the cache keeps it (spec 029). */
export interface CachedNotification {
  id: string;
  at: string;
  read: boolean;
  data: unknown;
}

export interface InboxCache {
  /** The tool's records and last sync, or null when it never synced. */
  tool(tool: CachePart): CachedTool | null;
  /** A good sync: the tool's records are replaced and its problem cleared. */
  synced(tool: CachePart, sync: { connection: string; at: string; records: readonly CacheRecord[] }): void;
  /** A failed sync: the last good records stay, unless they belong to another connection. */
  failed(tool: CachePart, sync: { connection: string; problem: InboxProblem }): void;
  /** When every connected tool last answered in the same sync. */
  syncedAt(): string | null;
  setSyncedAt(at: string): void;
  /** Disconnect: the tool's records and sync go. */
  forget(tool: CachePart): void;
  /** The notifications, newest first (spec 029). */
  notifications(): CachedNotification[];
  /**
   * Adds notifications, unread; an id already kept is left as it is. Then only the newest 200 stay, and none
   * from before `before`.
   */
  addNotifications(added: readonly Omit<CachedNotification, 'read'>[], keep?: { before: string }): void;
  /** Marks these notifications read, or all of them, and says how many were unread. */
  markNotificationsRead(ids: readonly string[] | 'all'): number;
  /** Rewrites what one notification holds; false when it isn't kept. */
  changeNotification(id: string, change: (data: unknown) => unknown): boolean;
  /** Clear cache: everything goes, the notifications too. */
  clear(): void;
  close(): void;
}

export function cacheFilePath(home: string): string {
  return join(home, 'cache.db');
}

export interface InboxCacheOptions {
  /** Told when an unreadable or damaged file, or one another version wrote, was deleted and made again. */
  onReset?: () => void;
  /** Told when something that isn't a file sits at the path; the cache then lives in memory for this run. */
  onUnusable?: () => void;
}

function remove(path: string): void {
  for (const suffix of ['', '-journal', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
}

function fresh(path: string): Database.Database {
  const sqlite = new Database(path);
  sqlite.exec(createTables);
  return sqlite;
}

/** SQLite's own codes for a file that isn't a database, or whose pages are damaged. */
function isDamaged(error: unknown): boolean {
  if (!(error instanceof Error) || !('code' in error) || typeof error.code !== 'string') return false;
  return error.code.startsWith('SQLITE_CORRUPT') || error.code.startsWith('SQLITE_NOTADB');
}

/** Whether the file at this version is whole: its header and, through `quick_check`, its pages. */
function usable(sqlite: Database.Database): 'ready' | 'empty' | 'unusable' {
  const found = sqlite.pragma('user_version', { simple: true });
  if (found === version) return sqlite.pragma('quick_check', { simple: true }) === 'ok' ? 'ready' : 'unusable';
  const tables = sqlite.prepare('SELECT count(*) FROM sqlite_master').pluck().get();
  return found === 0 && tables === 0 ? 'empty' : 'unusable';
}

/** The open file, ready at this version: made if it's new, made again if it can't be used. */
function connect(path: string, onReset: (() => void) | undefined): Database.Database {
  let sqlite: Database.Database | undefined;
  try {
    sqlite = new Database(path);
    const state = usable(sqlite);
    if (state === 'ready') return sqlite;
    if (state === 'empty') {
      sqlite.exec(createTables);
      return sqlite;
    }
  } catch {
    // Not a database, or damaged: made again below.
  }
  sqlite?.close();
  onReset?.();
  remove(path);
  return fresh(path);
}

/** Something other than a file (a folder, say) sits at the path, and DevHub never deletes that. */
function notAFile(path: string): boolean {
  try {
    return !lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function problemOf(json: string | null): InboxProblem | null {
  if (json === null) return null;
  try {
    const parsed = InboxProblemSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function parsed(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

/** Opens the cache at `path`, or in memory for `:memory:` (tests, and a host with no folder). */
export function openInboxCache(path: string, options: InboxCacheOptions = {}): InboxCache {
  let where = path;
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    if (notAFile(path)) {
      options.onUnusable?.();
      where = ':memory:';
    }
  }
  let sqlite = where === ':memory:' ? fresh(where) : connect(where, options.onReset);
  let db = ready(sqlite);

  function ready(opened: Database.Database) {
    if (where !== ':memory:') chmodSync(where, 0o600);
    // A forgotten tool's titles are overwritten in the file, not just unlinked.
    opened.pragma('secure_delete = ON');
    return drizzle({ client: opened });
  }

  /**
   * Runs `work`; if SQLite finds the file damaged while DevHub runs, the file is made again and `work`
   * runs once more, so neither Home nor Clear cache stays stuck on a broken file.
   */
  function guard<T>(work: () => T): T {
    try {
      return work();
    } catch (error) {
      if (where === ':memory:' || !isDamaged(error)) throw error;
      sqlite.close();
      options.onReset?.();
      remove(where);
      sqlite = fresh(where);
      db = ready(sqlite);
      return work();
    }
  }

  function saveTool(tool: CachePart, row: Omit<typeof tools.$inferInsert, 'tool'>): void {
    db.insert(tools)
      .values({ tool, ...row })
      .onConflictDoUpdate({ target: tools.tool, set: row })
      .run();
  }

  return {
    tool(tool) {
      return guard(() => {
        const row = db.select().from(tools).where(eq(tools.tool, tool)).get();
        if (row === undefined) return null;
        const kept = db
          .select({ data: records.data })
          .from(records)
          .where(eq(records.tool, tool))
          .orderBy(records.id)
          .all();
        return {
          connection: row.connection,
          syncedAt: row.syncedAt,
          problem: problemOf(row.problem),
          records: kept.map((record) => parsed(record.data)).filter((record) => record !== undefined),
        };
      });
    },

    synced(tool, { connection, at, records: written }) {
      guard(() => {
        db.transaction((tx) => {
          tx.delete(records).where(eq(records.tool, tool)).run();
          if (written.length > 0) {
            tx.insert(records)
              .values(written.map((record) => ({ tool, id: record.id, data: JSON.stringify(record.data) })))
              .run();
          }
          saveTool(tool, { connection, syncedAt: at, problem: null });
        });
      });
    },

    failed(tool, { connection, problem }) {
      guard(() => {
        db.transaction((tx) => {
          const before = tx.select().from(tools).where(eq(tools.tool, tool)).get();
          const sameAccount = before?.connection === connection;
          if (!sameAccount) tx.delete(records).where(eq(records.tool, tool)).run();
          saveTool(tool, {
            connection,
            syncedAt: sameAccount ? before.syncedAt : null,
            problem: JSON.stringify(problem),
          });
        });
      });
    },

    syncedAt() {
      return guard(() => db.select().from(meta).where(eq(meta.key, syncedAtKey)).get()?.value ?? null);
    },

    setSyncedAt(at) {
      guard(() => {
        db.insert(meta)
          .values({ key: syncedAtKey, value: at })
          .onConflictDoUpdate({ target: meta.key, set: { value: at } })
          .run();
      });
    },

    forget(tool) {
      guard(() => {
        db.transaction((tx) => {
          tx.delete(records).where(eq(records.tool, tool)).run();
          tx.delete(tools).where(eq(tools.tool, tool)).run();
        });
      });
    },

    notifications() {
      return guard(() =>
        db
          .select()
          .from(notifications)
          .orderBy(desc(notifications.at), desc(notifications.id))
          .all()
          .flatMap(({ data, ...row }) => {
            const read = parsed(data);
            return read === undefined ? [] : [{ ...row, data: read }];
          }),
      );
    },

    addNotifications(added, keep) {
      guard(() => {
        db.transaction((tx) => {
          if (added.length > 0) {
            tx.insert(notifications)
              .values(added.map((row) => ({ ...row, read: false, data: JSON.stringify(row.data) })))
              .onConflictDoNothing()
              .run();
          }
          if (keep !== undefined) tx.delete(notifications).where(lt(notifications.at, keep.before)).run();
          const newest = tx
            .select({ id: notifications.id })
            .from(notifications)
            .orderBy(desc(notifications.at), desc(notifications.id))
            .limit(notificationLimits.kept);
          tx.delete(notifications).where(notInArray(notifications.id, newest)).run();
        });
      });
    },

    markNotificationsRead(ids) {
      return guard(() => {
        const unread = eq(notifications.read, false);
        const which = ids === 'all' ? unread : and(unread, inArray(notifications.id, [...ids]));
        return db.update(notifications).set({ read: true }).where(which).run().changes;
      });
    },

    changeNotification(id, change) {
      return guard(() => {
        const row = db.select().from(notifications).where(eq(notifications.id, id)).get();
        if (row === undefined) return false;
        const data = JSON.stringify(change(parsed(row.data)));
        db.update(notifications).set({ data }).where(eq(notifications.id, id)).run();
        return true;
      });
    },

    clear() {
      guard(() => {
        db.transaction((tx) => {
          tx.delete(records).run();
          tx.delete(tools).run();
          tx.delete(meta).run();
          tx.delete(notifications).run();
        });
      });
    },

    close() {
      sqlite.close();
    },
  };
}
