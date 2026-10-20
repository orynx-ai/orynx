import type {
  CannotOpenReason,
  CreatePullRequestAnswer,
  CreatePullRequestProblem,
  CreatePullRequestRequest,
  CannotPushReason,
  FileDiff,
  GitProblem,
  PullRequestDraftAnswer,
  PushAnswer,
  PushDraftAnswer,
  PushRequest,
  Session,
} from '@devhub/contracts';
import type { AgentAdapter } from '../agents/agent-adapter.ts';
import type { GitHubClient, GitHubOpenProblem } from '../integrations/github/client.ts';
import type { GitHubSyncCredentials } from '../integrations/github/connection.ts';
import type { BranchGit, CommitProblem, PushProblem } from './branch-git.ts';
import type { ChangesReader, ReadyChanges, StartPoint } from './changes.ts';
import { addPullRequestStep } from './progress.ts';
import {
  commitMessage,
  draftInstructionsFor,
  draftPrompt,
  fallbackDraft,
  pushInstructions,
  pushPrompt,
  readCommitMessage,
  readDraft,
  type DraftTicket,
} from './pull-request-text.ts';
import { firstSecretFile } from './secret-files.ts';
import type { SessionRecords, StoredSession } from './session-store.ts';

/**
 * Create pull request and Push changes (spec 014). A draft only reads: the worktree through git that writes nothing,
 * the session, and Claude's answer to a call with no tools, so opening the dialog changes nothing anywhere (AC-14).
 * The commit, the push and the PR come only from your press in the dialog.
 */

/**
 * What the terminal is told (spec 014, AC-24): the session, the ticket, the step, how it ended (a problem's kind, or
 * opened, linked, pushed), and the pull request's number. Never a title, a description, an address or git's words.
 */
export interface PullRequestReport {
  what: 'pull_request';
  session: string;
  ticket: string;
  step: 'create' | 'push';
  outcome: string;
  number: number | null;
}

export interface PullRequestsOptions {
  records: SessionRecords;
  /** Changes the session, as the session service does, so the lists and the Session screen hear of it. */
  save: (id: string, update: (record: StoredSession) => StoredSession) => Promise<StoredSession | null>;
  now?: () => number;
  onReport?: (report: PullRequestReport) => void;
  /** 004's connection: the token for the gh way or the token way, or null when GitHub isn't connected. */
  github: { credentials(): Promise<GitHubSyncCredentials | null> };
  client: GitHubClient;
  git: BranchGit;
  changes: ChangesReader;
  /** Null when the server was built without Claude Code: then every draft starts from the ticket (AC-6). */
  adapter: AgentAdapter | null;
}

export interface PullRequests {
  /** Claude's draft and what will happen, or why there can't be a pull request; null for no such session. */
  draft(id: string): Promise<PullRequestDraftAnswer | null>;
  /**
   * Commits, pushes and opens the pull request as you left it, one at a time for each session (AC-13); null for no
   * such session. A press that finds the pull request open already answers with it.
   */
  create(id: string, request: CreatePullRequestRequest): Promise<CreatePullRequestAnswer | null>;
  /** Claude's commit message for what's new since the last push, or nothing new, or why Orynx can't push (Q7). */
  draftPush(id: string): Promise<PushDraftAnswer | null>;
  /** Commits what's new and pushes it to the pull request's branch, one at a time for each session (Q7). */
  push(id: string, request: PushRequest): Promise<PushAnswer | null>;
}

/** Claude's draft reads at most this many lines of the diff, then counts only (Q4). */
const mostDiffLines = 2_000;

function isWorking(session: Session): boolean {
  return session.state === 'working' || session.state === 'needs_you';
}

/** The session's ticket; a session started from the composer with no ticket has no key (spec 015, AC-34). */
function ticketOf(session: Session): DraftTicket {
  const key = session.source?.kind === 'jira' ? session.source.key : null;
  return { key, title: session.title, jiraUrl: key === null ? null : session.jiraUrl };
}

/** Claude's "Finished" summaries, oldest first. */
function summariesOf(session: Session): string[] {
  return session.activities.flatMap((activity) => (activity.kind === 'finished' ? [activity.summary] : []));
}

/** The files Claude edited, in the order it first did, as the Changes tab orders them (spec 013, Q5). */
function editOrder(session: Session): string[] {
  return session.activities.flatMap((activity) => (activity.kind === 'edit' ? activity.files : []));
}

/** The branch the session started from, as its worktree step names it (`origin/main`). */
function baseOf(session: Session): string | null {
  const made = session.activities.find((activity) => activity.kind === 'worktree');
  return made?.kind === 'worktree' ? made.base : null;
}

