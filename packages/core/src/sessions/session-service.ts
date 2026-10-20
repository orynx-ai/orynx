import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AgentChoice,
  ApprovalDecision,
  ComposerChip,
  CreatePullRequestAnswer,
  CreatePullRequestRequest,
  FileDiff,
  Permissions,
  PullRequestDraftAnswer,
  PushAnswer,
  PushDraftAnswer,
  PushRequest,
  Repository,
  SendMessageAnswer,
  Session,
  SessionApproval,
  SessionBrief,
  SessionChanges,
  SessionFollowUp,
  SessionTicket,
  StartSessionAnswer,
  StartSessionRequest,
  ComposerStart,
  TicketStart,
} from '@devhub/contracts';
import type { AgentAdapter, AgentBrief, AgentEvent } from '../agents/agent-adapter.ts';
import type { EventBus } from '../events/event-bus.ts';
import { createGitHubClient, type GitHubClient } from '../integrations/github/client.ts';
import type { GitHubSyncCredentials } from '../integrations/github/connection.ts';
import type { JiraClient } from '../integrations/jira/client.ts';
import type { JiraSyncCredentials } from '../integrations/jira/connection.ts';
import { createBranchGit } from './branch-git.ts';
import { askNote, briefText, composerBrief, sessionNote, ticketFromBrief } from './brief.ts';
import type { ChangesReader, StartPoint } from './changes.ts';
import {
  chooseFolder,
  composerPlan,
  contextAfter,
  noReads,
  readsAfter,
  pullToWorkOn,
  ticketKeyOf,
  ticketPlan,
  type StartPlan,
} from './compose.ts';
import type { SkillsService } from '../skills/skills-service.ts';
import type { ContextReader } from './context-reader.ts';
import {
  addStep,
  addWaiting,
  addWork,
  endProgress,
  removeWaiting,
  replaceStep,
  resumeProgress,
  type NewStep,
  type Progress,
} from './progress.ts';
import { createPullRequests, type PullRequestReport } from './pull-requests.ts';
import {
  pullKey,
  type ApprovalRecord,
  type ListedSession,
  type SessionRecords,
  type StoredSession,
} from './session-store.ts';
import { createWorktrees, type WorktreeProblem, type WorktreesOptions } from './worktrees.ts';

/**
 * Claude sessions (spec 011): starting one on a ticket or from the composer (spec 015), running it, stopping
 * it and discarding it. A start checks everything it can before anything exists (Q4), so a session that can't
 * start leaves nothing behind; what goes wrong later shows on the session itself (AC-13).
 */

/** Who ended a waiting call (spec 012). */
export type ApprovalEnd = NonNullable<ApprovalRecord['by']>;

/**
 * What the terminal is told: kinds, ids, answers and exit codes, never the ticket's text, Claude's words, a
 * command or a path (spec 011 AC-21, spec 012 AC-22).
 */
export type SessionReport =
  | { what: 'started'; session: string; ticket: string; loaded: { tools: number; mcpServers: number; plugins: number } }
  | { what: 'failed'; session: string; ticket: string; problem: string; code: string | null }
  | { what: 'asked'; session: string; ticket: string; about: 'command' | 'edit' }
  | {
      what: 'answered';
      session: string;
      ticket: string;
      about: 'command' | 'edit';
      answer: ApprovalDecision | null;
      by: ApprovalEnd;
    }
  /** You sent a follow-up (spec 013): into the running Claude, or resuming it. Never its text (AC-23). */
  | { what: 'followed_up'; session: string; ticket: string; resumed: boolean }
  /** Create pull request or Push changes ended (spec 014): how, and the number. Never a title or git's words. */
  | PullRequestReport;

/** The answer to `send()`: the follow-up's own answer, or no session with this id. */
export type SendResult = SendMessageAnswer | { result: 'not_found' };

/**
 * The answer to `respond()`: the call was answered; there's no such session or call; it was answered
 * already; Always allow isn't offered for it; or Always allow couldn't save the list, so nothing was decided.
 */
export type RespondResult = 'answered' | 'not_found' | 'already_answered' | 'not_offered' | 'not_saved';

