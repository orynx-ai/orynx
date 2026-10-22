import { randomBytes } from 'node:crypto';
import { mkdir, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { isOrynxKey, permissionsFor } from '@devhub/contracts';
import type { OrynxTicketService } from '../orynx-tickets/ticket-service.ts';
import { ticketTools } from '../orynx-tickets/tools.ts';
import type {
  ClaudeCommandList,
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
  SessionChangeRequest,
  SessionChanges,
  SessionFollowUp,
  SessionPort,
  PortActionAnswer,
  SessionStep,
  SessionStepItem,
  SessionTicket,
  StartSessionAnswer,
  StartSessionRequest,
  ComposerStart,
  TicketStart,
} from '@devhub/contracts';
import {
  askText,
  type AgentAdapter,
  type AgentAsk,
  type AgentBrief,
  type AgentEvent,
} from '../agents/agent-adapter.ts';
import type { EventBus } from '../events/event-bus.ts';
import { createGitHubClient, type GitHubClient } from '../integrations/github/client.ts';
import type { GitHubSyncCredentials } from '../integrations/github/connection.ts';
import type { JiraCheckRequest, JiraClient } from '../integrations/jira/client.ts';
import type { JiraSyncCredentials } from '../integrations/jira/connection.ts';
import { createBranchGit } from './branch-git.ts';
import { askNote, briefText, composerBrief, sessionNote, ticketFromBrief } from './brief.ts';
import { sessionStartPoint, type ChangesReader, type StartPoint } from './changes.ts';
import { logEnd, logRunEnded, logWork } from './command-log.ts';
import { terminalWorktree, type TerminalService } from '../terminal/terminal-service.ts';
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
  addServerStep,
  addStep,
  addWaiting,
  addWork,
  changeSteps,
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
  readyFor,
  type ApprovalRecord,
  type ListedSession,
  type SessionRecords,
  type StoredSession,
} from './session-store.ts';
import { createWorktrees, type Prepared, type WorktreeProblem, type WorktreesOptions } from './worktrees.ts';
import { readingFrom, readingInstructions, readingPrompt, type AskInput, type AskReading } from './ask-reading.ts';
import { readBranchRules } from './branch-rules.ts';
import { jiraTools, type JiraStep } from './jira-tools.ts';
import { sessionTools } from './session-tools.ts';
import type { PortService, SessionPlaces } from '../ports/port-service.ts';

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
  | { what: 'asked'; session: string; ticket: string; about: AgentAsk['kind'] }
  | {
      what: 'answered';
      session: string;
      ticket: string;
      about: AgentAsk['kind'];
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
  /** What listens from the session (spec 042): none for an Ask or a gone worktree; null when it couldn't be read. */
  ports(id: string): Promise<SessionPort[] | null | 'not_found'>;
  /** Stops what listens on `port` from the session, checked again now, with a row (spec 042). */
  stopPort(id: string, port: number): Promise<PortActionAnswer['result'] | 'not_found'>;
  /** Runs a server Claude started again in its tab (spec 042); one started any other way can't be. */
  restartPort(id: string, port: number): Promise<PortActionAnswer['result'] | 'not_found'>;
  /** Ship's start on a ticket, or the composer's with your message and its chips (spec 015). */
  start(request: StartSessionRequest): Promise<StartSessionAnswer>;
  /** The session as the Session screen shows it; null when there's none with this id. */
  get(id: string): Promise<Session | null>;
  /** Stop Claude (AC-9). A session that isn't working stays as it is. */
  stop(id: string): Promise<'stopped' | 'not_found'>;
  /** Stops the session if it's working, then deletes its worktree and branch (AC-10). */
  discard(id: string): Promise<'discarded' | 'not_found' | 'failed'>;
  /** A new title or a pin (spec 039). Neither moves the session's activity time. */
  edit(id: string, change: SessionChangeRequest): Promise<'changed' | 'not_found'>;
  /**
   * Deletes the session, its brief and its worktree, keeping its branch (spec 039, Q1). Refused while Claude works:
   * Stop comes first.
   */
  remove(
    id: string,
    options?: { branch?: boolean | undefined },
  ): Promise<'deleted' | 'not_found' | 'working' | 'failed'>;
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
  /** Every command Claude ran, with its output, for the Terminal's Claude tab (spec 036); null for no such session. */
  commands(id: string): Promise<ClaudeCommandList | null>;
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
    read(): Promise<{
      permissions: Permissions;
      repositoryPermissions: Record<string, Permissions>;
      allowedCommands: readonly string[];
    }>;
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
  /** Orynx's own tickets, whose tools every session's agent gets (spec 037); left out, it gets none. */
  tickets?: OrynxTicketService;
  /** Your shell tabs (spec 036). Left out where there are none (Windows): then no session offers its Terminal. */
  terminal?: Pick<TerminalService, 'stopAll' | 'read' | 'addServerTab' | 'shells' | 'lastLines' | 'restart'>;
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
  /** Read each Build's ask before its worktree (spec 042); the server does, and so do the tests of it. */
  readAsks?: boolean;
  /** What listens from each session (spec 042); none on a computer with no Terminal. */
  ports?: PortService;
  /** How long a server Claude starts may take to listen before Claude gets its last lines instead; 60 seconds. */
  serverWaitMs?: number;
}

