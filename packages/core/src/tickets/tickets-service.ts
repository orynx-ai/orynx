import type { InboxProblem, Tickets } from '@devhub/contracts';
import type { CachedTool, InboxCache } from '../inbox/inbox-cache.ts';
import { toolState } from '../inbox/tool-state.ts';
import type { JiraClient } from '../integrations/jira/client.ts';
import { jiraAccount, type JiraSyncCredentials } from '../integrations/jira/connection.ts';
import { jiraInboxProblem } from '../integrations/jira/map.ts';
import {
  boardLayout,
  pickSprint,
  sprintRecord,
  SprintRecordSchema,
  type BoardLayout,
} from '../integrations/jira/sprint-map.ts';
import type { SessionStore } from '../sessions/session-store.ts';
import { sessionsByTicket } from '../sessions/ticket-sessions.ts';
import type { SettingsStore } from '../settings/settings-store.ts';

/**
 * Tickets: your current sprint (spec 008). Reading answers from the cache at once, with each ticket's
 * session joined. Syncing asks Jira for the sprint and writes it, or why it couldn't, into its own part
 * of `cache.db`, so a failed sprint read never marks Home's Jira rows as failed.
 */
export interface TicketsService {
  /** The sprint and its tickets, and where Jira's sprint read stands. Asks Jira nothing. */
  read(): Promise<Tickets>;
  /** Reads the sprint from Jira into the cache. Never rejects: a break in DevHub is a failed sync. */
  sync(): Promise<SprintSyncOutcome>;
  /** Disconnect or Clear cache: the sprint goes. */
  forget(): void;
}

/** How a sprint sync ended, as the inbox's sync counts its tools. */
export type SprintSyncOutcome = 'answered' | 'failed' | 'not_connected';

export interface TicketsServiceOptions {
  cache: InboxCache;
  /** Whether Jira is connected, and as which account. */
  settings: SettingsStore;
  /** The credentials each sync reads with. */
  connection: { credentials(): Promise<JiraSyncCredentials | null> };
  jira: JiraClient;
  sessions: SessionStore;
  /** Told about each failed sync, for the terminal. Never holds a token. */
  onProblem?: (problem: InboxProblem) => void;
  /** Told about anything unexpected while the sprint syncs, such as a cache that can't be written. */
  onError?: (error: unknown) => void;
  /** The clock, in milliseconds. */
  now?: () => number;
}

const part = 'jira_sprint';
const nothing: Omit<Tickets, 'jira'> = { sprint: null, tickets: [], truncated: false };

export function createTicketsService(options: TicketsServiceOptions): TicketsService {
  const { cache, settings, connection, jira } = options;
  const now = options.now ?? Date.now;
  /** The last sync threw in DevHub itself; cleared by the next sync that ends normally. */
  let broken = false;
  /**
   * The site's status categories from its status list, kept between syncs for one account. A board's
   * columns name statuses by id only, and categories rarely change, so the list is asked for again only
   * when the board shows a status this doesn't know.
   */
  let known: { connection: string; categories: ReadonlyMap<string, string>; asked: ReadonlySet<string> } | undefined;

  async function stillConnected(account: string): Promise<boolean> {
    const saved = await settings.read();
    return saved.jira !== undefined && jiraAccount(saved.jira) === account;
  }

  async function fail(account: string, problem: InboxProblem): Promise<SprintSyncOutcome> {
    if (!(await stillConnected(account))) return 'not_connected';
    cache.failed(part, { connection: account, problem });
    options.onProblem?.(problem);
    return 'failed';
  }

  async function keep(account: string, record: unknown): Promise<SprintSyncOutcome> {
    if (!(await stillConnected(account))) return 'not_connected';
    cache.synced(part, {
      connection: account,
      at: new Date(now()).toISOString(),
      records: record === null ? [] : [{ id: 'sprint', data: record }],
    });
    return 'answered';
  }

  /** The board's layout, asking for the status list only when the board shows a status not yet known. */
  async function layoutOf(
    credentials: Extract<JiraSyncCredentials, { ok: true }>,
    columns: Parameters<typeof boardLayout>[0],
  ): Promise<BoardLayout | InboxProblem> {
    const ids = columns.flatMap((column) => column.statusIds);
    const reuse = known?.connection === credentials.connection ? known : undefined;
    // A status the list didn't have when it was last read isn't a reason to read it again every sync.
    if (reuse !== undefined && ids.every((id) => reuse.categories.has(id) || reuse.asked.has(id))) {
      return boardLayout(columns, reuse.categories);
    }
    const answer = await jira.statusCategories(credentials.request);
    if (!answer.ok) return jiraInboxProblem(answer.problem, credentials.site);
    known = { connection: credentials.connection, categories: answer.categories, asked: new Set(ids) };
    return boardLayout(columns, answer.categories);
  }

  async function syncSprint(): Promise<SprintSyncOutcome> {
    const credentials = await connection.credentials();
    if (credentials === null) return 'not_connected';
    if (!credentials.ok) return fail(credentials.connection, credentials.problem);
    const { request, site } = credentials;
    const account = credentials.connection;
    const mine = await jira.mySprints(request);
    if (!mine.ok) return fail(account, jiraInboxProblem(mine.problem, site));
    const sprint = pickSprint(mine.issues);
    if (sprint === null) return keep(account, null);
    const [board, issues] = await Promise.all([
      sprint.boardId === null
        ? Promise.resolve({ ok: true as const, columns: null })
        : jira.boardColumns(request, sprint.boardId),
      jira.sprintIssues(request, sprint.id),
    ]);
    if (!board.ok) return fail(account, jiraInboxProblem(board.problem, site));
    if (!issues.ok) return fail(account, jiraInboxProblem(issues.problem, site));
    const layout = board.columns === null ? null : await layoutOf(credentials, board.columns);
    if (layout !== null && 'kind' in layout) return fail(account, layout);
    // Checked before it's written: a sprint that would break the contract fails the sync, loudly, and keeps the
    // last good one, rather than vanishing at the next read.
    return keep(
      account,
      SprintRecordSchema.parse(
        sprintRecord({
          accountId: mine.accountId,
          sprint,
          issues: issues.issues,
          layout,
          priorityOrder: issues.priorityOrder,
          truncated: issues.truncated,
        }),
      ),
    );
  }

  return {
    async read() {
      const [saved, sessions] = await Promise.all([settings.read(), options.sessions.list()]);
      if (saved.jira === undefined) return { jira: { state: 'not_connected' }, ...nothing };
      const { site } = saved.jira;
      const stored = cache.tool(part);
      // Rows from another account never show: they go at its next sync.
      const cached: CachedTool | null = stored?.connection === jiraAccount(saved.jira) ? stored : null;
      const jiraState = toolState(cached, broken);
      const record = SprintRecordSchema.safeParse(cached?.records[0]);
      if (!record.success) return { jira: jiraState, ...nothing };
      const joined = sessionsByTicket(sessions);
      return {
        jira: jiraState,
        sprint: record.data.sprint,
        tickets: record.data.tickets.map((ticket) => ({
          ...ticket,
          url: `https://${site}/browse/${ticket.key}`,
          session: joined.get(ticket.key) ?? null,
        })),
        truncated: record.data.truncated,
      };
    },

    async sync() {
      try {
        const outcome = await syncSprint();
        broken = false;
        return outcome;
      } catch (error) {
        broken = true;
        options.onError?.(error);
        return 'failed';
      }
    },

    forget() {
      cache.forget(part);
      known = undefined;
    },
  };
}
