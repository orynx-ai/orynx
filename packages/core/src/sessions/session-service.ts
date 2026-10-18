import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { PermissionMode, Repository, Session, StartSessionAnswer, StartSessionRequest } from '@devhub/contracts';
import type { AgentAdapter, AgentEvent } from '../agents/agent-adapter.ts';
import type { EventBus } from '../events/event-bus.ts';
import type { JiraClient } from '../integrations/jira/client.ts';
import type { JiraSyncCredentials } from '../integrations/jira/connection.ts';
import { briefText, sessionNote, ticketBrief } from './brief.ts';
import { addStep, addWork, endProgress, replaceStep, type NewStep, type Progress } from './progress.ts';
import type { SessionRecords, StoredSession } from './session-store.ts';
import { createWorktrees, type WorktreeProblem, type WorktreesOptions } from './worktrees.ts';

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
  /** Stop Claude (AC-9). A session that isn't working stays as it is. */
  stop(id: string): Promise<'stopped' | 'not_found'>;
  /** Stops the session if it's working, then deletes its worktree and branch (AC-10). */
  discard(id: string): Promise<'discarded' | 'not_found' | 'failed'>;
  /** Stops every running session and waits for every change still being saved, for the server's shutdown. */
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
  /** The Session screen hears about new steps at most this often; 250 ms (AC-4). */
  stepEventMs?: number;
}

/** At most this many sessions work at once (Q11). */
const mostWorking = 3;

function projectOf(key: string): string {
  return key.slice(0, key.lastIndexOf('-'));
}

function isLive(session: { state: Session['state'] }): boolean {
  return session.state !== 'stopped';
}

function isWorking(session: { state: Session['state'] }): boolean {
  return session.state === 'working' || session.state === 'needs_you';
}

/** A session that is setting up or running, and how to stop it. */
interface Run {
  controller: AbortController;
  /** The adapter's id for Claude's session, once it has started. */
  agentId: string | null;
  stopping: boolean;
}

type ProblemKind = NonNullable<Session['problem']>['kind'];

/** Read through a call: Stop can change it while the run waits, which TypeScript can't see. */
function stopping(run: Run): boolean {
  return run.stopping;
}

/** Whether Claude has done anything yet: a problem before that means it couldn't start (Q10f). */
function claudeWorked(session: Session): boolean {
  return session.activities.some((activity) =>
    ['explore', 'plan', 'edit', 'refused', 'finished'].includes(activity.kind),
  );
}

function progressOf(session: Session): Progress {
  return { step: session.step, activities: session.activities };
}

function withProgress(record: StoredSession, change: (progress: Progress) => Progress): StoredSession {
  const { step, activities } = change(progressOf(record.session));
  return { ...record, session: { ...record.session, step, activities: [...activities] } };
}