export interface SessionService {
  /** Ship's start on a ticket, or the composer's with your message and its chips (spec 015). */
  start(request: StartSessionRequest): Promise<StartSessionAnswer>;
  /** The session as the Session screen shows it; null when there's none with this id. */
  get(id: string): Promise<Session | null>;
  /** Stop Claude (AC-9). A session that isn't working stays as it is. */
  stop(id: string): Promise<'stopped' | 'not_found'>;
  /** Stops the session if it's working, then deletes its worktree and branch (AC-10). */
  discard(id: string): Promise<'discarded' | 'not_found' | 'failed'>;
  /** Your answer to a call waiting in this session (spec 012). The first answer counts. */
  respond(id: string, approvalId: string, decision: ApprovalDecision): Promise<RespondResult>;
  /**
   * A follow-up (spec 013, Q1): read by Claude after its current step while it works, or carried on in Claude
   * Code's own session once it has finished or stopped. Sends one at a time for each session.
   */
  /** A follow-up, with the tickets, pull requests and files added to it, read as the composer's are (spec 025). */
  send(id: string, text: string, context?: readonly ComposerChip[], choice?: AgentChoice): Promise<SendResult>;
  /** Exactly what Claude was sent at the start, as saved (spec 011, Q5); null for no such session. */
  brief(id: string): Promise<SessionBrief | null>;
  /** What changed in the worktree (spec 013, Q4); null for no such session, `unreadable` when git failed. */
  changes(id: string): Promise<SessionChanges | 'unreadable' | null>;
  /** One changed file's diff; null for no such session or no such changed file (AC-24). */
  fileDiff(id: string, path: string): Promise<FileDiff | 'unreadable' | null>;
  /** Claude's draft of the pull request, which changes nothing (spec 014, AC-14); null for no such session. */
  draftPullRequest(id: string): Promise<PullRequestDraftAnswer | null>;
  /** Commits, pushes and opens the pull request, on your press only (spec 014); null for no such session. */
  createPullRequest(id: string, request: CreatePullRequestRequest): Promise<CreatePullRequestAnswer | null>;
  /** Claude's commit message for what's new since the last push (spec 014, Q7); null for no such session. */
  draftPush(id: string): Promise<PushDraftAnswer | null>;
  /** Commits what's new and pushes it to the pull request, on your press only (Q7); null for no such session. */
  push(id: string, request: PushRequest): Promise<PushAnswer | null>;
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
  /** Reads the composer's chips from Jira and GitHub before a composer start makes anything (spec 015). */
  context: ContextReader;
  /** Finds the skills a composer message names (spec 022); without it, `/name` is only words. */
  skills?: Pick<SkillsService, 'named'>;
  /**
   * What the cache already knows about a ticket: the title and breadcrumb before Jira answers (spec 011), and
   * its status and due date now, for the Ticket tab (spec 013).
   */
  describeTicket: (key: string) => Promise<{
    title: string;
    sprint: string | null;
    status: SessionTicket['status'];
    dueDate: string | null;
  } | null>;
  preferences: {
    read(): Promise<{ permissions: Permissions; allowedCommands: readonly string[] }>;
    /** Saves Always allow's entry to the list (spec 012, AC-5). */
    change(change: { allowCommand: string }): Promise<unknown>;
  };
  worktrees: WorktreesOptions;
  /** Reads a worktree's changes for the Changes tab (spec 013). */
  changes: ChangesReader;
  /** 004's GitHub connection, for the pull request's token (spec 014). Without it, GitHub isn't connected. */
  github?: { credentials(): Promise<GitHubSyncCredentials | null> };
  githubClient?: GitHubClient;
  /** Null when the server was built without Claude Code: then no session can start (AC-22). */
  adapter: AgentAdapter | null;
  events: EventBus;
  onReport?: (report: SessionReport) => void;
  /**
   * Told after every saved change to a session, for the notifications (spec 029). `quiet` is a change Orynx made
   * itself, Discard or Orynx closing, which you know about already.
   */
  onChange?: (before: Session, after: Session, change: { quiet: boolean }) => void;
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
  /** The adapter's id once Claude has started; null when it never will. A follow-up waits for it (spec 013). */
  started: Promise<string | null>;
  markStarted: (agentId: string | null) => void;
}

function newRun(): Run {
  let markStarted: (agentId: string | null) => void = () => undefined;
  const started = new Promise<string | null>((resolve) => {
    markStarted = resolve;
  });
  return { controller: new AbortController(), agentId: null, stopping: false, started, markStarted };
}

/** A run has ended: its time joins Claude's working time, and nothing runs now (spec 013, Q3). */
function endRun(session: Session, at: number): Pick<Session, 'workedMs' | 'runStartedAt'> {
  const since = session.runStartedAt === null ? at : Date.parse(session.runStartedAt);
  return { workedMs: session.workedMs + Math.max(0, at - since), runStartedAt: null };
}

type ProblemKind = NonNullable<Session['problem']>['kind'];

/** Read through a call: Stop can change it while the run waits, which TypeScript can't see. */
function stopping(run: Run): boolean {
  return run.stopping;
}

/** Whether Claude has done anything yet: a problem before that means it couldn't start (Q10f). */
function claudeWorked(session: Session): boolean {
  return session.activities.some((activity) =>
    ['explore', 'plan', 'edit', 'refused', 'finished', 'waiting', 'command', 'denied'].includes(activity.kind),
  );
}

/** Whether the ticket alone was the brief, so Claude's note points it at the ticket (spec 015, Q8c). */
function ticketNote(session: Session): boolean {
  const brief = session.activities.find((activity) => activity.kind === 'brief');
  if (brief === undefined) return session.source?.kind === 'jira';
  return brief.key !== null && !brief.message;
}

function ticketOf(record: StoredSession): string {
  return record.session.source?.kind === 'jira' ? record.session.source.key : '';
}

/**
 * Ends the waiting calls `which` picks: they leave the session's approvals and their steps go, the log says
 * how each ended, and a session with none left waiting is Working again. Gives the log's entries it ended.
 */
function endApprovals(
  record: StoredSession,
  which: (id: string) => boolean,
  answer: ApprovalDecision | null,
  by: ApprovalEnd,
  at: string,
): { record: StoredSession; ended: ApprovalRecord[] } {
  const ending = record.session.approvals.filter((approval) => which(approval.id));
  const unanswered = record.approvalLog.filter((entry) => entry.by === null && which(entry.id));
  if (ending.length === 0 && unanswered.length === 0) return { record, ended: [] };
  const ended = unanswered.map((entry) => ({ ...entry, answer, by, answeredAt: at }));
  const approvals = record.session.approvals.filter((approval) => !which(approval.id));
  const withoutSteps = ending.reduce(
    (progress, approval) => removeWaiting(progress, approval.id),
    progressOf(record.session),
  );
  const state = record.session.state === 'needs_you' && approvals.length === 0 ? 'working' : record.session.state;
  return {
    record: {
      ...record,
      session: {
        ...record.session,
        state,
        approvals,
        step: withoutSteps.step,
        activities: [...withoutSteps.activities],
      },
      approvalLog: record.approvalLog.map((entry) => ended.find((done) => done.id === entry.id) ?? entry),
    },
    ended,
  };
}

/**
 * What the Changes tab compares the worktree with (spec 013, Q4): the commit the branch started from, or, for a
 * session made before spec 013, the base its worktree step names. Null when no worktree was ever made.
 */