/** Where the worktree started (spec 013): the commit, or the base for a session made before 013. Null without one. */
function startOf(record: StoredSession): StartPoint | null {
  const base = baseOf(record.session);
  if (record.startCommit !== null) return { commit: record.startCommit };
  return base === null ? null : { base };
}

const cannot = (reason: CannotOpenReason) => ({ result: 'cannot', reason }) as const;
const failed = (problem: CreatePullRequestProblem) => ({ result: 'failed', problem }) as const;

const commitProblems: Record<CommitProblem, GitProblem> = {
  no_identity: { kind: 'no_identity' },
  signing: { kind: 'signing' },
  commit_failed: { kind: 'commit_failed' },
};

const pushProblems: Record<PushProblem, GitProblem> = {
  auth: { kind: 'push_auth' },
  rejected: { kind: 'push_rejected' },
  timeout: { kind: 'push_failed' },
  failed: { kind: 'push_failed' },
};

/** Claude's "Finished" summaries since the pull request opened or was last pushed to. */
function summariesSincePush(session: Session): string[] {
  const last = session.activities.findLastIndex(
    (activity) => activity.kind === 'pull_request' || activity.kind === 'pushed',
  );
  return summariesOf({ ...session, activities: session.activities.slice(last + 1) });
}

/** GitHub's refusal in the dialog's terms (Q11d). A refused token reads as a refusal: Settings says the rest. */
function openProblem(problem: GitHubOpenProblem): CreatePullRequestProblem {
  switch (problem.kind) {
    case 'forbidden':
      return { kind: 'github_forbidden' };
    case 'sso':
      return { kind: 'github_sso', url: problem.url };
    case 'rate_limited':
      return {
        kind: 'rate_limited',
        resetAt: problem.resetAt === null ? null : new Date(problem.resetAt).toISOString(),
      };
    case 'unreachable':
    case 'timeout':
      return { kind: 'github_unreachable' };
    case 'no_commits':
      return { kind: 'no_commits' };
    case 'exists':
    case 'rejected':
    case 'github_error':
      return { kind: 'github_refused' };
  }
}

