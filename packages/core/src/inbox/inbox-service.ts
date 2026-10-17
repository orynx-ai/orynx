import type { z } from 'zod';
import type { Inbox, InboxProblem, InboxToolState, Preferences } from '@devhub/contracts';
import type { EventBus } from '../events/event-bus.ts';
import type { GitHubClient } from '../integrations/github/client.ts';
import type { GitHubSyncCredentials } from '../integrations/github/connection.ts';
import { githubInboxProblem, githubRecords, PullRequestRecordSchema } from '../integrations/github/map.ts';
import type { JiraClient } from '../integrations/jira/client.ts';
import { jiraAccount, type JiraSyncCredentials } from '../integrations/jira/connection.ts';
import { JiraIssueRecordSchema, jiraInboxProblem, jiraRecords } from '../integrations/jira/map.ts';
import type { SessionStore } from '../sessions/session-store.ts';
import type { Settings, SettingsStore } from '../settings/settings-store.ts';
import type { CachedTool, CacheRecord, InboxCache, InboxTool } from './inbox-cache.ts';
import { inboxItems } from './rules.ts';

/**
 * Home's "Needs your attention" list (spec 007). Reading answers from the cache at once and applies the
 * inbox rules then. Syncing asks Jira and GitHub side by side, one sync at a time, and writes what each
 * said, or why it couldn't, into the cache.
 */
export interface InboxService {
  /** The rows the rules let through, longest wait first, and where each tool stands. Asks no tool. */
  read(): Promise<Inbox>;
  /** Asks every connected tool now. A call while a sync runs waits for that one. */
  sync(): Promise<void>;
  /** Clear cache: everything goes, open pages are told, and a sync starts. */
  clear(): Promise<void>;
  /** Disconnect: the tool's rows go and open pages are told. */
  forget(tool: InboxTool): void;
}

export interface InboxServiceOptions {
  cache: InboxCache;
  /** Which tools are connected, and as which account. */
  settings: SettingsStore;
  /** The credentials each sync reads with. */
  connections: {
    jira: { credentials(): Promise<JiraSyncCredentials | null> };
    github: { credentials(): Promise<GitHubSyncCredentials | null> };
  };
  jira: JiraClient;
  github: GitHubClient;
  sessions: SessionStore;
  preferences: { read(): Promise<Preferences> };
  events: EventBus;
  /** Told about each tool's failed sync, for the terminal. Never holds a token. */
  onProblem?: (tool: InboxTool, problem: InboxProblem) => void;
  /** Told about anything unexpected while a tool syncs, such as a cache that can't be written. */
  onError?: (error: unknown) => void;
  /** The clock, in milliseconds. */
  now?: () => number;
}

/** How one tool's part of a sync ended. */
type Outcome = 'answered' | 'failed' | 'not_connected';

/** The account a tool is connected as, from the saved settings; null when it isn't connected. */
function accountOf(settings: Settings, tool: InboxTool): string | null {
  if (tool === 'jira') return settings.jira === undefined ? null : jiraAccount(settings.jira);
  return settings.github?.method ?? null;
}

function stateOf(cached: CachedTool | null): InboxToolState {
  if (cached === null) return { state: 'syncing' };
  if (cached.problem !== null) return { state: 'failed', problem: cached.problem, lastSyncedAt: cached.syncedAt };
  // A tool's row without a problem was written by a good sync, so it has a time.
  return cached.syncedAt === null ? { state: 'syncing' } : { state: 'synced', at: cached.syncedAt };
}

/** Records that still read as the schema says; one from an older shape is left out rather than failing. */
function records<T>(cached: CachedTool | null, schema: z.ZodType<T>): T[] {
  return (cached?.records ?? []).flatMap((record) => {
    const parsed = schema.safeParse(record);
    return parsed.success ? [parsed.data] : [];
  });
}