/** At most this many sessions work at once (Q11). */
const mostWorking = 3;
/** How long the quick read may take before the session starts as it would without it (spec 042, Q1). */
const readTimeoutMs = 30_000;

/** The quick read's row before it has read anything, and as it stays when the read fails (spec 042). */
const unread = {
  kind: 'reading',
  intent: null,
  base: null,
  missingBase: null,
  branch: null,
  branchFrom: null,
  suggested: null,
  branchNote: null,
} as const;

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
/** Whether Orynx made the session's worktree: since spec 042 it may have no branch until Claude's first edit. */
function worktreeMade(record: StoredSession): boolean {
  return record.worktree !== null && (record.startCommit !== null || record.session.branch !== null);
}

function startPointOf(record: StoredSession): StartPoint | null {
  const { session } = record;
  if (!worktreeMade(record)) return null;
  // git couldn't make the worktree, so there's none to read.
  if (session.problem?.kind === 'git' && session.problem.stage === 'starting') return null;
  const made = session.activities.find((activity) => activity.kind === 'worktree');
  return sessionStartPoint(record.startCommit, made?.kind === 'worktree' ? made.base : null, session.branch);
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
  return { step: session.step, activities: session.activities, skipped: session.skipped, steps: session.steps };
}

function withProgress(record: StoredSession, change: (progress: Progress) => Progress): StoredSession {
  const { step, activities, skipped = [], steps = [] } = change(progressOf(record.session));
  const session = { ...record.session, step, activities: [...activities], skipped: [...skipped], steps: [...steps] };
  return { ...record, session };
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
          commandLog: logRunEnded(record.commandLog),
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
            const next = {
              ...withProgress(record, (progress) => addWork(progress, event.work)),
              commandLog: logWork(record.commandLog, event.work),
            };
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
              commandLog: logRunEnded(next.commandLog),
            };
          }),
        );
        return;
      }
      case 'approval': {
        const { approvalId, ask } = event;
        const text = askText(ask);
        track(
          change(id, (record) => {
            const at = new Date(now()).toISOString();
            const approval: SessionApproval = { id: approvalId, askedAt: at, ...ask };
            const waiting = withProgress(record, (progress) =>
              addWaiting(progress, {
                approvalId,
                about: ask.kind,
                // Claude's line about a command; the edit's path; the ticket's key and title (spec 037).
                text:
                  ask.kind === 'command'
                    ? ask.description
                    : ask.kind === 'edit'
                      ? ask.path
                      : ask.kind === 'server'
                        ? ask.command
                        : `${ask.key}${ask.title === null ? '' : ` · ${ask.title}`}`,
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
      case 'command_ended':
        track(change(id, (record) => ({ ...record, commandLog: logEnd(record.commandLog, event) })));
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
        ticket: { type: issue.type, description: issue.description, status: null, dueDate: null, deleted: false },
      },
    }));
    return ticketPlan(issue);
  }

  /** Claude's `set_steps` (spec 042): null once the stepper took the change, or why it didn't. */
  async function applySteps(
    id: string,
    wanted: { steps: SessionStepItem[]; current: SessionStep; reason: string },
  ): Promise<string | null> {
    let refused: string | null = 'This session is gone.';
    await change(id, (current) => {
      const changed = changeSteps(progressOf(current.session), wanted);
      refused = changed.ok ? null : changed.reason;
      return changed.ok ? withProgress(current, () => changed.progress) : current;
    });
    return refused;
  }

  /** Jira's saved login for a call from a session (spec 044); null once Jira isn't connected or its token can't be read. */
  async function jiraRequest(): Promise<JiraCheckRequest | null> {
    const credentials = await options.connection.credentials().catch(() => null);
    return credentials?.ok === true ? credentials.request : null;
  }

  /** A Jira tool's step in Claude's progress (spec 044), as a server's is. */
  async function addJiraStep(id: string, step: JiraStep): Promise<void> {
    const jira = { kind: 'jira', key: null, summary: null, found: null, more: false, to: null, ...step } as const;
    await change(id, (current) => withProgress(current, (progress) => addStep(progress, jira)));
  }

  /**
   * What you're asked before Claude starts a server (spec 042, Q7): always, unless you chose Always allow in this
   * repository, which the allow list keeps as `server:<repository id>`.
   */
  async function serverAsk(id: string, command: string, folder: string): Promise<AgentAsk | null> {
    const record = await records.get(id);
    const entry = `server:${record?.repository?.id ?? id}`;
    const { allowedCommands } = await options.preferences.read();
    return allowedCommands.includes(entry) ? null : { kind: 'server', command, folder, alwaysAllow: entry };
  }

  /**
   * Starts a server Claude asked for in a Terminal tab of its own, in the worktree or a folder inside it, and waits for
   * a port to listen from that tab (spec 042): then a row, and the stepper at Run.
   */
  async function startServer(
    id: string,
    command: string,
    folder: string,
  ): Promise<{ port: number; url: string | null } | { lines: string[] } | { refused: string }> {
    const record = await records.get(id);
    const { terminal, ports } = options;
    if (record === null || terminal === undefined || ports === undefined) {
      return { refused: "Servers can't start on this computer." };
    }
    const worktree = terminalWorktree(record);
    if (worktree === null || !worktreeMade(record)) return { refused: 'This session has no worktree to start it in.' };
    const place = resolve(worktree, folder);
    if (place !== worktree && !place.startsWith(worktree + sep)) {
      return { refused: 'A server starts in the worktree or a folder inside it.' };
    }
    terminal.read(id, worktree);
    const added = terminal.addServerTab(id, place, command);
    if (added.result !== 'added') {
      return { refused: 'This session has all its Terminal tabs open. Ask the user to close one.' };
    }
    const shell = terminal.shells(id).find((one) => one.tabId === added.tabId);
    const until = now() + (options.serverWaitMs ?? 60_000);
    let listening: SessionPort | undefined;
    while (shell !== undefined && listening === undefined && now() < until) {
      listening = (await ports.list({ worktree, shells: [shell] }))?.find((one) => one.startedBy === 'claude');
      if (listening === undefined) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const port = listening?.port ?? null;
    await change(id, (current) =>
      withProgress(current, (progress) => addServerStep(progress, { kind: 'server', event: 'started', port, command })),
    );
    if (listening === undefined) return { lines: terminal.lastLines(id, added.tabId, 40) };
    return { port: listening.port, url: listening.url };
  }

  /** Where the session's servers come from (spec 042): its worktree, as lsof writes paths, and its Terminal tabs. */
  async function placesOf(id: string, record: StoredSession): Promise<SessionPlaces | null> {
    const worktree = terminalWorktree(record);
    if (worktree === null || !worktreeMade(record)) return null;
    const real = await realpath(worktree).catch(() => null);
    return real === null ? null : { worktree: real, shells: options.terminal?.shells(id) ?? [] };
  }

  async function stopPortNow(id: string, port: number): Promise<PortActionAnswer['result'] | 'not_found'> {
    const record = await records.get(id);
    if (record === null) return 'not_found';
    const places = await placesOf(id, record);
    if (places === null || options.ports === undefined) return 'gone';
    const listed = (await options.ports.list(places))?.find((one) => one.port === port);
    if (listed === undefined || (await options.ports.stop(places, port)) === 'gone') return 'gone';
    await change(id, (current) =>
      withProgress(current, (progress) =>
        addServerStep(progress, { kind: 'server', event: 'stopped', port, command: listed.command }),
      ),
    );
    return 'done';
  }

  /** Stops every server of the session's (spec 042, AC-13): before its worktree goes, nothing runs from there. */
  async function stopServers(id: string, record: StoredSession): Promise<void> {
    const places = await placesOf(id, record);
    if (places === null || options.ports === undefined) return;
    for (const { port } of (await options.ports.list(places)) ?? []) await options.ports.stop(places, port);
  }

  /** Each session's branch while it's being made, so two edits at once make one (spec 042). */
  const branching = new Map<string, Promise<string | null>>();

  /**
   * Makes the session's branch at Claude's first edit (spec 042), with a row saying so; null once it's there or when
   * there's none to make. A branch git couldn't make refuses the edit, with words Claude can pass on.
   */
  function makeBranch(id: string): Promise<string | null> {
    const under = branching.get(id);
    if (under !== undefined) return under;
    const work = makeBranchNow(id).finally(() => branching.delete(id));
    branching.set(id, work);
    return work;
  }

  async function makeBranchNow(id: string): Promise<string | null> {
    const record = await records.get(id);
    const planned = record?.branchPlan ?? null;
    if (record === null || planned === null || record.session.branch !== null) return null;
    if (record.worktree === null || record.repository === null) return null;
    const made = await worktrees.makeBranch(record.repository.path, record.worktree, planned.name, planned.onOrigin);
    if (!made.ok) {
      report(record, 'git', 'branch');
      return "Orynx couldn't make this session's branch, so the edit wasn't made. Say so in your summary.";
    }
    await change(id, (current) => {
      const next = withProgress(current, (progress) =>
        addStep(progress, { kind: 'branch_made', branch: made.branch, from: planned.from }),
      );
      return { ...next, branchPlan: null, session: { ...next.session, branch: made.branch, branchFrom: planned.from } };
    });
    return null;
  }

  /**
   * The quick read (spec 042): a running row, one text-only call on the model you picked, then the row with what it
   * read, the session's intent, steps and, with no ticket or pull request, its title. Null when it couldn't read.
   */
  async function readAsk(id: string, record: StoredSession, start: StartPlan): Promise<AskReading | null> {
    if (adapter === null || record.repository === null) return null;
    const shown = await change(id, (current) =>
      withProgress(current, (progress) => addStep(progress, unread, 'running')),
    );
    const rowId = shown?.session.activities.at(-1)?.id ?? '';
    const repo = record.repository.path;
    const [hints, rules] = await Promise.all([worktrees.hints(repo), readBranchRules(repo)]);
    const input: AskInput = {
      message: start.brief.message,
      chips: start.brief.context.map((chip) => chip.title),
      folder: record.session.folder?.name ?? '',
      hints,
      rules,
      ticketKey: record.session.source?.kind === 'jira' ? record.session.source.key : null,
      workOn: record.session.workOn,
      fallbackBranch: `feat/${start.branchName}`,
    };
    const written = await adapter.write(readingPrompt(input), readingInstructions, {
      timeoutMs: readTimeoutMs,
      ...start.choice,
    });
    const reading = written.ok ? readingFrom(written.text, input) : null;
    await change(id, (current) => {
      const row =
        reading === null
          ? unread
          : {
              ...unread,
              intent: reading.intent,
              base: reading.base?.replace(/^origin\//, '') ?? null,
              missingBase: reading.missingBase,
              branch: reading.branch,
              branchFrom: reading.branchFrom,
              suggested: reading.suggested,
              branchNote: reading.branchNote,
            };
      const next = withProgress(current, (progress) => replaceStep(progress, rowId, row));
      if (reading === null) return next;
      const [first] = reading.steps;
      return {
        ...next,
        session: {
          ...next.session,
          // A ticket or pull request names the session; only a message alone takes the read's title.
          title: next.session.source === null ? reading.title : next.session.title,
          intent: reading.intent,
          steps: reading.steps,
          step: first?.kind ?? next.session.step,
        },
      };
    });
    return reading;
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

    const reading = options.readAsks === true ? await readAsk(id, record, start) : null;
    if (stopping(run)) return;

    /** Where the quick read said to start, when it named a branch on origin (spec 042). */
    const based = (named: Prepared): Prepared =>
      named.ok && reading?.base != null
        ? { ...named, plan: { ...named.plan, base: reading.base, remote: true } }
        : named;
    // Your pull request's own branch, fetched and detached; any other Build gets a branch of its own (spec 031), named
    // and based as the quick read said, when it could read your ask (spec 042).
    const pull = record.session.workOn === 'pull_request' ? record.session.pullRequest : null;
    const prepared =
      pull === null
        ? based(
            await worktrees.prepare(
              record.repository.path,
              reading?.branch ?? `feat/${start.branchName}`,
              signal,
              reading?.onOrigin === true,
            ),
          )
        : {
            ok: true as const,
            plan: { branch: start.branchName, base: `origin/${start.branchName}`, remote: true, detach: true },
          };
    if (!prepared.ok) return worktreeFailure(id, prepared.problem);
    const { plan } = prepared;
    const making = {
      kind: 'worktree',
      // Your pull request's own branch is there already; any other is made at Claude's first edit (spec 042).
      branch: pull === null ? null : plan.branch,
      base: plan.base,
      fetched: false,
      ...(pull === null ? {} : { pullRequest: pull.number }),
    } as const;
    const withStep = await change(id, (current) => {
      const next = withProgress(current, (progress) => addStep(progress, making, 'running'));
      if (pull !== null) return { ...next, session: { ...next.session, branch: plan.branch } };
      const branchPlan = {
        name: plan.branch,
        from: reading?.branchFrom ?? 'orynx',
        onOrigin: reading?.onOrigin ?? false,
      };
      // A name the quick read gave that another branch has already: the reading says so (spec 042, AC-19).
      const taken = reading !== null && reading.branchNote === null && plan.branch !== reading.branch;
      const shown = taken
        ? withProgress(next, (progress) => ({
            ...progress,
            activities: progress.activities.map((activity) =>
              activity.kind === 'reading'
                ? { ...activity, branch: plan.branch, suggested: reading.branch, branchNote: 'taken' as const }
                : activity,
            ),
          }))
        : next;
      return { ...shown, branchPlan };
    });
    const stepId = withStep?.session.activities.at(-1)?.id ?? '';
    const made = await worktrees.make(
      record.repository.path,
      record.worktree,
      pull === null ? { ...plan, detach: true } : plan,
      signal,
    );
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
      const [preferences, current] = await Promise.all([options.preferences.read(), records.get(id)]);
      // The files and folders the brief named, which Claude may read on this run and every follow-up (spec 022);
      // the branch, the only one a push may name (spec 026). An Ask session reads only, whatever the rows say; a
      // record that's gone reads only too.
      // The repository's own rows when it has them, else All repositories' (spec 041).
      return {
        ...permissionsFor(preferences, current?.repository?.id ?? null),
        allowedCommands: preferences.allowedCommands,
        branch,
        detached: current?.session.workOn === 'pull_request',
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
    // Orynx's ticket tools, made in this session's name; an Ask session gets the reading ones only (spec 037).
    const tools =
      options.tickets === undefined || record === null
        ? []
        : ticketTools(options.tickets, { kind: 'session', sessionId: id, title: record.session.title }).filter(
            (tool) => !first.readOnly || tool.access === 'read',
          );
    // Jira's tools while Jira is connected as this run starts, in a Build or an Ask alike (spec 044): a session that
    // began without Jira gets them on its next follow-up.
    const jira =
      (await jiraRequest()) === null
        ? []
        : jiraTools({ jira: options.jira, request: jiraRequest, did: (step) => addJiraStep(id, step) });
    const agentId = await adapter.startSession(brief, worktree, permissions, note, {
      ...(resume === null ? {} : { resume }),
      model,
      effort,
      tools,
      onEdit: () => makeBranch(id),
      // A Build's own tools (spec 042): Claude changes its steps; an Ask has none. Then Jira's (spec 044).
      orynxTools: [
        ...(first.readOnly
          ? []
          : sessionTools({
              changeSteps: (wanted) => applySteps(id, wanted),
              serverAsk: (command, folder) => serverAsk(id, command, folder),
              startServer: (command, folder) => startServer(id, command, folder),
              stopServer: async (port) => {
                // Only a server Claude started here: anything else is yours.
                const record = await records.get(id);
                const places = record === null ? null : await placesOf(id, record);
                const listed =
                  places === null ? undefined : (await options.ports?.list(places))?.find((one) => one.port === port);
                if (listed?.startedBy !== 'claude') return false;
                return (await stopPortNow(id, port)) === 'done';
              },
            })),
        ...jira,
      ],
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
          commandLog: logRunEnded(record.commandLog),
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
    if (claudeSessionId === null || folder === null || (!ask && !worktreeMade(record)) || adapter === null) {
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
      // A Build's branch may still be to make, at its first edit (spec 042).
      startClaude(
        id,
        run,
        brief,
        folder,
        ask ? null : (branch ?? record.branchPlan?.name ?? null),
        claudeSessionId,
        ticketNote(session),
        choice,
      )
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
    // One of Orynx's own tickets has no page on a Jira site (spec 037).
    if (isOrynxKey(key)) return null;
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
        ready: 'nothing',
        pinnedAt: null,
        source: { kind: 'jira', key: ticketKey },
        updatedAt: at,
        folder: { name: folder.name, displayPath: folder.displayPath },
        branch: null,
        step: 'plan',
        steps: [],
        intent: null,
        branchFrom: null,
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
        // `get()` says whether the Terminal opens (spec 036) and what's left to push, so what is saved here never counts.
        terminal: false,
        unpushed: true,
      },
      repository: { id: folder.id, path: folder.path },
      worktree: join(options.worktrees.root, id),
      startCommit: null,
      claudeSessionId: null,
      pushedCommit: null,
      approvalLog: [],
      commandLog: [],
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
        ready: 'nothing',
        pinnedAt: null,
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
        steps: [],
        intent: null,
        branchFrom: null,
        activities: [],
        problem: null,
        startedAt: at,
        endedAt: null,
        discardedAt: null,
        jiraUrl: ticket === null ? null : await jiraLink(ticket.key),
        sprint: known?.sprint ?? null,
        approvals: [],
        ticket:
          ticket === null
            ? null
            : { type: ticket.type, description: ticket.description, status: null, dueDate: null, deleted: false },
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
        // `get()` says whether the Terminal opens (spec 036) and what's left to push, so what is saved here never counts.
        terminal: false,
        unpushed: true,
      },
      repository: folder === null ? null : { id: folder.id, path: folder.path },
      // An Ask session makes no worktree: Claude reads the folder itself (spec 026), or an empty one (spec 031).
      worktree: ask && folder !== null ? null : join(options.worktrees.root, id),
      startCommit: null,
      pushedCommit: null,
      claudeSessionId: null,
      approvalLog: [],
      commandLog: [],
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
    // Your commands end first: nothing of yours runs from a folder that's going (spec 036, AC-28), nor any server
    // found running from it (spec 042).
    await stopServers(id, record);
    await options.terminal?.stopAll(id);
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

  async function removeNow(id: string, withBranch: boolean): Promise<'deleted' | 'not_found' | 'working' | 'failed'> {
    // A push under way finishes first, so git never pushes from a worktree that's being deleted (spec 014).
    await publishing.get(id);
    const record = await records.get(id);
    if (record === null) return 'not_found';
    if (isWorking(record.session)) return 'working';
    // Your commands end first: nothing of yours runs from a folder that's going (spec 036, AC-28), nor any server
    // found running from it (spec 042).
    await stopServers(id, record);
    await options.terminal?.stopAll(id);
    // Discard leaves a folderless Ask's own folder (it isn't a worktree), so a delete takes it either way.
    if (record.worktree !== null && (record.session.discardedAt === null || record.repository === null)) {
      // The branch stays in your repository unless you ask (Q1), so committed work can still be found, and your own pull
      // request's branch is never the session's to delete (spec 031). An Ask with no folder has an empty folder of its
      // own, which isn't a repository, so remove() deletes it as long as it's under the root.
      const branch = withBranch && record.session.workOn !== 'pull_request' ? record.session.branch : null;
      const removed = await worktrees.remove(record.repository?.path ?? record.worktree, record.worktree, branch);
      if (!removed.ok) {
        report(record, 'git', 'remove');
        return 'failed';
      }
    }
    await records.remove(id);
    events.publish({ type: 'sessions.changed' });
    events.publish({ type: 'session.changed', sessionId: id });
    return 'deleted';
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
    ensureBranch: (id) => makeBranch(id),
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
      const [saved, known, followUp, unpushed] = await Promise.all([
        // A session saved before spec 013 kept only its brief.
        session.ticket ?? records.readBrief(id).then((brief) => (brief === null ? null : ticketFromBrief(brief))),
        key === null ? null : describeTicket(key),
        followUpOf(record),
        pullRequests.unpushed(record),
      ]);
      const ticket: SessionTicket | null =
        saved === null
          ? null
          : {
              ...saved,
              status: known?.status ?? null,
              dueDate: known?.dueDate ?? null,
              // Orynx knows every ticket of its own, so one it can't describe was deleted (spec 037, AC-19).
              deleted: key !== null && isOrynxKey(key) && known === null,
            };
      // There's a worktree to open from when it's made until the changes are discarded (spec 013, Q9).
      const made = worktreeMade(record) && session.discardedAt === null;
      const terminal = options.terminal !== undefined && terminalWorktree(record) !== null;
      return {
        ...session,
        ready: readyFor(session),
        ticket,
        followUp,
        worktreePath: made ? record.worktree : null,
        terminal,
        unpushed,
      };
    },

    async commands(id) {
      const record = await records.get(id);
      return record === null ? null : { commands: [...record.commandLog] };
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

    async edit(id, { title, pinned }) {
      const at = new Date(now()).toISOString();
      // Not through change(): a new name or a pin isn't activity, so the session keeps its place in the lists.
      const saved = await records.update(id, (current) => {
        const pinnedAt =
          pinned === undefined ? current.session.pinnedAt : pinned ? (current.session.pinnedAt ?? at) : null;
        return { ...current, session: { ...current.session, title: title ?? current.session.title, pinnedAt } };
      });
      if (saved === null) return 'not_found';
      events.publish({ type: 'sessions.changed' });
      events.publish({ type: 'session.changed', sessionId: id });
      return 'changed';
    },

    remove(id, { branch = false } = {}) {
      return whileEnding(id, removeNow(id, branch));
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
    async ports(id) {
      const record = await records.get(id);
      if (record === null) return 'not_found';
      const places = await placesOf(id, record);
      if (places === null || options.ports === undefined) return [];
      return options.ports.list(places);
    },

    stopPort: stopPortNow,

    async restartPort(id, port) {
      const record = await records.get(id);
      if (record === null) return 'not_found';
      const places = await placesOf(id, record);
      if (places === null || options.ports === undefined) return 'gone';
      for (const shell of places.shells.filter((one) => one.server !== null)) {
        const mine = (await options.ports.list({ ...places, shells: [shell] }))?.some(
          (one) => one.port === port && one.startedBy === 'claude',
        );
        if (mine === true && shell.tabId !== undefined && options.terminal?.restart(id, shell.tabId) === true)
          return 'done';
      }
      const there = (await options.ports.list(places))?.some((one) => one.port === port) === true;
      return there ? 'cannot_restart' : 'gone';
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
      const entry = waiting.kind === 'command' || waiting.kind === 'server' ? waiting.alwaysAllow : null;
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
