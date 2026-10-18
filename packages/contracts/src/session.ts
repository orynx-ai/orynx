import { z } from 'zod';
import { JiraIssueKeySchema, JiraLinkSchema } from './jira.ts';
import { RepositoryIdSchema } from './repositories.ts';

/**
 * Where a Claude session is, as the sidebar shows it (spec: "Session states").
 * Each state is shown with an icon shape, a word and a colour, never colour alone.
 */
export const SessionStateSchema = z.enum(['working', 'needs_you', 'done', 'pr_open', 'stopped']);
export type SessionState = z.infer<typeof SessionStateSchema>;

/** The five steps of a session (spec: "Agent sessions"). */
export const SessionStepSchema = z.enum(['plan', 'build', 'test', 'review', 'pull_request']);
export type SessionStep = z.infer<typeof SessionStepSchema>;

/** What a session was started from: shown as `PROJ-1423` or `PR #2836` under its title. */
export const SessionSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('jira'), key: z.string().min(1) }),
  z.object({ kind: z.literal('pull_request'), number: z.int().positive() }),
]);
export type SessionSource = z.infer<typeof SessionSourceSchema>;

/** One row in the sidebar and in the full session list. */
export const SessionSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  state: SessionStateSchema,
  /** Null when the session was started from the composer without a ticket or pull request. */
  source: SessionSourceSchema.nullable(),
  /** Last activity; lists are ordered by it, newest first. */
  updatedAt: z.iso.datetime(),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

/** GET /api/sessions: sessions with the newest activity first. */
export const SessionListSchema = z.object({ sessions: z.array(SessionSummarySchema) });
export type SessionList = z.infer<typeof SessionListSchema>;

/**
 * Query string of GET /api/sessions. Leave `limit` out for every session. `recent` leaves out sessions
 * discarded more than 7 days ago, as the sidebar does (product spec, "Cleaning up").
 */
export const SessionListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  recent: z.stringbool().optional(),
});
export type SessionListQuery = z.infer<typeof SessionListQuerySchema>;

/** The id a new session gets: 16 hex characters, so it's always a safe folder name under DEVHUB_HOME. */
export const SessionIdSchema = z.string().regex(/^[0-9a-f]{16}$/);
export type SessionId = z.infer<typeof SessionIdSchema>;

/** A step in Claude's progress is `running` until the next kind of work starts, then `done` (spec 011, AC-4). */
export const SessionActivityStateSchema = z.enum(['running', 'done']);
export type SessionActivityState = z.infer<typeof SessionActivityStateSchema>;

const ActivityBaseSchema = z.object({ id: z.string().min(1), state: SessionActivityStateSchema });
/** Paths relative to the worktree, in the order Claude first touched them. */
const FilesSchema = z.array(z.string().min(1));

/**
 * One step in "Claude's progress". It's data, not words: the app says each kind in its own words
 * (spec 011, Q10a), so the server never holds copy.
 */
export const SessionActivitySchema = z.discriminatedUnion('kind', [
  /** Orynx made the branch and the worktree, from `base`; `fetched` is false when the fetch failed (Q1a). */
  ActivityBaseSchema.extend({
    kind: z.literal('worktree'),
    branch: z.string().min(1),
    base: z.string().min(1),
    fetched: z.boolean(),
  }),
  /** Orynx sent Claude the brief: this ticket and its description (Q5). */
  ActivityBaseSchema.extend({ kind: z.literal('brief'), key: JiraIssueKeySchema }),
  ActivityBaseSchema.extend({ kind: z.literal('explore'), files: FilesSchema }),
  /** The plan's items, from Claude's to-do list. */
  ActivityBaseSchema.extend({ kind: z.literal('plan'), items: z.array(z.string().min(1)) }),
  ActivityBaseSchema.extend({ kind: z.literal('edit'), files: FilesSchema }),
  /** A call Orynx refused (Q6): outside the worktree, or an edit while Ask before everything is on. */
  ActivityBaseSchema.extend({
    kind: z.literal('refused'),
    access: z.enum(['read', 'edit']),
    reason: z.enum(['outside_worktree', 'ask_everything']),
    path: z.string().min(1),
  }),
  /** Claude finished, with its own summary of what it changed. */
  ActivityBaseSchema.extend({ kind: z.literal('finished'), summary: z.string() }),
  /** You pressed Stop Claude. */
  ActivityBaseSchema.extend({ kind: z.literal('stopped') }),
  /** Orynx closed while Claude was working (AC-14). */
  ActivityBaseSchema.extend({ kind: z.literal('interrupted') }),
  /** The worktree and this branch were deleted (AC-10). */
  ActivityBaseSchema.extend({ kind: z.literal('discarded'), branch: z.string().min(1) }),
]);
export type SessionActivity = z.infer<typeof SessionActivitySchema>;

/**
 * Why a session couldn't start (`starting`) or stopped with an error once Claude was working (`working`),
 * spec 011 Q10f. The details go to the terminal only.
 */
export const SessionProblemSchema = z.object({
  kind: z.enum(['jira', 'folder', 'git', 'login', 'limit', 'other']),
  stage: z.enum(['starting', 'working']),
});
export type SessionProblem = z.infer<typeof SessionProblemSchema>;

/** GET /api/sessions/:id: everything the Session screen shows (spec 011). */
export const SessionSchema = SessionSummarySchema.extend({
  /** The folder Claude works in, as Settings › Repositories shows it. */
  folder: z.object({ name: z.string().min(1), displayPath: z.string().min(1) }),
  /** Null until the worktree is made. */
  branch: z.string().min(1).nullable(),
  /** Where the stepper is (AC-7). */
  step: SessionStepSchema,
  activities: z.array(SessionActivitySchema),
  problem: SessionProblemSchema.nullable(),
  startedAt: z.iso.datetime(),
  /** When Claude finished or stopped; the time beside "Claude's progress" stops here. */
  endedAt: z.iso.datetime().nullable(),
  /** When the worktree and branch were deleted. */
  discardedAt: z.iso.datetime().nullable(),
  /** The ticket in Jira, built on the server. */
  jiraUrl: JiraLinkSchema.nullable(),
  /** The sprint the ticket was in when the session started, for the breadcrumb (Q9e). */
  sprint: z.string().min(1).nullable(),
});
export type Session = z.infer<typeof SessionSchema>;

/** POST /api/sessions: start Claude on a ticket. `repositoryId` picks the folder when its project has several (Q3). */
export const StartSessionRequestSchema = z.object({
  ticketKey: JiraIssueKeySchema,
  repositoryId: RepositoryIdSchema.optional(),
});
export type StartSessionRequest = z.infer<typeof StartSessionRequestSchema>;

/**
 * The answer to POST /api/sessions. A ticket with a live session answers `existing` with it. A start
 * that can't happen creates nothing and says why (Q4): no folder for the project, a folder still to
 * pick, Claude Code signed out, or three sessions already working (Q11).
 */
export const StartSessionAnswerSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('started'), sessionId: SessionIdSchema }),
  z.object({ result: z.literal('existing'), sessionId: SessionIdSchema }),
  z.object({
    result: z.literal('cannot_start'),
    reason: z.enum(['no_folder', 'choose_folder', 'signed_out', 'too_many']),
  }),
]);
export type StartSessionAnswer = z.infer<typeof StartSessionAnswerSchema>;
export type CannotStartReason = Extract<StartSessionAnswer, { result: 'cannot_start' }>['reason'];