export function createPullRequests(options: PullRequestsOptions): PullRequests {
  const { records, client, git, changes, adapter } = options;
  const now = options.now ?? Date.now;
  /** One create or push at a time for each session (AC-13). */
  const turns = new Map<string, Promise<unknown>>();

  function oneAtATime<T>(id: string, work: () => Promise<T>): Promise<T> {
    const turn = (turns.get(id) ?? Promise.resolve()).then(work);
    turns.set(
      id,
      turn.catch(() => undefined),
    );
    return turn;
  }

  function report(record: StoredSession, step: PullRequestReport['step'], outcome: string, number: number | null) {
    options.onReport?.({
      what: 'pull_request',
      session: record.session.id,
      ticket: ticketOf(record.session).key ?? '',
      step,
      outcome,
      number,
    });
  }

  /** The diffs of the listed files, in order, until the draft has as many lines as it reads. */
  async function diffsFor(worktree: string, start: StartPoint, listed: ReadyChanges): Promise<FileDiff[]> {
    const diffs: FileDiff[] = [];
    let lines = 0;
    for (const file of listed.files) {
      if (lines >= mostDiffLines) break;
      const read = await changes.fileDiff(worktree, start, file.path);
      if (!read.ok) continue;
      diffs.push(read.diff);
      lines += read.diff.lines.length;
    }
    return diffs;
  }

  /** The base the pull request merges into: the session's own when it's on origin, else GitHub's default. */
  async function baseBranch(session: Session, token: string, repository: string): Promise<string> {
    const base = baseOf(session);
    if (base?.startsWith('origin/') === true) return base.slice('origin/'.length);
    const found = await client.defaultBranch(token, repository);
    return found.ok ? found.branch : (base ?? 'main');
  }

  return {
    async draft(id) {
      const record = await records.get(id);
      if (record === null) return null;
      const { session, worktree } = record;
      if (session.discardedAt !== null) return cannot('discarded');
      if (isWorking(session)) return cannot('working');
      if (session.pullRequest !== null) return cannot('opened');
      const start = startOf(record);
      if (worktree === null || session.branch === null || start === null) return cannot('no_worktree');

      const origin = await git.origin(worktree);
      if (!origin.ok) return cannot(origin.problem === 'git' ? 'missing' : origin.problem);
      const credentials = await options.github.credentials();
      if (credentials?.ok !== true) return cannot('not_connected');
      const listed = await changes.list(worktree, start, editOrder(session));
      if (!listed.ok) return cannot('missing');
      if (listed.changes.files.length === 0) return cannot('no_changes');

      const { repository } = origin;
      const base = await baseBranch(session, credentials.token, repository);
      // The worktree can go while it's read: then it's missing, as the Changes tab says (spec 013).
      const read = await Promise.all([
        git.uncommitted(worktree),
        records.readBrief(id),
        git.commitsSince(worktree, start),
        diffsFor(worktree, start, listed.changes),
        git.template(worktree),
        git.baseSubjects(worktree, baseOf(session) ?? base),
      ]).catch(() => null);
      if (read === null) return cannot('missing');
      const [uncommitted, brief, commits, diffs, template, baseSubjects] = read;
      const ticket = ticketOf(session);
      const summaries = summariesOf(session);
      const prompt = draftPrompt({
        ticket,
        brief,
        summaries,
        commits,
        files: listed.changes.files,
        moreFiles: listed.changes.moreFiles,
        diffs,
        template,
        baseSubjects,
        base,
      });
      const written = adapter === null ? null : await adapter.write(prompt, draftInstructionsFor(ticket));
      const drafted = written?.ok === true ? readDraft(written.text, ticket) : null;
      const text = drafted ?? fallbackDraft(ticket, summaries);
      return {
        result: 'draft',
        ...text,
        byClaude: drafted !== null,
        files: uncommitted.length,
        branch: session.branch,
        repository,
        base,
      };
    },

    create(id, request) {
      return oneAtATime(id, () => createNow(id, request));
    },

    async draftPush(id) {
      const record = await records.get(id);
      if (record === null) return null;
      const ready = await readyToPush(record);
      if ('result' in ready) return ready;
      const { worktree, since, uncommitted, number, branch } = ready;
      const { session } = record;
      const listed = await changes.list(worktree, since, editOrder(session));
      const files = listed.ok ? listed.changes : { files: [], moreFiles: 0 };
      const diffs = listed.ok ? await diffsFor(worktree, since, listed.changes).catch(() => []) : [];
      const ticket = ticketOf(session);
      const prompt = pushPrompt({ ticket, summaries: summariesSincePush(session), ...files, diffs });
      const written = adapter === null ? null : await adapter.write(prompt, pushInstructions);
      const message = written?.ok === true ? readCommitMessage(written.text) : null;
      return {
        result: 'draft',
        message: message ?? fallbackDraft(ticket, []).title,
        byClaude: message !== null,
        files: uncommitted.length,
        branch,
        number,
      };
    },

    push(id, request) {
      return oneAtATime(id, () => pushNow(id, request));
    },
  };

  type ReadyToPush =
    | { worktree: string; since: StartPoint; uncommitted: string[]; number: number; url: string; branch: string }
    | { result: 'cannot'; reason: CannotPushReason }
    | { result: 'nothing_new' };

  /** What Push changes works from: the worktree, the last pushed commit and what's new since; or why it can't. */
  async function readyToPush(record: StoredSession): Promise<ReadyToPush> {
    const { session, worktree } = record;
    const no = (reason: CannotPushReason) => ({ result: 'cannot', reason }) as const;
    if (session.discardedAt !== null) return no('discarded');
    if (isWorking(session)) return no('working');
    if (session.pullRequest === null) return no('no_pull_request');
    const since = record.pushedCommit === null ? startOf(record) : { commit: record.pushedCommit };
    if (worktree === null || session.branch === null || since === null) return no('missing');
    const origin = await git.origin(worktree);
    if (!origin.ok) return no(origin.problem === 'git' ? 'missing' : origin.problem);
    const read = await Promise.all([git.uncommitted(worktree), git.head(worktree)]).catch(() => null);
    if (read === null) return no('missing');
    const [uncommitted, head] = read;
    if (uncommitted.length === 0 && 'commit' in since && head === since.commit) return { result: 'nothing_new' };
    const { number, url } = session.pullRequest;
    return { worktree, since, uncommitted, number, url, branch: session.branch };
  }

  async function pushNow(id: string, { message }: PushRequest): Promise<PushAnswer | null> {
    const record = await records.get(id);
    if (record === null) return null;
    const ready = await readyToPush(record);
    if ('result' in ready) return ready;
    const { worktree, since, number, url, branch } = ready;
    const ending = (answer: PushAnswer, outcome: string) => {
      report(record, 'push', outcome, number);
      return answer;
    };
    const added = await git.newFiles(worktree, since).catch(() => null);
    if (added === null) return ending({ result: 'failed', problem: { kind: 'commit_failed' } }, 'secret_check');
    const secret = firstSecretFile(added);
    if (secret !== null) return ending({ result: 'failed', problem: { kind: 'secret', path: secret } }, 'secret');
    const committed = await git.commit(worktree, commitMessage(message));
    if (!committed.ok)
      return ending({ result: 'failed', problem: commitProblems[committed.problem] }, committed.problem);
    // A session on your pull request's own branch has a detached worktree, whose HEAD goes to it (spec 031).
    const pushed = await git.push(worktree, branch, { detached: record.session.workOn === 'pull_request' });
    if (!pushed.ok)
      return ending({ result: 'failed', problem: pushProblems[pushed.problem] }, `push_${pushed.problem}`);
    await options.save(id, (current) => {
      const { step, activities } = addPullRequestStep(
        { step: current.session.step, activities: current.session.activities },
        { kind: 'pushed', number, url, files: committed.files },
      );
      return {
        ...current,
        pushedCommit: pushed.head,
        session: { ...current.session, state: 'pr_open', step, activities: [...activities] },
      };
    });
    return ending({ result: 'pushed', files: committed.files }, 'pushed');
  }

  async function createNow(
    id: string,
    { title, body }: CreatePullRequestRequest,
  ): Promise<CreatePullRequestAnswer | null> {
    const record = await records.get(id);
    if (record === null) return null;
    const { session, worktree } = record;
    // The other tab's press got here first (AC-13).
    if (session.pullRequest !== null) {
      return { result: 'opened', number: session.pullRequest.number, url: session.pullRequest.url, linked: false };
    }
    if (session.discardedAt !== null) return cannot('discarded');
    if (isWorking(session)) return cannot('working');
    const start = startOf(record);
    if (worktree === null || session.branch === null || start === null) return cannot('no_worktree');
    const { branch } = session;
    const origin = await git.origin(worktree);
    if (!origin.ok) return cannot(origin.problem === 'git' ? 'missing' : origin.problem);
    const credentials = await options.github.credentials();
    if (credentials?.ok !== true) return cannot('not_connected');
    const listed = await changes.list(worktree, start, editOrder(session));
    if (!listed.ok) return cannot('missing');
    if (listed.changes.files.length === 0) return cannot('no_changes');
    const { repository } = origin;

    const ending = (answer: CreatePullRequestAnswer, outcome: string) => {
      report(record, 'create', outcome, answer.result === 'opened' ? answer.number : null);
      return answer;
    };

    // A pushed secret can't be taken back, so a new one stops everything before git writes anything (Q6). When the
    // new files can't be listed, nothing is committed either.
    const added = await git.newFiles(worktree, start).catch(() => null);
    if (added === null) return ending(failed({ kind: 'commit_failed' }), 'secret_check');
    const secret = firstSecretFile(added);
    if (secret !== null) return ending(failed({ kind: 'secret', path: secret }), 'secret');
    const committed = await git.commit(worktree, commitMessage(title));
    if (!committed.ok) return ending(failed(commitProblems[committed.problem]), committed.problem);
    const pushed = await git.push(worktree, branch);
    if (!pushed.ok) return ending(failed(pushProblems[pushed.problem]), `push_${pushed.problem}`);

    const base = await baseBranch(session, credentials.token, repository);
    const opened = await client.openPull(credentials.token, { repository, head: branch, base, title, body });
    let pull: { number: number; url: string; linked: boolean };
    if (opened.ok) pull = { number: opened.number, url: opened.url, linked: false };
    else if (opened.problem.kind === 'exists') {
      // GitHub has an open one from this branch already: take it as it is (Q9a).
      const found = await client.findOpenPull(credentials.token, { repository, head: branch });
      if (!found.ok || found.pull === null) return ending(failed({ kind: 'github_refused' }), 'exists');
      pull = { ...found.pull, linked: true };
    } else return ending(failed(openProblem(opened.problem)), opened.problem.kind);

    const at = new Date(now()).toISOString();
    await options.save(id, (current) => {
      const { step, activities } = addPullRequestStep(
        { step: current.session.step, activities: current.session.activities },
        {
          kind: 'pull_request',
          number: pull.number,
          url: pull.url,
          files: committed.files,
          branch,
          linked: pull.linked,
        },
      );
      return {
        ...current,
        pushedCommit: pushed.head,
        session: {
          ...current.session,
          state: 'pr_open',
          step,
          activities: [...activities],
          pullRequest: { number: pull.number, url: pull.url, repository, openedAt: at },
        },
      };
    });
    return ending({ result: 'opened', ...pull }, pull.linked ? 'linked' : 'opened');
  }
}