export function createInboxService(options: InboxServiceOptions): InboxService {
  const { cache, settings, connections, events } = options;
  const now = options.now ?? Date.now;
  let running: Promise<void> | undefined;

  /** The tool's cache, only while it's connected as the same account: a disconnected tool shows nothing. */
  function cachedFor(saved: Settings, tool: InboxTool): CachedTool | null | 'not_connected' {
    const account = accountOf(saved, tool);
    if (account === null) return 'not_connected';
    const cached = cache.tool(tool);
    return cached?.connection === account ? cached : null;
  }

  /** Writes only while the tool is still connected as the account the sync started with. */
  async function stillConnected(tool: InboxTool, connection: string): Promise<boolean> {
    return accountOf(await settings.read(), tool) === connection;
  }

  async function fail(tool: InboxTool, connection: string, problem: InboxProblem): Promise<Outcome> {
    if (!(await stillConnected(tool, connection))) return 'not_connected';
    cache.failed(tool, { connection, problem });
    options.onProblem?.(tool, problem);
    return 'failed';
  }

  async function keep(tool: InboxTool, connection: string, kept: readonly CacheRecord[]): Promise<Outcome> {
    if (!(await stillConnected(tool, connection))) return 'not_connected';
    cache.synced(tool, { connection, at: new Date(now()).toISOString(), records: kept });
    return 'answered';
  }

  async function syncJira(): Promise<Outcome> {
    const credentials = await connections.jira.credentials();
    if (credentials === null) return 'not_connected';
    if (!credentials.ok) return fail('jira', credentials.connection, credentials.problem);
    const answer = await options.jira.assigned(credentials.request);
    if (!answer.ok) return fail('jira', credentials.connection, jiraInboxProblem(answer.problem, credentials.site));
    const kept = jiraRecords(credentials.site, answer.issues, answer.priorityOrder);
    return keep(
      'jira',
      credentials.connection,
      kept.map((record) => ({ id: record.key, data: record })),
    );
  }

  async function syncGitHub(): Promise<Outcome> {
    const credentials = await connections.github.credentials();
    if (credentials === null) return 'not_connected';
    if (!credentials.ok) return fail('github', credentials.connection, credentials.problem);
    const answer = await options.github.inbox(credentials.token);
    if (!answer.ok) return fail('github', credentials.connection, githubInboxProblem(answer.problem));
    const kept = githubRecords(answer);
    return keep(
      'github',
      credentials.connection,
      kept.map((record) => ({ id: record.id, data: record })),
    );
  }

  async function run(): Promise<void> {
    const outcomes = await Promise.allSettled([syncJira(), syncGitHub()]);
    const ended = outcomes.map((outcome) => {
      if (outcome.status === 'fulfilled') return outcome.value;
      options.onError?.(outcome.reason);
      return 'failed';
    });
    const connected = ended.filter((outcome) => outcome !== 'not_connected');
    if (connected.length > 0 && connected.every((outcome) => outcome === 'answered')) {
      cache.setSyncedAt(new Date(now()).toISOString());
    }
    events.publish({ type: 'inbox.changed' });
  }

  function sync(): Promise<void> {
    running ??= run().finally(() => {
      running = undefined;
    });
    return running;
  }

  return {
    async read() {
      const [saved, sessions, preferences] = await Promise.all([
        settings.read(),
        options.sessions.list(),
        options.preferences.read(),
      ]);
      const jira = cachedFor(saved, 'jira');
      const github = cachedFor(saved, 'github');
      const items = inboxItems(
        {
          jira: jira === 'not_connected' ? [] : records(jira, JiraIssueRecordSchema),
          github: github === 'not_connected' ? [] : records(github, PullRequestRecordSchema),
          sessions,
        },
        preferences.inboxRules,
      );
      const anyConnected = jira !== 'not_connected' || github !== 'not_connected';
      return {
        items,
        tools: {
          jira: jira === 'not_connected' ? { state: 'not_connected' } : stateOf(jira),
          github: github === 'not_connected' ? { state: 'not_connected' } : stateOf(github),
        },
        syncedAt: anyConnected ? cache.syncedAt() : null,
      };
    },

    sync,

    clear() {
      cache.clear();
      events.publish({ type: 'inbox.changed' });
      sync().catch((error: unknown) => options.onError?.(error));
      return Promise.resolve();
    },

    forget(tool) {
      cache.forget(tool);
      events.publish({ type: 'inbox.changed' });
    },
  };
}
