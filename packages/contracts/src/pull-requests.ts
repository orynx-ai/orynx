import { z } from 'zod';
import { GitHubLinkSchema, GitHubRepositorySchema } from './github.ts';

/**
 * Create pull request (spec 014): Claude's draft, then the commit, the push and the PR, each only on your press.
 * Every answer is a result, as a follow-up's is (spec 013): the server sends kinds and facts, and the app words
 * them (Q11).
 */

/** GitHub's own limits on a pull request's title and description (Q5). */
export const mostPullRequestTitleCharacters = 256;
export const mostPullRequestBodyCharacters = 65_536;

/**
 * Why there can't be a pull request now (Q11c): GitHub isn't connected, the folder has no `origin` or it isn't on
 * github.com, the worktree has no changes, it was moved or deleted outside Orynx, or was never made. The page
 * offers Create pull request only when none of the last four can be (Q2), and the server checks them again.
 */
export const CannotOpenReasonSchema = z.enum([
  'not_connected',
  'no_origin',
  'not_github',
  'no_changes',
  'missing',
  'no_worktree',
  'working',
  'discarded',
  'opened',
]);
export type CannotOpenReason = z.infer<typeof CannotOpenReasonSchema>;

/** What the dialog shows (Q3, Q10a): the title and description to edit, and what will happen when you press Create. */
export const PullRequestDraftSchema = z.object({
  title: z.string().min(1).max(mostPullRequestTitleCharacters),
  body: z.string().max(mostPullRequestBodyCharacters),
  /** False when Claude couldn't answer, so the draft starts from the ticket and Claude's summary (AC-6). */
  byClaude: z.boolean(),
  /** How many uncommitted files Orynx commits first; 0 when everything is committed. */
  files: z.int().nonnegative(),
  branch: z.string().min(1),
  repository: GitHubRepositorySchema,
  /** The branch the pull request merges into: the one the session started from, or GitHub's default. */
  base: z.string().min(1),
});
export type PullRequestDraft = z.infer<typeof PullRequestDraftSchema>;

/** A draft as the server answers it. */
export const DraftedPullRequestSchema = PullRequestDraftSchema.extend({ result: z.literal('draft') });
export type DraftedPullRequest = z.infer<typeof DraftedPullRequestSchema>;

/** POST /api/sessions/:id/pull-request/draft: Claude's draft, or why there can't be a pull request. */
export const PullRequestDraftAnswerSchema = z.discriminatedUnion('result', [
  DraftedPullRequestSchema,
  z.object({ result: z.literal('cannot'), reason: CannotOpenReasonSchema }),
]);
export type PullRequestDraftAnswer = z.infer<typeof PullRequestDraftAnswerSchema>;

/** POST /api/sessions/:id/pull-request: the title and description as you left them. */
export const CreatePullRequestRequestSchema = z.object({
  title: z.string().trim().min(1).max(mostPullRequestTitleCharacters),
  body: z.string().max(mostPullRequestBodyCharacters),
});
export type CreatePullRequestRequest = z.infer<typeof CreatePullRequestRequestSchema>;

/**
 * What went wrong committing or pushing (Q6, Q11d): git has no name and email for you, signing failed, the commit
 * failed another way, a new file looks like a secret, git couldn't sign in to `origin`, `origin` has commits the
 * worktree doesn't, or the push failed another way. Nothing was pushed.
 */
export const GitProblemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('no_identity') }),
  z.object({ kind: z.literal('signing') }),
  z.object({ kind: z.literal('commit_failed') }),
  /** Relative to the worktree, so the line can name it. */
  z.object({ kind: z.literal('secret'), path: z.string().min(1) }),
  z.object({ kind: z.literal('push_auth') }),
  z.object({ kind: z.literal('push_rejected') }),
  z.object({ kind: z.literal('push_failed') }),
]);
export type GitProblem = z.infer<typeof GitProblemSchema>;

