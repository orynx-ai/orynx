import type { z } from 'zod';
import type { Inbox, InboxProblem, Preferences } from '@devhub/contracts';
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
import { toolState } from './tool-state.ts';

/**
 * Home's "Needs your attention" list (spec 007). Reading answers from the cache at once and applies the
 * inbox rules then. Syncing asks Jira and GitHub side by side, one sync at a time, and writes what each
 * said, or why it couldn't, into the cache.
 */
export interface InboxService {
  /** The rows the rules let through, longest wait first, and where each tool stands. Asks no tool. */
  read(): Promise<Inbox>;
  /** Asks every connected tool now. A call while a sync runs waits for that one (Refresh). */
  sync(): Promise<void>;
  /**
   * A sync that sees a change just made, such as a tool connecting: a sync already running read the old
   * state, so another one follows it. Resolves when that one has ended.
   */
  syncAfterChange(): Promise<void>;
  /** Resolves once no sync is running, so the host can close the cache after the last write. */
  idle(): Promise<void>;
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

const syncedTools = ['jira', 'github'] as const satisfies readonly InboxTool[];

/** The account a tool is connected as, from the saved settings; null when it isn't connected. */
function accountOf(settings: Settings, tool: InboxTool): string | null {
  if (tool === 'jira') return settings.jira === undefined ? null : jiraAccount(settings.jira);
  return settings.github?.method ?? null;
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
  /** A change came while a sync was running, so another pass follows it. */
  let again = false;
  /** Tools whose last sync threw in DevHub itself; cleared by their next sync that ends normally. */
  const broken = new Set<InboxTool>();

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
    const ended = outcomes.map((outcome, index): Outcome => {
      const tool = syncedTools[index] ?? 'jira';
      if (outcome.status === 'rejected') {
        broken.add(tool);
        options.onError?.(outcome.reason);
        return 'failed';
      }
      broken.delete(tool);
      // Rows a disconnected tool left behind (a late write, or a disconnect while DevHub was stopped) go.
      if (outcome.value === 'not_connected' && cache.tool(tool) !== null) cache.forget(tool);
      return outcome.value;
    });
    const connected = ended.filter((outcome) => outcome !== 'not_connected');
    if (connected.length > 0 && connected.every((outcome) => outcome === 'answered')) {
      cache.setSyncedAt(new Date(now()).toISOString());
    }
    events.publish({ type: 'inbox.changed' });
  }

  /** Read through a call: `run()` can set it while it awaits, which narrowing can't see. */
  function anotherPassAsked(): boolean {
    return again;
  }

  async function passes(): Promise<void> {
    try {
      do {
        again = false;
        await run();
      } while (anotherPassAsked());
    } finally {
      running = undefined;
    }
  }

  function sync(): Promise<void> {
    running ??= passes();
    return running;
  }

  function syncAfterChange(): Promise<void> {
    if (running !== undefined) again = true;
    return sync();
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
          jira: jira === 'not_connected' ? { state: 'not_connected' } : toolState(jira, broken.has('jira')),
          github: github === 'not_connected' ? { state: 'not_connected' } : toolState(github, broken.has('github')),
        },
        syncedAt: anyConnected ? cache.syncedAt() : null,
      };
    },

    sync,

    syncAfterChange,

    idle() {
      return (running ?? Promise.resolve()).catch(() => undefined);
    },

    clear() {
      cache.clear();
      events.publish({ type: 'inbox.changed' });
      syncAfterChange().catch((error: unknown) => options.onError?.(error));
      return Promise.resolve();
    },

    forget(tool) {
      cache.forget(tool);
      events.publish({ type: 'inbox.changed' });
    },
  };
}