function startPointOf(record: StoredSession): StartPoint | null {
  const { session } = record;
  if (record.worktree === null || session.branch === null) return null;
  // git couldn't make the worktree, so there's none to read.
  if (session.problem?.kind === 'git' && session.problem.stage === 'starting') return null;
  if (record.startCommit !== null) return { commit: record.startCommit };
  const made = session.activities.find((activity) => activity.kind === 'worktree');
  return made?.kind === 'worktree' ? { base: made.base } : null;
}

/** The files Claude edited, in the order it first did (Q5). */
function editOrder(session: Session): string[] {
  return session.activities.flatMap((activity) => (activity.kind === 'edit' ? activity.files : []));
}

/** Where an Ask session's Claude reads: the folder in place, or its own empty folder when it has none (spec 031). */
function askPlace(record: StoredSession): string | null {
  return record.repository?.path ?? record.worktree;
}

function progressOf(session: Session): Progress {
  return { step: session.step, activities: session.activities, skipped: session.skipped };
}

function withProgress(record: StoredSession, change: (progress: Progress) => Progress): StoredSession {
  const { step, activities, skipped = [] } = change(progressOf(record.session));
  return { ...record, session: { ...record.session, step, activities: [...activities], skipped: [...skipped] } };
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
  /** Your answers on their way to Claude, by approval id, so the log says what you answered. */
  const given = new Map<string, ApprovalDecision>();
  /** The calls an answer has been taken for, so a second answer, from another tab, is late. */
  const claimed = new Set<string>();
  /** Follow-ups one at a time for each session (spec 013). */
  const sending = new Map<string, Promise<unknown>>();
  /** Stops and discards still under way: a follow-up waits for them, so it never undoes one (spec 013). */
  const ending = new Map<string, Set<Promise<unknown>>>();
  /** When the Claude Code each session last started has ended: a resume waits for it (spec 013). */
  const agentEnded = new Map<string, Promise<void>>();
  const fileTimers = new Map<string, { timer: NodeJS.Timeout; again: boolean }>();

  /** `session.files.changed` at once, then at most once a second while Claude edits and runs commands (AC-2). */
  function filesChanged(id: string) {
    const waiting = fileTimers.get(id);
    if (waiting !== undefined) {
      waiting.again = true;
      return;
    }
    events.publish({ type: 'session.files.changed', sessionId: id });
    const entry = { again: false, timer: setTimeout(tick, 1_000) };
    fileTimers.set(id, entry);
    function tick() {
      if (!entry.again) {
        fileTimers.delete(id);
        return;
      }
      entry.again = false;
      events.publish({ type: 'session.files.changed', sessionId: id });
      entry.timer = setTimeout(tick, 1_000);
    }
  }

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
  async function change(
    id: string,
    update: (record: StoredSession) => StoredSession,
    { quiet = false } = {},
  ): Promise<StoredSession | null> {
    const seen: { listsChanged: boolean; before: Session | null } = { listsChanged: false, before: null };
    const saved = await records.update(id, (current) => {
      const next = update(current);
      seen.listsChanged = next.session.state !== current.session.state || next.session.title !== current.session.title;
      seen.before = current.session;
      return { ...next, session: { ...next.session, updatedAt: new Date(now()).toISOString() } };
    });
    if (saved === null) return null;
    if (seen.listsChanged) events.publish({ type: 'sessions.changed' });
    stepsChanged(id);
    if (seen.before !== null) options.onChange?.(seen.before, saved.session, { quiet });
    // Claude may have opened the pull request itself (spec 026): once a run ends, GitHub is asked for it.
    if (seen.before !== null && isWorking(seen.before) && !isWorking(saved.session)) track(pullRequests.link(id));
    return saved;
  }

  function report(record: StoredSession | null, kind: ProblemKind, code: string | null) {
    if (record === null) return;
    options.onReport?.({ what: 'failed', session: record.session.id, ticket: ticketOf(record), problem: kind, code });
  }

  function reportAnswered(id: string, ticket: string, ended: readonly ApprovalRecord[]) {
    for (const entry of ended) {
      if (entry.by === null) continue;
      options.onReport?.({
        what: 'answered',
        session: id,
        ticket,
        about: entry.about,
        answer: entry.answer,
        by: entry.by,
      });
    }
  }

  /** Changes a session and ends some of its waiting calls in the same change, then tells the terminal. */
  async function changeEnding(
    id: string,
    update: (record: StoredSession) => StoredSession,
    which: (approvalId: string) => boolean,
    answer: ApprovalDecision | null,
    by: ApprovalEnd,
  ): Promise<StoredSession | null> {
    let ended: ApprovalRecord[] = [];
    const saved = await change(
      id,
      (record) => {
        const result = endApprovals(update(record), which, answer, by, new Date(now()).toISOString());
        ended = result.ended;
        return result.record;
      },
      { quiet: by === 'discarded' || by === 'closed' },
    );
    if (saved !== null) reportAnswered(id, ticketOf(saved), ended);
    return saved;
  }

  /** Ends a session with a problem: Stopped, every step done, and the terminal told the kind. */
  async function fail(id: string, kind: ProblemKind, code: string | null) {
    const run = runs.get(id);
    if (run?.stopping === true) return;
    runs.delete(id);
    const saved = await changeEnding(
      id,
      (record) => {
        const ended = withProgress(record, (progress) => endProgress(progress, null));
        return {
          ...ended,
          session: {
            ...ended.session,
            state: 'stopped',
            problem: { kind, stage: claudeWorked(record.session) ? 'working' : 'starting' },
            endedAt: record.session.endedAt ?? new Date(now()).toISOString(),
            ...endRun(record.session, now()),
          },
        };
      },
      () => true,
      null,
      'dropped',
    );
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
            const at = now();
            return {
              ...next,
              session: {
                ...next.session,
                // Once the pull request is open, Claude finishing a follow-up leaves it open (spec 014, AC-19).
                state: next.session.pullRequest === null ? 'done' : 'pr_open',
                endedAt: new Date(at).toISOString(),
                ...endRun(next.session, at),
              },
            };
          }),
        );
        return;
      }
      case 'approval': {
        const { approvalId, ask } = event;
        const text = ask.kind === 'command' ? ask.command : ask.path;
        track(
          change(id, (record) => {
            const at = new Date(now()).toISOString();
            const approval: SessionApproval = { id: approvalId, askedAt: at, ...ask };
            const waiting = withProgress(record, (progress) =>
              addWaiting(progress, {
                approvalId,
                about: ask.kind,
                text: ask.kind === 'command' ? ask.description : ask.path,
              }),
            );
            return {
              ...waiting,
              session: { ...waiting.session, state: 'needs_you', approvals: [...record.session.approvals, approval] },
              approvalLog: [
                ...record.approvalLog,
                { id: approvalId, about: ask.kind, text, askedAt: at, answer: null, by: null, answeredAt: null },
              ],
            };
          }).then((record) => {
            if (record !== null) {
              options.onReport?.({ what: 'asked', session: id, ticket: ticketOf(record), about: ask.kind });
            }
          }),
        );
        return;
      }
      case 'answered': {
        const answer = given.get(event.approvalId) ?? null;
        given.delete(event.approvalId);
        track(
          changeEnding(
            id,
            (record) => record,
            (approvalId) => approvalId === event.approvalId,
            answer,
            answer === null ? 'dropped' : 'you',
          ),
        );
        return;
      }
      case 'files_changed':
        filesChanged(id);
        return;
      case 'problem':
        track(fail(id, event.kind, event.code));
        return;
      case 'ended':
        // Claude Code ended without finishing or saying why.
        if (runs.get(id) === run) track(fail(id, 'other', 'ended'));
        return;
    }
  }

  /** Ship's start reads the ticket now, as the run's first step (spec 011); null when it failed or you stopped. */
  async function shipPlan(id: string, key: string, run: Run): Promise<StartPlan | null> {
    const credentials = await connection.credentials();
    if (credentials?.ok !== true) {
      await fail(id, 'jira', credentials === null ? 'not_connected' : credentials.problem.kind);
      return null;
    }
    const answer = await options.jira.issue(credentials.request, key);
    if (!answer.ok) {
      await fail(id, 'jira', answer.problem.kind);
      return null;
    }
    if (stopping(run)) return null;
    const { issue } = answer;
    await change(id, (current) => ({
      ...current,
      session: {
        ...current.session,
        title: issue.summary.trim() === '' ? current.session.title : issue.summary,
        // The Ticket tab shows the ticket as Claude got it (spec 013, Q7); its status and due date are read live.
        ticket: { type: issue.type, description: issue.description, status: null, dueDate: null },
      },
    }));
    return ticketPlan(issue);
  }

  async function run(id: string, run: Run): Promise<void> {
    const record = await records.get(id);
    if (record?.session.mode === 'ask') return runAsk(id, run, record);
    if (record?.worktree == null || record.repository === null) return;
    // A composer start read everything before its record was made (spec 015); Ship reads the ticket now.
    const planned = startPlans.get(id);
    startPlans.delete(id);
    const shipKey = record.session.source?.kind === 'jira' ? record.session.source.key : null;
    const start = planned ?? (shipKey === null ? null : await shipPlan(id, shipKey, run));
    if (start === null) return;
    const { signal } = run.controller;

    // Your pull request's own branch, fetched and detached; any other Build gets a branch of its own (spec 031).
    const pull = record.session.workOn === 'pull_request' ? record.session.pullRequest : null;
    const prepared =
      pull === null
        ? await worktrees.prepare(record.repository.path, start.branchName, signal)
        : {
            ok: true as const,
            plan: { branch: start.branchName, base: `origin/${start.branchName}`, remote: true, detach: true },
          };
    if (!prepared.ok) return worktreeFailure(id, prepared.problem);
    const { plan } = prepared;
    const making = {
      kind: 'worktree',
      branch: plan.branch,
      base: plan.base,
      fetched: false,
      ...(pull === null ? {} : { pullRequest: pull.number }),
    } as const;
    const withStep = await change(id, (current) => {
      const next = withProgress(current, (progress) => addStep(progress, making, 'running'));
      return { ...next, session: { ...next.session, branch: plan.branch } };
    });
    const stepId = withStep?.session.activities.at(-1)?.id ?? '';
    const made = await worktrees.make(record.repository.path, record.worktree, plan, signal);
    await change(id, (current) => ({
      ...withProgress(current, (progress) =>
        replaceStep(progress, stepId, { ...making, fetched: made.ok && made.fetched }),
      ),
      startCommit: made.ok ? made.startCommit : current.startCommit,
    }));
    if (!made.ok) return worktreeFailure(id, made.problem);
    if (stopping(run)) return;

    await records.writeBrief(id, briefText(start.brief));
    await change(id, (current) =>
      withProgress(current, (progress) => addStep(progress, { kind: 'brief', ...start.briefStep })),
    );
    if (stopping(run)) return;

    await startClaude(id, run, start.brief, record.worktree, plan.branch, null, start.ticketNote, start.choice);
  }

  /**
   * An Ask session's run (spec 026): no worktree and no branch. Claude reads the repository folder where it is,
   * or, with no folder (spec 031), an empty one of its own; the read-only permissions refuse every edit and command.
   */
  async function runAsk(id: string, run: Run, record: StoredSession): Promise<void> {
    const start = startPlans.get(id);
    startPlans.delete(id);
    const place = askPlace(record);
    if (start === undefined || place === null) return;
    if (record.repository === null) await mkdir(place, { recursive: true });
    await records.writeBrief(id, briefText(start.brief));
    await change(id, (current) =>
      withProgress(current, (progress) => addStep(progress, { kind: 'brief', ...start.briefStep })),
    );
    if (stopping(run)) return;
    await startClaude(id, run, start.brief, place, null, null, start.ticketNote, start.choice);
  }

  /**
   * Starts Claude for a run, with the brief or, resuming its own session, your follow-up, and follows it. `worktree`
   * is Claude's folder: the session's worktree, or an Ask session's repository folder, which has no branch.
   */
  async function startClaude(
    id: string,
    run: Run,
    brief: AgentBrief,
    worktree: string,
    branch: string | null,
    resume: string | null,
    ticketNote: boolean,
    /** The model and effort you picked for this run; left out, Claude Code's own default. */
    { model, effort }: AgentChoice = {},
  ): Promise<void> {
    if (adapter === null) return fail(id, 'other', 'no_claude_code');
    // Settings are read before Claude starts, and again for each call it makes (spec 012, AC-11).
    const permissions = async () => {
      const [{ permissions: rows, allowedCommands }, current] = await Promise.all([
        options.preferences.read(),
        records.get(id),
      ]);
      // The files and folders the brief named, which Claude may read on this run and every follow-up (spec 022);
      // the branch, the only one a push may name (spec 026). An Ask session reads only, whatever the rows say; a
      // record that's gone reads only too.
      return {
        ...rows,
        allowedCommands,
        branch,
        reads: current?.reads ?? noReads,
        readOnly: current?.session.mode !== 'build',
      };
    };
    const first = await permissions();
    // Stop can come while they're read: then Claude never starts.
    if (stopping(run)) return;
    const record = await records.get(id);
    const pull = record?.session.workOn === 'pull_request' ? (record.session.pullRequest?.number ?? null) : null;
    const note =
      branch === null
        ? askNote(record?.repository != null)
        : sessionNote(branch, adapter.runsCommands, ticketNote, first, pull);
    const agentId = await adapter.startSession(brief, worktree, permissions, note, {
      ...(resume === null ? {} : { resume }),
      model,
      effort,
    });
    run.agentId = agentId;
    // Or while Claude starts, after Stop found no Claude to stop: then the run stops it itself.
    if (stopping(run)) {
      await adapter.stop(agentId);
      return;
    }
    let ended: () => void = () => undefined;
    agentEnded.set(
      id,
      new Promise<void>((resolve) => {
        ended = resolve;
      }),
    );
    adapter.onEvent(agentId, (event) => {
      heard(id, run, event);
      if (event.type === 'ended') ended();
    });
    run.markStarted(agentId);
  }

  /**
   * Ends a working session with `last` (you stopped it, or Orynx closed): git and Claude are stopped first,
   * and nothing they say afterwards changes the session. A call still waiting ends `by` it (spec 012).
   */
  function halt(id: string, last: NewStep, by: Exclude<ApprovalEnd, 'you' | 'dropped'>): Promise<void> {
    return whileEnding(id, haltNow(id, last, by));
  }

  /** Keeps `work` among this session's stops and discards under way until it's done: a discard holds a stop. */
  async function whileEnding<T>(id: string, work: Promise<T>): Promise<T> {
    const kept = work.catch(() => undefined);
    const under = ending.get(id) ?? new Set<Promise<unknown>>();
    under.add(kept);
    ending.set(id, under);
    try {
      return await work;
    } finally {
      under.delete(kept);
      if (under.size === 0 && ending.get(id) === under) ending.delete(id);
    }
  }

  async function haltNow(id: string, last: NewStep, by: Exclude<ApprovalEnd, 'you' | 'dropped'>): Promise<void> {
    const run = runs.get(id);
    if (run !== undefined) {
      run.stopping = true;
      runs.delete(id);
      run.controller.abort();
      if (run.agentId !== null && adapter !== null) await adapter.stop(run.agentId);
    }
    await changeEnding(
      id,
      (record) => {
        if (!isWorking(record.session)) return record;
        const ended = withProgress(record, (progress) => endProgress(progress, last));
        return {
          ...ended,
          session: {
            ...ended.session,
            state: 'stopped',
            endedAt: record.session.endedAt ?? new Date(now()).toISOString(),
            ...endRun(record.session, now()),
          },
        };
      },
      () => true,
      null,
      by,
    );
  }

  function begin(id: string) {
    const started = newRun();
    runs.set(id, started);
    track(
      run(id, started)
        .catch(() => fail(id, 'other', 'unexpected'))
        .finally(() => {
          started.markStarted(null);
        }),
    );
  }

  /**
   * Into the running Claude when it can take it, else resuming Claude Code's own session (spec 013, Q1). Chips
   * added to the follow-up are read first, as the composer's are at start, and one that fails sends nothing
   * (spec 025); the rest join what the session was sent, and their files what Claude may read.
   */
  async function sendNow(
    id: string,
    text: string,
    context: readonly ComposerChip[],
    choice: AgentChoice,
  ): Promise<SendResult> {
    const record = await records.get(id);
    if (record === null) return { result: 'not_found' };
    const read = context.length === 0 ? null : await options.context.read(context);
    if (read?.ok === false) return { result: 'context_failed', chip: read.chip, problem: read.problem };
    const brief = composerBrief(text, read?.chips ?? []);
    const withContext = (current: StoredSession): StoredSession =>
      read === null
        ? current
        : {
            ...current,
            session: { ...current.session, context: contextAfter(current.session, context) },
            reads: readsAfter(current.reads ?? noReads, read.chips),
          };
    const live = runs.get(id);
    if (live !== undefined && !live.stopping) {
      // Claude may still be setting up: the message waits for it to start.
      const agentId = live.agentId ?? (await live.started);
      // Saved before it goes, so Claude may read the new files as soon as it reads the message.
      if (read !== null) await change(id, withContext);
      if (
        agentId !== null &&
        adapter !== null &&
        !stopping(live) &&
        (await adapter.sendMessage(agentId, briefText(brief)))
      ) {
        await change(id, (current) =>
          withProgress(current, (progress) => addStep(progress, { kind: 'message', text })),
        );
        options.onReport?.({ what: 'followed_up', session: id, ticket: ticketOf(record), resumed: false });
        return { result: 'sent' };
      }
    }
    // Not working, or it finished as you sent this: once a stop and the last Claude Code have ended, carry on.
    await Promise.all([...(ending.get(id) ?? [])]);
    await agentEnded.get(id);
    // A running Claude keeps its model; the one you picked starts with the next run.
    return resume(id, text, brief, withContext, choice);
  }

  async function resume(
    id: string,
    text: string,
    brief: AgentBrief,
    withContext: (current: StoredSession) => StoredSession,
    choice: AgentChoice,
  ): Promise<SendResult> {
    const record = await records.get(id);
    if (record === null) return { result: 'not_found' };
    const { session } = record;
    const cannot = (reason: Extract<SendMessageAnswer, { result: 'cannot_send' }>['reason']): SendResult => ({
      result: 'cannot_send',
      reason,
    });
    if (session.discardedAt !== null) return cannot('discarded');
    const { claudeSessionId } = record;
    const { branch } = session;
    // An Ask session carries on in its repository folder, with no branch (spec 026).
    const ask = session.mode === 'ask';
    const folder = ask ? askPlace(record) : record.worktree;
    if (claudeSessionId === null || folder === null || (!ask && branch === null) || adapter === null) {
      return cannot('never_started');
    }
    const key = ticketOf(record);
    const live = ask ? null : await liveSessionOn(key);
    if (live !== null && live !== id) return cannot('newer_session');
    if ((await workingCount()) >= mostWorking) return cannot('too_many');

    const run = newRun();
    runs.set(id, run);
    const at = new Date(now()).toISOString();
    await change(id, (current) => {
      const next = withProgress(withContext(current), (progress) =>
        addStep(resumeProgress(progress), { kind: 'message', text }),
      );
      return {
        ...next,
        session: { ...next.session, state: 'working', problem: null, endedAt: null, runStartedAt: at },
      };
    });
    options.onReport?.({ what: 'followed_up', session: id, ticket: key, resumed: true });
    track(
      startClaude(id, run, brief, folder, branch, claudeSessionId, ticketNote(session), choice)
        .catch(() => fail(id, 'other', 'unexpected'))
        .finally(() => {
          run.markStarted(null);
        }),
    );
    return { result: 'sent' };
  }
  /** One start at a time per ticket, so two tabs pressing Build start one session. */
  const starting = new Map<string, Promise<unknown>>();
  /** A composer start's plan, from its record being made until its run takes it (spec 015). */
  const startPlans = new Map<string, StartPlan>();

  /** The newest live Build that `holds` matches: an Ask session reads only, so it never holds anything (spec 026). */
  async function newestLive(holds: (session: ListedSession) => boolean): Promise<string | null> {
    const live = (await records.list()).filter(
      (session) => holds(session) && isLive(session) && session.mode !== 'ask',
    );
    live.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return live[0]?.id ?? null;
  }

  function liveSessionOn(key: string): Promise<string | null> {
    return newestLive((session) => session.source?.kind === 'jira' && session.source.key === key);
  }

  /** A pull request's own branch holds one live session at a time, as a ticket does (spec 031, AC-18). */
  function liveSessionOnPull(key: string): Promise<string | null> {
    return newestLive((session) => session.pullRequest === key);
  }

  /** The folder's origin on GitHub as `owner/name`, or null. */
  async function originOf(folder: string): Promise<string | null> {
    const origin = await branchGit.origin(folder);
    return origin.ok ? origin.repository : null;
  }

  /** Whether the follow-up box takes a message, or why not (spec 013, AC-14). */
  async function followUpOf(record: StoredSession): Promise<SessionFollowUp> {
    const { session } = record;
    if (session.discardedAt !== null) return { kind: 'discarded' };
    if (record.claudeSessionId === null && !isWorking(session)) return { kind: 'never_started' };
    if (session.source?.kind === 'jira' && session.mode !== 'ask') {
      const live = await liveSessionOn(session.source.key);
      if (live !== null && live !== session.id) return { kind: 'newer_session', sessionId: live };
    }
    return { kind: 'open' };
  }

  async function workingCount(): Promise<number> {
    return (await records.list()).filter((session) => session.state === 'working' || session.state === 'needs_you')
      .length;
  }

  async function jiraLink(key: string): Promise<string | null> {
    const credentials = await connection.credentials();
    return credentials === null ? null : `https://${credentials.site}/browse/${key}`;
  }

  async function startNow({ ticketKey, repositoryId }: TicketStart): Promise<StartSessionAnswer> {
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
        ticket: null,
        followUp: { kind: 'open' },
        worktreePath: null,
        workedMs: 0,
        runStartedAt: at,
        pullRequest: null,
        context: [{ kind: 'jira', key: ticketKey }],
        mode: 'build',
        workOn: 'new_branch',
        skipped: [],
      },
      repository: { id: folder.id, path: folder.path },
      worktree: join(options.worktrees.root, id),
      startCommit: null,
      claudeSessionId: null,
      pushedCommit: null,
      approvalLog: [],
    };
    await records.create(record);
    events.publish({ type: 'sessions.changed' });
    begin(id);
    return { result: 'started', sessionId: id };
  }

  /**
   * The composer's start (spec 015). Every answer that makes nothing comes first (Q9, AC-22): a live session on
   * the ticket, signed out, three working, the folder (Q7), then the chips as Jira and GitHub give them (AC-21).
   * Only then is the record made, with the brief its run starts from (AC-4, AC-20).
   */
  async function composeNow(request: ComposerStart): Promise<StartSessionAnswer> {
    const key = ticketKeyOf(request);
    const ask = request.mode === 'ask';
    // A ticket's live session stops a Build on it; an Ask only reads, so it starts beside one (spec 026).
    if (key !== null && !ask) {
      const live = await liveSessionOn(key);
      if (live !== null) return { result: 'existing', sessionId: live };
    }
    if (!(await claude.connected())) return { result: 'cannot_start', reason: 'signed_out' };
    if ((await workingCount()) >= mostWorking) return { result: 'cannot_start', reason: 'too_many' };
    // An Ask sent with no folder reads none (spec 031); a Build always has one.
    const folder = ask && request.repositoryId === undefined ? null : chooseFolder(await repositories.list(), request);
    if (typeof folder === 'string') return { result: 'cannot_start', reason: folder };

    const read = await options.context.read(request.context);
    if (!read.ok) return { result: 'context_failed', chip: read.chip, problem: read.problem };
    // A Build on your own pull request works on its branch (spec 031, Q3), one session at a time.
    const pull = ask || folder === null ? null : pullToWorkOn(read.chips, await originOf(folder.path));
    if (pull !== null) {
      const live = await liveSessionOnPull(pullKey(`${pull.owner}/${pull.name}`, pull.number));
      if (live !== null) return { result: 'existing', sessionId: live };
    }
    // The skills your message names, for this folder (spec 022, AC-53); none without the service.
    const skills = (await options.skills?.named(request.message, folder?.path ?? null)) ?? [];
    const { title, ticket, plan } = composerPlan(request.message, read.chips, skills);

    const id = newId();
    const at = new Date(now()).toISOString();
    const known = ticket === null ? null : await describeTicket(ticket.key);
    const record: StoredSession = {
      session: {
        id,
        title,
        state: 'working',
        source:
          pull !== null
            ? { kind: 'pull_request', number: pull.number }
            : ticket === null
              ? null
              : { kind: 'jira', key: ticket.key },
        updatedAt: at,
        folder: folder === null ? null : { name: folder.name, displayPath: folder.displayPath },
        branch: null,
        step: 'plan',
        activities: [],
        problem: null,
        startedAt: at,
        endedAt: null,
        discardedAt: null,
        jiraUrl: ticket === null ? null : await jiraLink(ticket.key),
        sprint: known?.sprint ?? null,
        approvals: [],
        ticket:
          ticket === null ? null : { type: ticket.type, description: ticket.description, status: null, dueDate: null },
        followUp: { kind: 'open' },
        worktreePath: null,
        workedMs: 0,
        runStartedAt: at,
        pullRequest:
          pull === null
            ? null
            : { number: pull.number, url: pull.url, repository: `${pull.owner}/${pull.name}`, openedAt: pull.openedAt },
        context: [...request.context],
        mode: ask ? 'ask' : 'build',
        workOn: pull === null ? 'new_branch' : 'pull_request',
        skipped: [],
      },
      repository: folder === null ? null : { id: folder.id, path: folder.path },
      // An Ask session makes no worktree: Claude reads the folder itself (spec 026), or an empty one (spec 031).
      worktree: ask && folder !== null ? null : join(options.worktrees.root, id),
      startCommit: null,
      pushedCommit: null,
      claudeSessionId: null,
      approvalLog: [],
      reads: { files: [...plan.reads.files], folders: [...plan.reads.folders] },
    };
    startPlans.set(id, {
      ...plan,
      ...(pull === null ? {} : { branchName: pull.head }),
      choice: { model: request.model, effort: request.effort },
    });
    await records.create(record);
    events.publish({ type: 'sessions.changed' });
    begin(id);
    return { result: 'started', sessionId: id };
  }

  /** Stops the session if it's working, then deletes its worktree and branch (AC-10). */
  async function discardNow(id: string): Promise<'discarded' | 'not_found' | 'failed'> {
    // A push under way finishes first, so git never pushes from a worktree that's being deleted (spec 014).
    await publishing.get(id);
    const found = await records.get(id);
    if (found === null) return 'not_found';
    if (found.session.discardedAt !== null) return 'discarded';
    if (isWorking(found.session)) await halt(id, { kind: 'stopped' }, 'discarded');
    const record = (await records.get(id)) ?? found;
    const { branch } = record.session;
    // Your pull request's branch isn't the session's to delete: only its worktree goes (spec 031).
    const kept = record.session.workOn === 'pull_request';
    // An Ask with no folder has only its empty folder, which nothing reads once it's discarded.
    if (record.worktree !== null && record.repository !== null) {
      const removed = await worktrees.remove(record.repository.path, record.worktree, kept ? null : branch);
      if (!removed.ok) {
        report(record, 'git', 'remove');
        return 'failed';
      }
    }
    await change(id, (current) => {
      const ended =
        branch === null
          ? current
          : withProgress(current, (progress) => endProgress(progress, { kind: 'discarded', branch, kept }));
      return {
        ...ended,
        session: { ...ended.session, state: 'stopped', discardedAt: new Date(now()).toISOString() },
      };
    });
    // A stopped session's state doesn't change, so only this tells its Changes tab the files are gone (AC-6).
    filesChanged(id);
    return 'discarded';
  }

  const branchGit = createBranchGit({ env: options.worktrees.env });
  const pullRequests = createPullRequests({
    records,
    save: change,
    now,
    onReport: (report) => options.onReport?.(report),
    github: options.github ?? { credentials: () => Promise.resolve(null) },
    client: options.githubClient ?? createGitHubClient(),
    git: branchGit,
    changes: options.changes,
    adapter,
  });
  /** Each session's create or push under way, which Discard and closing wait for. */
  const publishing = new Map<string, Promise<unknown>>();
  function whilePublishing<T>(id: string, work: Promise<T>): Promise<T> {
    const all = Promise.all([publishing.get(id), work.catch(() => undefined)]);
    publishing.set(id, all);
    track(
      all.finally(() => {
        if (publishing.get(id) === all) publishing.delete(id);
      }),
    );
    return work;
  }

  return {
    draftPullRequest: (id) => pullRequests.draft(id),
    createPullRequest: (id, request) => whilePublishing(id, pullRequests.create(id, request)),
    draftPush: (id) => pullRequests.draftPush(id),
    push: (id, request) => whilePublishing(id, pullRequests.push(id, request)),

    start(request) {
      // Starts on one ticket go one at a time, from Ship or the composer; so do composer starts with no ticket.
      const key = 'ticketKey' in request ? request.ticketKey : (ticketKeyOf(request) ?? 'composer');
      const waiting = starting.get(key);
      const turn = (waiting ?? Promise.resolve()).then(() =>
        'ticketKey' in request ? startNow(request) : composeNow(request),
      );
      starting.set(
        key,
        turn.catch(() => undefined),
      );
      return turn;
    },

    async get(id) {
      const record = await records.get(id);
      if (record === null) return null;
      const { session } = record;
      const key = session.source?.kind === 'jira' ? session.source.key : null;
      const [saved, known, followUp] = await Promise.all([
        // A session saved before spec 013 kept only its brief.
        session.ticket ?? records.readBrief(id).then((brief) => (brief === null ? null : ticketFromBrief(brief))),
        key === null ? null : describeTicket(key),
        followUpOf(record),
      ]);
      const ticket: SessionTicket | null =
        saved === null ? null : { ...saved, status: known?.status ?? null, dueDate: known?.dueDate ?? null };
      // There's a worktree to open from when it's made until the changes are discarded (spec 013, Q9).
      const made = session.branch !== null && session.discardedAt === null;
      return { ...session, ticket, followUp, worktreePath: made ? record.worktree : null };
    },

    async stop(id) {
      const record = await records.get(id);
      if (record === null) return 'not_found';
      if (isWorking(record.session)) await halt(id, { kind: 'stopped' }, 'stopped');
      return 'stopped';
    },

    discard(id) {
      return whileEnding(id, discardNow(id));
    },

    async changes(id) {
      const record = await records.get(id);
      if (record === null) return null;
      if (record.session.discardedAt !== null) return { state: 'discarded' };
      const start = startPointOf(record);
      if (start === null || record.worktree === null) return { state: 'no_worktree' };
      const listed = await options.changes.list(record.worktree, start, editOrder(record.session));
      if (listed.ok) return listed.changes;
      return listed.problem === 'missing' ? { state: 'missing' } : 'unreadable';
    },

    async fileDiff(id, path) {
      const record = await records.get(id);
      if (record?.session.discardedAt !== null) return null;
      const start = startPointOf(record);
      if (start === null || record.worktree === null) return null;
      const read = await options.changes.fileDiff(record.worktree, start, path);
      if (read.ok) return read.diff;
      return read.problem === 'git' ? 'unreadable' : null;
    },

    async brief(id) {
      if ((await records.get(id)) === null) return null;
      return { text: await records.readBrief(id) };
    },

    send(id, text, context = [], choice = {}) {
      const turn = (sending.get(id) ?? Promise.resolve()).then(() => sendNow(id, text, context, choice));
      sending.set(
        id,
        turn.catch(() => undefined),
      );
      return turn;
    },
    async respond(id, approvalId, decision) {
      const record = await records.get(id);
      if (record === null) return 'not_found';
      const waiting = record.session.approvals.find((approval) => approval.id === approvalId);
      if (waiting === undefined) {
        return record.approvalLog.some((entry) => entry.id === approvalId) ? 'already_answered' : 'not_found';
      }
      const run = runs.get(id);
      if (run?.agentId == null || adapter === null || claimed.has(approvalId)) return 'already_answered';
      const entry = waiting.kind === 'command' ? waiting.alwaysAllow : null;
      if (decision === 'always_allow' && entry === null) return 'not_offered';
      // The first answer counts (AC-13): from here, before anything waits, any other answer to this call is late.
      claimed.add(approvalId);
      if (decision === 'always_allow' && entry !== null) {
        // The entry is saved first: if it can't be, nothing is decided and the call keeps waiting (AC-14).
        try {
          await options.preferences.change({ allowCommand: entry });
        } catch {
          claimed.delete(approvalId);
          return 'not_saved';
        }
      }
      given.set(approvalId, decision);
      const answered = await adapter.respond(
        run.agentId,
        approvalId,
        decision === 'deny' ? 'deny' : decision === 'always_allow' ? 'always' : 'allow',
      );
      if (!answered) {
        given.delete(approvalId);
        return 'already_answered';
      }
      return 'answered';
    },

    async close() {
      // A session still working when Orynx closes was closed, not stopped by you (AC-14).
      await Promise.all([...runs.keys()].map((id) => halt(id, { kind: 'interrupted' }, 'closed')));
      while (inFlight.size > 0) await Promise.all(inFlight);
      for (const { timer } of stepTimers.values()) clearTimeout(timer);
      stepTimers.clear();
      for (const { timer } of fileTimers.values()) clearTimeout(timer);
      fileTimers.clear();
    },
  };
}
