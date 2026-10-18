import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { PermissionMode, Repository, Session, StartSessionAnswer, StartSessionRequest } from '@devhub/contracts';
import type { AgentAdapter } from '../agents/agent-adapter.ts';
import type { EventBus } from '../events/event-bus.ts';
import type { JiraClient } from '../integrations/jira/client.ts';
import type { JiraSyncCredentials } from '../integrations/jira/connection.ts';
import type { SessionRecords, StoredSession } from './session-store.ts';
import type { WorktreesOptions } from './worktrees.ts';

/**
 * Claude sessions (spec 011): starting one on a ticket, running it, stopping it and discarding it. A
 * start checks everything it can before anything exists (Q4), so a session that can't start leaves
 * nothing behind; what goes wrong later shows on the session itself (AC-13).
 */

/** What the terminal is told: kinds, ids and exit codes, never the ticket's text or Claude's words. */
export type SessionReport =
  | { what: 'started'; session: string; ticket: string; loaded: { tools: number; mcpServers: number; plugins: number } }
  | { what: 'failed'; session: string; ticket: string; problem: string; code: string | null };

export interface SessionService {
  start(request: StartSessionRequest): Promise<StartSessionAnswer>;
  /** The session as the Session screen shows it; null when there's none with this id. */
  get(id: string): Promise<Session | null>;
  /** Stops every running session, for the server's shutdown. */
  close(): Promise<void>;
}

export interface SessionServiceOptions {
  records: SessionRecords;
  repositories: { list(): Promise<readonly Repository[]> };
  /** 010's login check: a session needs Claude Code signed in. */
  claude: { connected(): Promise<boolean> };
  connection: { credentials(): Promise<JiraSyncCredentials | null> };
  jira: JiraClient;
  /** What the cache already knows about a ticket, for the title and breadcrumb before Jira answers. */
  describeTicket: (key: string) => Promise<{ title: string; sprint: string | null } | null>;
  preferences: { read(): Promise<{ permissionMode: PermissionMode }> };
  worktrees: WorktreesOptions;
  /** Null when the server was built without Claude Code: then no session can start (AC-22). */
  adapter: AgentAdapter | null;
  events: EventBus;
  onReport?: (report: SessionReport) => void;
  now?: () => number;
  newId?: () => string;
}

/** At most this many sessions work at once (Q11). */
const mostWorking = 3;

function projectOf(key: string): string {
  return key.slice(0, key.lastIndexOf('-'));
}

function isLive(session: { state: Session['state'] }): boolean {
  return session.state !== 'stopped';
}

export function createSessionService(options: SessionServiceOptions): SessionService {
  const { records, repositories, claude, connection, describeTicket, events } = options;
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => randomBytes(8).toString('hex'));
  /** One start at a time per ticket, so two tabs pressing Build start one session. */
  const starting = new Map<string, Promise<unknown>>();

  async function liveSessionOn(key: string): Promise<string | null> {
    const listed = await records.list();
    const live = listed.filter(
      (session) => session.source?.kind === 'jira' && session.source.key === key && isLive(session),
    );
    live.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return live[0]?.id ?? null;
  }

  async function workingCount(): Promise<number> {
    return (await records.list()).filter((session) => session.state === 'working' || session.state === 'needs_you')
      .length;
  }

  async function jiraLink(key: string): Promise<string | null> {
    const credentials = await connection.credentials();
    return credentials === null ? null : `https://${credentials.site}/browse/${key}`;
  }

  async function startNow({ ticketKey, repositoryId }: StartSessionRequest): Promise<StartSessionAnswer> {
    const live = await liveSessionOn(ticketKey);
    if (live !== null) return { result: 'existing', sessionId: live };

    if (!(await claude.connected())) return { result: 'cannot_start', reason: 'signed_out' };
    if ((await workingCount()) >= mostWorking) return { result: 'cannot_start', reason: 'too_many' };

    const project = projectOf(ticketKey);
    const folders = (await repositories.list()).filter((folder) => folder.jiraProject === project);
    if (folders.length === 0) return { result: 'cannot_start', reason: 'no_folder' };
    const folder =
      repositoryId === undefined
        ? folders.length === 1
          ? folders[0]
          : undefined
        : folders.find((candidate) => candidate.id === repositoryId);
    if (folder === undefined) return { result: 'cannot_start', reason: 'choose_folder' };

    const id = newId();
    const at = new Date(now()).toISOString();
    const known = await describeTicket(ticketKey);
    const record: StoredSession = {
      session: {
        id,
        title: known?.title ?? ticketKey,
        state: 'working',
        source: { kind: 'jira', key: ticketKey },
        updatedAt: at,
        folder: { name: folder.name, displayPath: folder.displayPath },
        branch: null,
        step: 'plan',
        activities: [],
        problem: null,
        startedAt: at,
        endedAt: null,
        discardedAt: null,
        jiraUrl: await jiraLink(ticketKey),
        sprint: known?.sprint ?? null,
      },
      repository: { id: folder.id, path: folder.path },
      worktree: join(options.worktrees.root, id),
      claudeSessionId: null,
    };
    await records.create(record);
    events.publish({ type: 'sessions.changed' });
    return { result: 'started', sessionId: id };
  }

  return {
    start(request) {
      const waiting = starting.get(request.ticketKey);
      const turn = (waiting ?? Promise.resolve()).then(() => startNow(request));
      starting.set(
        request.ticketKey,
        turn.catch(() => undefined),
      );
      return turn;
    },

    async get(id) {
      return (await records.get(id))?.session ?? null;
    },

    close() {
      return Promise.resolve();
    },
  };
}
