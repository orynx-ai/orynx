import type {
  CannotOpenReason,
  CannotPushReason,
  CannotReplyReason,
  CreatePullRequestProblem,
  DraftedPullRequest,
  DraftedPush,
  ReplyProblem,
} from '@devhub/contracts';
import { clockText } from '../../words/calendar.ts';

/**
 * The words of Create pull request and Push changes (spec 014, Q11). The server sends kinds and facts; these say
 * them, with the repository, branch and base each line names.
 */

export const pullRequestWords = {
  create: 'Create pull request',
  creating: 'Creating…',
  cancel: 'Cancel',
  push: 'Push changes',
  pushing: 'Pushing…',
  title: 'Title',
  description: 'Description',
  descriptionHelp: 'Markdown, as on GitHub.',
  drafting: 'Claude is drafting the title and description…',
  notDrafted: "Claude couldn't draft this, so it starts from the ticket and Claude's summary.",
  openSettings: 'Open Settings',
  authorize: 'Authorize',
  commitMessage: 'Commit message',
  // Not in Q11: the local server didn't answer the draft, or the press.
  draftFailed: "Couldn't get a draft.",
  tryAgain: 'Try again',
  createFailed: "Couldn't create the pull request. Try again.",
  nothingNew: 'Nothing new to push: GitHub already has everything in the worktree.',
  // Not in Q11: Push changes while Claude drafts its message, and when the press didn't reach the server.
  draftingMessage: 'Claude is drafting the commit message…',
  pushFailed: "Couldn't push the changes. Try again.",
} as const;

/** "Push to PR #2974": the next-move bar's button (spec 048). */
export function pushToLabel(number: number): string {
  return `Push to PR #${String(number)}`;
}

/**
 * The next-move bar's words (spec 048, Q7): what's ready, the changes in a line, and what pushing or creating does.
 * "4 files, +142 −18. Nothing leaves your machine until you push."
 */
export const nextMoveWords = {
  readyToPush: 'Ready to push',
  readyForPullRequest: 'Ready for a pull request',
  pushed: (number: number) => `Pushed to PR #${String(number)}`,
  pushedLine: 'GitHub has everything from this worktree.',
  changesLine(changes: { files: number; added: number; removed: number } | null, until: 'push' | 'create'): string {
    const rest = `Nothing leaves your machine until you ${until === 'push' ? 'push' : 'create it'}.`;
    if (changes === null) return rest;
    const { files, added, removed } = changes;
    const counts = [added > 0 ? `+${String(added)}` : '', removed > 0 ? `−${String(removed)}` : ''].join(' ').trim();
    const inFiles = `${String(files)} ${files === 1 ? 'file' : 'files'}`;
    return `${counts === '' ? inFiles : `${inFiles}, ${counts}`}. ${rest}`;
  },
} as const;

/** "Open PR #2841" (Q11a). */
export function openPullRequestLabel(number: number): string {
  return `Open PR #${String(number)}`;
}

/** Where the pull request goes, under the dialog's title: "acme/web-app · feat/PROJ-1423 → main" (Q10a). */
export function whereLine({ repository, branch, base }: Pick<DraftedPullRequest, 'repository' | 'branch' | 'base'>) {
  return `${repository} · ${branch} → ${base}`;
}

function filesText(count: number): string {
  return `${String(count)} changed ${count === 1 ? 'file' : 'files'}`;
}

/** What pressing Create will do (Q11b). */
export function whatHappensLine({ files, branch, repository }: DraftedPullRequest): string {
  const push = `pushes ${branch} to ${repository} and opens the pull request.`;
  return files === 0 ? `Orynx ${push}` : `Orynx commits ${filesText(files)}, ${push}`;
}

/** What pressing Push changes will do (Q11f). */
export function pushHappensLine({ files, branch, number }: DraftedPush): string {
  const updates = `which updates pull request #${String(number)}.`;
  return files === 0
    ? `Orynx pushes ${branch}, ${updates}`
    : `Orynx commits ${filesText(files)} and pushes them to ${branch}, ${updates}`;
}

const noOrigin = 'This folder has no origin to push to.';
const notGitHub = "This folder's origin isn't on github.com, so Orynx can't open a pull request there.";
const missing = 'The worktree is missing. It was moved or deleted outside Orynx.';

/** The line in place of the fields when there can't be a pull request (Q11c), and whether Settings is linked. */
export function cannotOpenWords(reason: CannotOpenReason): { line: string; settings: boolean } {
  const lines: Record<CannotOpenReason, string> = {
    not_connected: 'Connect GitHub to open pull requests.',
    no_origin: noOrigin,
    not_github: notGitHub,
    no_changes: "There's nothing to put in a pull request: the worktree has no changes.",
    missing,
    // The page offers Create pull request in none of these (Q2); the server may still see one first.
    no_worktree: 'The session stopped before Orynx made a worktree.',
    working: "Claude is still working. Create the pull request once it's done.",
    discarded: "The changes were discarded, so there's nothing to put in a pull request.",
    opened: 'The pull request is open already.',
  };
  return { line: lines[reason], settings: reason === 'not_connected' };
}