/**
 * What went wrong once the branch was pushed (Q11d): your account can't open pull requests there, your token isn't
 * authorized for the organisation's single sign-on (with GitHub's own link), the rate limit is used up, GitHub
 * didn't answer, there's nothing to merge, or GitHub refused it another way.
 */
export const OpenProblemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('github_forbidden') }),
  z.object({ kind: z.literal('github_sso'), url: GitHubLinkSchema }),
  /** When the limit resets; null when GitHub didn't say. */
  z.object({ kind: z.literal('rate_limited'), resetAt: z.iso.datetime().nullable() }),
  z.object({ kind: z.literal('github_unreachable') }),
  z.object({ kind: z.literal('no_commits') }),
  z.object({ kind: z.literal('github_refused') }),
]);
export type OpenProblem = z.infer<typeof OpenProblemSchema>;

/** The answer to POST /api/sessions/:id/pull-request: opened (or linked, AC-11), can't, or failed. */
export const CreatePullRequestAnswerSchema = z.discriminatedUnion('result', [
  z.object({
    result: z.literal('opened'),
    number: z.int().positive(),
    url: GitHubLinkSchema,
    /** GitHub already had an open pull request from this branch, and Orynx took it as it was (Q9a). */
    linked: z.boolean(),
  }),
  z.object({ result: z.literal('cannot'), reason: CannotOpenReasonSchema }),
  z.object({ result: z.literal('failed'), problem: z.union([GitProblemSchema, OpenProblemSchema]) }),
]);
export type CreatePullRequestAnswer = z.infer<typeof CreatePullRequestAnswerSchema>;
export type CreatePullRequestProblem = Extract<CreatePullRequestAnswer, { result: 'failed' }>['problem'];

/** A Push changes commit message holds at most this many characters, as a title does (Q7). */
export const mostCommitMessageCharacters = mostPullRequestTitleCharacters;

/**
 * Why Orynx can't push changes now (Q7): there's no pull request yet, the folder has no `origin` or it isn't on
 * github.com any more, the worktree is missing, Claude is working, or the changes were discarded.
 */
export const CannotPushReasonSchema = z.enum([
  'no_pull_request',
  'no_origin',
  'not_github',
  'missing',
  'working',
  'discarded',
]);
export type CannotPushReason = z.infer<typeof CannotPushReasonSchema>;

/** What the Push changes dialog shows: Claude's commit message to edit, and what will happen. */
export const DraftedPushSchema = z.object({
  result: z.literal('draft'),
  message: z.string().min(1).max(mostCommitMessageCharacters),
  /** False when Claude couldn't answer, so the message is the pull request's title. */
  byClaude: z.boolean(),
  /** How many uncommitted files Orynx commits; 0 when Claude committed them. */
  files: z.int().nonnegative(),
  branch: z.string().min(1),
  /** The pull request the push updates. */
  number: z.int().positive(),
});
export type DraftedPush = z.infer<typeof DraftedPushSchema>;

/** POST /api/sessions/:id/push/draft: a commit message, nothing new to push, or why Orynx can't push. */
export const PushDraftAnswerSchema = z.discriminatedUnion('result', [
  DraftedPushSchema,
  z.object({ result: z.literal('nothing_new') }),
  z.object({ result: z.literal('cannot'), reason: CannotPushReasonSchema }),
]);
export type PushDraftAnswer = z.infer<typeof PushDraftAnswerSchema>;

/** POST /api/sessions/:id/push: the commit message as you left it. */
export const PushRequestSchema = z.object({
  message: z.string().trim().min(1).max(mostCommitMessageCharacters),
});
export type PushRequest = z.infer<typeof PushRequestSchema>;

/** The answer to POST /api/sessions/:id/push. It never asks GitHub, so its only problems are git's. */
export const PushAnswerSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('pushed'), files: z.int().nonnegative() }),
  z.object({ result: z.literal('nothing_new') }),
  z.object({ result: z.literal('cannot'), reason: CannotPushReasonSchema }),
  z.object({ result: z.literal('failed'), problem: GitProblemSchema }),
]);
export type PushAnswer = z.infer<typeof PushAnswerSchema>;
