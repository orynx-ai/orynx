import { z } from 'zod';
import {
  defaultTicketsChoice,
  TicketsChoiceSchema,
  type InboxProblem,
  type Tickets,
  type TicketsChoice,
} from '@devhub/contracts';
import type { CachedTool, InboxCache } from '../inbox/inbox-cache.ts';
import { toolState } from '../inbox/tool-state.ts';
import type { JiraClient, JiraSprintRef } from '../integrations/jira/client.ts';
import { jiraAccount, type JiraSyncCredentials } from '../integrations/jira/connection.ts';
import { jiraInboxProblem } from '../integrations/jira/map.ts';
import {
  boardLayout,
  pickSprint,
  sprintRecord,
  SprintRecordSchema,
  type BoardLayout,
  type SprintRecord,
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
  /**
   * Saves which sprint Tickets shows (spec 020). The sprint already kept was read for the old choice, so reads
   * say `syncing` until the next sync has read the new one.
   */
  choose(choice: TicketsChoice): Promise<void>;
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
const nothing: Omit<Tickets, 'jira' | 'choice'> = { sprint: null, tickets: [], truncated: false };

/**
 * The sprint as the cache keeps it, with the choice it was read for (spec 020): a record, or null when that
 * choice has no sprint. A row written before spec 020 holds the record alone, read for your sprint.
 */
const StoredSprintSchema = z.union([
  z.object({ for: TicketsChoiceSchema, record: SprintRecordSchema.nullable() }),
  SprintRecordSchema.transform((record) => ({ for: defaultTicketsChoice, record })),
]);

function sameChoice(a: TicketsChoice, b: TicketsChoice): boolean {
  return a.projectKey === b.projectKey && a.sprintId === b.sprintId;
}

/** The saved choice, or your sprint when there is none or it can't be read. */
function choiceIn(written: unknown): TicketsChoice {
  const choice = TicketsChoiceSchema.safeParse(written);
  return choice.success ? choice.data : defaultTicketsChoice;
}

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

  async function keep(account: string, choice: TicketsChoice, record: SprintRecord | null): Promise<SprintSyncOutcome> {
    if (!(await stillConnected(account))) return 'not_connected';
    cache.synced(part, {
      connection: account,
      at: new Date(now()).toISOString(),
      records: [{ id: 'sprint', data: { for: choice, record } }],
    });
    return 'answered';
  }

  /** No sprint (spec 020, AC-39): the project's tickets in no sprint, or yours, that aren't Done. */
  async function syncWithoutSprint(
    credentials: Extract<JiraSyncCredentials, { ok: true }>,
    projectKey: string | null,
  ): Promise<SprintSyncOutcome> {
    const { request, site } = credentials;
    const account = credentials.connection;
    const choice: TicketsChoice = { projectKey, sprintId: 'none' };
    const me = await jira.account(request);
    if (!me.ok) return fail(account, jiraInboxProblem(me.problem, site));
    const issues = await jira.issuesWithoutSprint(request, projectKey);
    if (!issues.ok) return fail(account, jiraInboxProblem(issues.problem, site));
    // No board orders them, so they sit in To do, In progress and Done by status category alone.
    return keep(
      account,
      choice,
      SprintRecordSchema.parse(
        sprintRecord({
          accountId: me.accountId,
          sprint: null,
          issues: issues.issues,
          layout: null,
          priorityOrder: issues.priorityOrder,
          truncated: issues.truncated,
        }),
      ),
    );
  }

  /** The sprint the choice names, and who the credentials belong to, or why Jira couldn't say. */
  async function chosenSprint(
    credentials: Extract<JiraSyncCredentials, { ok: true }>,
    choice: TicketsChoice,
  ): Promise<{ accountId: string; sprint: JiraSprintRef | null } | InboxProblem> {
    const { request, site } = credentials;
    if (choice.projectKey === null || choice.sprintId === 'none') {
      const mine = await jira.mySprints(request);
      if (!mine.ok) return jiraInboxProblem(mine.problem, site);
      return { accountId: mine.accountId, sprint: pickSprint(mine.issues) };
    }
    const me = await jira.account(request);
    if (!me.ok) return jiraInboxProblem(me.problem, site);
    if (choice.sprintId !== null) {
      const one = await jira.sprint(request, choice.sprintId);
      if (!one.ok) return jiraInboxProblem(one.problem, site);
      return { accountId: me.accountId, sprint: one.sprint };
    }
    // The project's current sprint: its active one ending soonest, or its first future one (spec 020).
    const open = await jira.projectSprints(request, choice.projectKey);
    if (!open.ok) return jiraInboxProblem(open.problem, site);
    return { accountId: me.accountId, sprint: open.sprints[0] ?? null };
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
    const choice = choiceIn((await settings.read()).tickets);
    if (choice.sprintId === 'none') return syncWithoutSprint(credentials, choice.projectKey);
    const chosen = await chosenSprint(credentials, choice);
    if ('kind' in chosen) return fail(account, chosen);
    const { accountId, sprint } = chosen;
    if (sprint === null) return keep(account, choice, null);
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
      choice,
      SprintRecordSchema.parse(
        sprintRecord({
          accountId,
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
      const choice = choiceIn(saved.tickets);
      if (saved.jira === undefined) return { jira: { state: 'not_connected' }, choice, ...nothing };
      const { site } = saved.jira;
      const stored = cache.tool(part);
      // Rows from another account never show: they go at its next sync.
      const cached: CachedTool | null = stored?.connection === jiraAccount(saved.jira) ? stored : null;
      const jiraState = toolState(cached, broken);
      if (cached === null) return { jira: jiraState, choice, ...nothing };
      // No row: a sync from before spec 020 found no sprint of yours.
      const kept = StoredSprintSchema.safeParse(cached.records[0] ?? { for: defaultTicketsChoice, record: null });
      if (!kept.success) return { jira: jiraState, choice, ...nothing };
      // Read for another choice: the new one's first sync hasn't ended, unless the last sync failed.
      if (!sameChoice(kept.data.for, choice)) {
        return { jira: jiraState.state === 'synced' ? { state: 'syncing' } : jiraState, choice, ...nothing };
      }
      const record = kept.data.record;
      if (record === null) return { jira: jiraState, choice, ...nothing };
      // No sprint keeps its tickets with no sprint of their own (spec 020).
      const joined = sessionsByTicket(sessions);
      return {
        jira: jiraState,
        choice,
        sprint: record.sprint,
        tickets: record.tickets.map((ticket) => ({
          ...ticket,
          url: `https://${site}/browse/${ticket.key}`,
          session: joined.get(ticket.key) ?? null,
        })),
        truncated: record.truncated,
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

    async choose(choice) {
      await settings.update(({ tickets: _, ...rest }) =>
        // Your sprint is the default, so it leaves nothing behind in settings.json.
        sameChoice(choice, defaultTicketsChoice) ? rest : { ...rest, tickets: { ...choice } },
      );
    },
  };
}