/** The line in place of the field when Orynx can't push changes (Q7). */
export function cannotPushWords(reason: CannotPushReason): string {
  const lines: Record<CannotPushReason, string> = {
    no_pull_request: "There's no pull request to push to yet.",
    no_origin: noOrigin,
    not_github: notGitHub,
    missing,
    working: "Claude is still working. Push once it's done.",
    discarded: "The changes were discarded, so there's nothing to push.",
  };
  return lines[reason];
}

/** The line under the fields when Create or Push changes fails (Q11d). */
export function failureLine(
  problem: CreatePullRequestProblem,
  { repository, branch, base }: { repository: string; branch: string; base: string },
): string {
  switch (problem.kind) {
    case 'no_identity':
      return 'git has no name and email for you. Set them with git config, then try again.';
    case 'signing':
      return "git couldn't sign the commit.";
    case 'commit_failed':
      return "Couldn't commit the changes. Try again.";
    case 'secret':
      return `Couldn't commit ${problem.path}: it looks like a secret. Delete it or add it to .gitignore, then try again.`;
    case 'push_auth':
      return `git couldn't sign in to ${repository}. Check that git push works for this folder in a terminal.`;
    case 'push_rejected':
      return `${repository} already has ${branch} with commits this worktree doesn't have. Orynx never overwrites them.`;
    case 'push_failed':
      return `Couldn't push to ${repository}. Try again.`;
    case 'github_forbidden':
      return `Your GitHub account can't open pull requests in ${repository}.`;
    case 'github_sso':
      return `Authorize your GitHub token for ${repository.split('/')[0] ?? repository}'s single sign-on, then try again.`;
    case 'rate_limited':
      return problem.resetAt === null
        ? "GitHub's rate limit is used up."
        : `GitHub's rate limit is used up until ${clockText(problem.resetAt)}.`;
    case 'github_unreachable':
      return "Couldn't reach GitHub. The branch is pushed, so try again to open the pull request.";
    case 'no_commits':
      return `GitHub says there's nothing to merge from ${branch} into ${base}.`;
    case 'github_refused':
      return 'GitHub refused the pull request. Try again.';
  }
}

/** Delete's extra line once a pull request is open (Q11g; Discard's until spec 039). */
export function deleteKeepsPullRequest(number: number): string {
  return `Pull request #${String(number)} and the branch on GitHub stay.`;
}

/** Reply to reviewers (spec 048). */
export const replyWords = {
  button: 'Reply to reviewers',
  drafting: 'Claude is drafting replies…',
  notDrafted: "Claude couldn't draft replies. Write your own, or leave a thread as it is.",
  reply: 'Reply',
  resolve: 'Resolve',
  post: 'Post replies',
  posting: 'Posting…',
  notRead: "Orynx couldn't read the review threads.",
  postFailed: "Couldn't post the replies. Try again.",
  close: 'Close',
} as const;

/** "acme/web-app #2841", under the dialog's title. */
export function replyWhereLine(repository: string, number: number): string {
  return `${repository} #${String(number)}`;
}

/** The empty dialog (AC-7). */
export function noThreadsLine(number: number): string {
  return `No review threads are waiting on #${String(number)}.`;
}

/** Where a thread is: "src/ContentList.tsx line 42", or the file alone for a comment on the whole file. */
export function threadPlace({ path, line }: { path: string; line: number | null }): string {
  return line === null ? path : `${path} line ${String(line)}`;
}

/** Why Reply to reviewers can't read or post anything. */
export function cannotReplyLine(reason: CannotReplyReason): string {
  return reason === 'not_connected'
    ? 'Connect GitHub to reply to reviewers.'
    : "There's no open pull request to reply on.";
}

/** Why GitHub didn't take a thread's reply or Resolve, or the threads couldn't be read (AC-5, AC-6). */
export function replyProblemLine(problem: ReplyProblem, repository: string): string {
  switch (problem.kind) {
    case 'github_said':
      return `GitHub refused this: ${problem.message}`;
    case 'github_forbidden':
      return `Your GitHub account can't reply in ${repository}.`;
    case 'github_sso':
      return `Authorize your GitHub token for ${repository.split('/')[0] ?? repository}'s single sign-on, then try again.`;
    case 'rate_limited':
      return problem.resetAt === null
        ? "GitHub's rate limit is used up."
        : `GitHub's rate limit is used up until ${clockText(problem.resetAt)}.`;
    case 'github_unreachable':
      return "Couldn't reach GitHub. Try again.";
    case 'no_commits':
    case 'github_refused':
      return 'GitHub refused it. Try again.';
  }
}
