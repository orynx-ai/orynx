import { z } from 'zod';
import { JiraLinkSchema } from './jira.ts';
import { SessionSourceSchema } from './session.ts';

/**
 * Home's "Needs your attention" list (spec 007). The server sends data, never words that change with
 * the clock: the app writes each pill, its wait and "Synced 2 min ago" from the times below, so they move
 * on each minute without asking the server again.
 */

/** The tool whose logo leads a row. Null for a Claude session on neither a ticket nor a pull request. */
export const InboxSourceSchema = z.enum(['jira', 'github']);
export type InboxSource = z.infer<typeof InboxSourceSchema>;

/** The tab that counts a row besides All. Null: All only. */
export const InboxTabSchema = z.enum(['jira', 'pull_requests']);
export type InboxTab = z.infer<typeof InboxTabSchema>;

/** What a row is about. The app writes the sub line from it (spec 007, Q8a). */
export const InboxSubjectSchema = z.discriminatedUnion('kind', [
  /** A Jira issue. `status` is the status's own name, shown as it is; rules use its category. */
  z.object({ kind: z.literal('issue'), key: z.string().min(1), status: z.string(), highPriorityBug: z.boolean() }),
  /** A pull request on github.com. `repository` is its name without the owner; `author` is null when GitHub gives none. */
  z.object({
    kind: z.literal('pull_request'),
    repository: z.string().min(1),
    number: z.int().positive(),
    author: z.string().min(1).nullable(),
    mine: z.boolean(),
  }),
  /** A waiting Claude session with no row of its own to take over. */
  z.object({ kind: z.literal('session'), source: SessionSourceSchema.nullable() }),
]);
export type InboxSubject = z.infer<typeof InboxSubjectSchema>;

/** Why a row needs you. The app writes the pill and picks its colour from this and the wait (Q2). */
export const InboxReasonSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('review_requested') }),
  z.object({ kind: z.literal('checks_failing') }),
  /** Unresolved review threads whose last comment isn't yours. */
  z.object({ kind: z.literal('unresolved_comments'), count: z.int().positive() }),
  /** A Claude session waits for your approval. */
  z.object({ kind: z.literal('approval') }),
  /** A Jira due date, as a calendar day: the app works out "Due Mon" or "Overdue" in the laptop's calendar. */
  z.object({ kind: z.literal('due'), on: z.iso.date(), highPriorityBug: z.boolean() }),
  /** A high-priority bug with no due date. */
  z.object({ kind: z.literal('bug') }),
  /** Any other unfinished issue, by its status category. */
  z.object({ kind: z.literal('status'), category: z.enum(['to_do', 'in_progress']) }),
]);
export type InboxReason = z.infer<typeof InboxReasonSchema>;

/** A link to a pull request on github.com: https, and that host only. */
export const GitHubLinkSchema = z.url({ protocol: /^https$/, hostname: /^github\.com$/ });

/**
 * Where a row's title and action go: out to Jira or GitHub (https, and only their hosts, so a cached or
 * forged row can't send the person anywhere else), or to a session inside DevHub.
 */
export const InboxTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('external'), url: z.union([JiraLinkSchema, GitHubLinkSchema]) }),
  z.object({ kind: z.literal('session'), sessionId: z.string().min(1) }),
]);
export type InboxTarget = z.infer<typeof InboxTargetSchema>;

/** One row of the list. */
export const InboxItemSchema = z.object({
  /** Stable across syncs, such as `jira:PROJ-1423` or `github:acme/web-app#2841`. */
  id: z.string().min(1),
  source: InboxSourceSchema.nullable(),
  tab: InboxTabSchema.nullable(),
  title: z.string().min(1),
  subject: InboxSubjectSchema,
  reason: InboxReasonSchema,
  /** When the wait started; the list puts the longest wait first. */
  waitingSince: z.iso.datetime(),
  target: InboxTargetSchema,
});
export type InboxItem = z.infer<typeof InboxItemSchema>;

/** Why a tool's last sync failed (spec 007, Q5b). */
export const InboxProblemSchema = z.discriminatedUnion('kind', [
  /** The tool didn't answer, took too long, or answered with an error that says nothing about the token. */
  z.object({ kind: z.literal('no_answer') }),
  /** The rate limit is used up; `until` is when it resets, if the tool said. */
  z.object({ kind: z.literal('rate_limited'), until: z.iso.datetime().nullable() }),
  /** The tool refused the saved token, or the keychain no longer has it. */
  z.object({ kind: z.literal('rejected') }),
  /** Jira wants a sign-in on the web first. */
  z.object({ kind: z.literal('sign_in_needed'), site: z.string().min(1) }),
  /** Anything else, in the words specs 002 to 004 already use, such as a signed-out gh. */
  z.object({ kind: z.literal('other'), message: z.string().min(1) }),
]);
export type InboxProblem = z.infer<typeof InboxProblemSchema>;

/** Where one tool's part of the list stands. */
export const InboxToolStateSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('not_connected') }),
  /** Connected, and the first sync hasn't ended: there is nothing to show yet. */
  z.object({ state: z.literal('syncing') }),
  z.object({ state: z.literal('synced'), at: z.iso.datetime() }),
  /** The last sync failed. The rows from `lastSyncedAt` stay, if there was such a sync. */
  z.object({ state: z.literal('failed'), problem: InboxProblemSchema, lastSyncedAt: z.iso.datetime().nullable() }),
]);
export type InboxToolState = z.infer<typeof InboxToolStateSchema>;

/** GET /api/inbox: the rows the inbox rules let through, longest wait first. */
export const InboxSchema = z.object({
  items: z.array(InboxItemSchema),
  tools: z.object({ jira: InboxToolStateSchema, github: InboxToolStateSchema }),
  /** When every connected tool last answered in the same sync; null before that ever happened. */
  syncedAt: z.iso.datetime().nullable(),
});
export type Inbox = z.infer<typeof InboxSchema>;
