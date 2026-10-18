import type { CannotOpenReason, FileDiff, PullRequestDraftAnswer, Session } from '@devhub/contracts';
import type { AgentAdapter } from '../agents/agent-adapter.ts';
import type { GitHubClient } from '../integrations/github/client.ts';
import type { GitHubSyncCredentials } from '../integrations/github/connection.ts';
import type { BranchGit } from './branch-git.ts';
import type { ChangesReader, ReadyChanges, StartPoint } from './changes.ts';
import { draftInstructions, draftPrompt, fallbackDraft, readDraft, type DraftTicket } from './pull-request-text.ts';
import type { SessionRecords, StoredSession } from './session-store.ts';

/**
 * Create pull request and Push changes (spec 014). A draft only reads: the worktree through git that writes nothing,
 * the session, and Claude's answer to a call with no tools, so opening the dialog changes nothing anywhere (AC-14).
 * The commit, the push and the PR come only from your press in the dialog.
 */

export interface PullRequestsOptions {
  records: SessionRecords;
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
}

/** Claude's draft reads at most this many lines of the diff, then counts only (Q4). */
const mostDiffLines = 2_000;

function isWorking(session: Session): boolean {
  return session.state === 'working' || session.state === 'needs_you';
}

function ticketOf(session: Session): DraftTicket {
  const key = session.source?.kind === 'jira' ? session.source.key : '';
  return { key, title: session.title, jiraUrl: session.jiraUrl };
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

export function createPullRequests(options: PullRequestsOptions): PullRequests {
  const { records, client, git, changes, adapter } = options;

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
      const written = adapter === null ? null : await adapter.write(prompt, draftInstructions);
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
  };
}