export function createSessionService(options: SessionServiceOptions): SessionService {
  const { records, repositories, claude, connection, describeTicket, events, adapter } = options;
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => randomBytes(8).toString('hex'));
  const stepEventMs = options.stepEventMs ?? 250;
  const worktrees = createWorktrees(options.worktrees);
  const runs = new Map<string, Run>();
  /** Work started by an event or a start that nobody awaits; `close()` waits for all of it. */
  const inFlight = new Set<Promise<unknown>>();
  function track(work: Promise<unknown>) {
    const tracked = work.catch(() => undefined).finally(() => inFlight.delete(tracked));
    inFlight.add(tracked);
  }
  const stepTimers = new Map<string, { timer: NodeJS.Timeout; again: boolean }>();

  /** `session.changed` at once, then at most once every `stepEventMs` while steps keep coming. */
  function stepsChanged(id: string) {
    const waiting = stepTimers.get(id);
    if (waiting !== undefined) {
      waiting.again = true;
      return;
    }
    events.publish({ type: 'session.changed', sessionId: id });
    const entry = { again: false, timer: setTimeout(tick, stepEventMs) };
    stepTimers.set(id, entry);
    function tick() {
      if (!entry.again) {
        stepTimers.delete(id);
        return;
      }
      entry.again = false;
      events.publish({ type: 'session.changed', sessionId: id });
      entry.timer = setTimeout(tick, stepEventMs);
    }
  }

  /** Changes a session; the lists hear at once when its state or title changed, the Session screen always. */
  async function change(id: string, update: (record: StoredSession) => StoredSession): Promise<StoredSession | null> {
    const seen = { listsChanged: false };
    const saved = await records.update(id, (current) => {
      const next = update(current);
      seen.listsChanged = next.session.state !== current.session.state || next.session.title !== current.session.title;
      return { ...next, session: { ...next.session, updatedAt: new Date(now()).toISOString() } };
    });
    if (saved === null) return null;
    if (seen.listsChanged) events.publish({ type: 'sessions.changed' });
    stepsChanged(id);
    return saved;
  }

  function report(record: StoredSession | null, kind: ProblemKind, code: string | null) {
    if (record === null) return;
    const ticket = record.session.source?.kind === 'jira' ? record.session.source.key : '';
    options.onReport?.({ what: 'failed', session: record.session.id, ticket, problem: kind, code });
  }

  /** Ends a session with a problem: Stopped, every step done, and the terminal told the kind. */
  async function fail(id: string, kind: ProblemKind, code: string | null) {
    const run = runs.get(id);
    if (run?.stopping === true) return;
    runs.delete(id);
    const saved = await change(id, (record) => {
      const ended = withProgress(record, (progress) => endProgress(progress, null));
      return {
        ...ended,
        session: {
          ...ended.session,
          state: 'stopped',
          problem: { kind, stage: claudeWorked(record.session) ? 'working' : 'starting' },
          endedAt: record.session.endedAt ?? new Date(now()).toISOString(),
        },
      };
    });
    report(saved, kind, code);
  }

  function worktreeFailure(id: string, problem: WorktreeProblem): Promise<void> {
    if (problem.kind === 'stopped') return Promise.resolve();
    return fail(id, problem.kind, problem.kind === 'git' ? problem.step : null);
  }

  function heard(id: string, run: Run, event: AgentEvent) {
    if (stopping(run)) return;
    switch (event.type) {
      case 'started':
        track(
          change(id, (record) => ({ ...record, claudeSessionId: event.agentSessionId })).then((record) => {
            if (record === null) return;
            const ticket = record.session.source?.kind === 'jira' ? record.session.source.key : '';
            options.onReport?.({ what: 'started', session: id, ticket, loaded: event.loaded });
          }),
        );
        return;
      case 'work': {
        const finished = event.work.kind === 'finished';
        // At once, so the `ended` that follows a finish isn't taken for an end without one.
        if (finished) runs.delete(id);
        track(
          change(id, (record) => {
            const next = withProgress(record, (progress) => addWork(progress, event.work));
            if (!finished) return next;
            return { ...next, session: { ...next.session, state: 'done', endedAt: new Date(now()).toISOString() } };
          }),
        );
        return;
      }
      case 'problem':
        track(fail(id, event.kind, event.code));
        return;
      case 'ended':
        // Claude Code ended without finishing or saying why.
        if (runs.get(id) === run) track(fail(id, 'other', 'ended'));
        return;
    }
  }

  async function run(id: string, run: Run): Promise<void> {
    const record = await records.get(id);
    if (record === null || record.session.source?.kind !== 'jira' || record.worktree === null) return;
    const key = record.session.source.key;
    const { signal } = run.controller;

    const credentials = await connection.credentials();
    if (credentials?.ok !== true)
      return fail(id, 'jira', credentials === null ? 'not_connected' : credentials.problem.kind);
    const answer = await options.jira.issue(credentials.request, key);
    if (!answer.ok) return fail(id, 'jira', answer.problem.kind);
    if (stopping(run)) return;
    const { issue } = answer;
    await change(id, (current) => ({
      ...current,
      session: { ...current.session, title: issue.summary.trim() === '' ? current.session.title : issue.summary },
    }));

    const prepared = await worktrees.prepare(record.repository.path, key, signal);
    if (!prepared.ok) return worktreeFailure(id, prepared.problem);
    const { plan } = prepared;
    const making = { kind: 'worktree', branch: plan.branch, base: plan.base, fetched: false } as const;
    const withStep = await change(id, (current) => {
      const next = withProgress(current, (progress) => addStep(progress, making, 'running'));
      return { ...next, session: { ...next.session, branch: plan.branch } };
    });
    const stepId = withStep?.session.activities.at(-1)?.id ?? '';
    const made = await worktrees.make(record.repository.path, record.worktree, plan, signal);
    await change(id, (current) =>
      withProgress(current, (progress) =>
        replaceStep(progress, stepId, { ...making, fetched: made.ok && made.fetched }),
      ),
    );
    if (!made.ok) return worktreeFailure(id, made.problem);
    if (stopping(run)) return;

    const brief = ticketBrief(issue);
    await records.writeBrief(id, briefText(brief));
    await change(id, (current) => withProgress(current, (progress) => addStep(progress, { kind: 'brief', key })));
    if (stopping(run)) return;

    if (adapter === null) return fail(id, 'other', 'no_claude_code');
    const { permissionMode } = await options.preferences.read();
    // Stop can come while the mode is read: then Claude never starts.
    if (stopping(run)) return;
    const agentId = await adapter.startSession(
      brief,
      record.worktree,
      { mode: permissionMode, allowedCommands: [] },
      sessionNote(plan.branch),
    );
    run.agentId = agentId;
    // Or while Claude starts, after Stop found no Claude to stop: then the run stops it itself.
    if (stopping(run)) {
      await adapter.stop(agentId);
      return;
    }
    adapter.onEvent(agentId, (event) => {
      heard(id, run, event);
    });
  }

  /**
   * Ends a working session with `last` (you stopped it, or Orynx closed): git and Claude are stopped first,
   * and nothing they say afterwards changes the session.
   */
  async function halt(id: string, last: NewStep): Promise<void> {
    const run = runs.get(id);
    if (run !== undefined) {
      run.stopping = true;
      runs.delete(id);
      run.controller.abort();
      if (run.agentId !== null && adapter !== null) await adapter.stop(run.agentId);
    }
    await change(id, (record) => {
      if (!isWorking(record.session)) return record;
      const ended = withProgress(record, (progress) => endProgress(progress, last));
      return {
        ...ended,
        session: {
          ...ended.session,
          state: 'stopped',
          endedAt: record.session.endedAt ?? new Date(now()).toISOString(),
        },
      };
    });
  }

  function begin(id: string) {
    const started: Run = { controller: new AbortController(), agentId: null, stopping: false };
    runs.set(id, started);
    track(run(id, started).catch(() => fail(id, 'other', 'unexpected')));
  }
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
        approvals: [],
      },
      repository: { id: folder.id, path: folder.path },
      worktree: join(options.worktrees.root, id),
      claudeSessionId: null,
    };
    await records.create(record);
    events.publish({ type: 'sessions.changed' });
    begin(id);
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

    async stop(id) {
      const record = await records.get(id);
      if (record === null) return 'not_found';
      if (isWorking(record.session)) await halt(id, { kind: 'stopped' });
      return 'stopped';
    },

    async discard(id) {
      const found = await records.get(id);
      if (found === null) return 'not_found';
      if (found.session.discardedAt !== null) return 'discarded';
      if (isWorking(found.session)) await halt(id, { kind: 'stopped' });
      const record = (await records.get(id)) ?? found;
      const { branch } = record.session;
      if (record.worktree !== null) {
        const removed = await worktrees.remove(record.repository.path, record.worktree, branch);
        if (!removed.ok) {
          report(record, 'git', 'remove');
          return 'failed';
        }
      }
      await change(id, (current) => {
        const ended =
          branch === null
            ? current
            : withProgress(current, (progress) => endProgress(progress, { kind: 'discarded', branch }));
        return {
          ...ended,
          session: { ...ended.session, state: 'stopped', discardedAt: new Date(now()).toISOString() },
        };
      });
      return 'discarded';
    },

    async close() {
      // A session still working when Orynx closes was closed, not stopped by you (AC-14).
      await Promise.all([...runs.keys()].map((id) => halt(id, { kind: 'interrupted' })));
      while (inFlight.size > 0) await Promise.all(inFlight);
      for (const { timer } of stepTimers.values()) clearTimeout(timer);
      stepTimers.clear();
    },
  };
}
