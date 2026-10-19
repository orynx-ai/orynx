import { z } from 'zod';
import { AlwaysAskReasonSchema } from './commands.ts';
import { FilePathSchema } from './files.ts';
import { GitHubLinkSchema, GitHubRepositorySchema } from './github.ts';
import { JiraIssueKeySchema, JiraLinkSchema } from './jira.ts';
import { RepositoryIdSchema } from './repositories.ts';
import { looksLikeSecret } from './secret-names.ts';
import { TicketColumnSchema } from './ticket-column.ts';

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

/**
 * Where the next page of sessions starts (spec 020): the last row's activity time in milliseconds and its
 * id, so a session that moves to the top between two pages is never listed twice.
 */
export const SessionCursorSchema = z.string().regex(/^\d{1,15}\.\S{1,128}$/);
export type SessionCursor = z.infer<typeof SessionCursorSchema>;

/** GET /api/sessions: sessions with the newest activity first. */
export const SessionListSchema = z.object({
  sessions: z.array(SessionSummarySchema),
  /** Pass it back as `cursor` for the next page; null on the last page, or when no `limit` was asked. */
  nextCursor: SessionCursorSchema.nullable().default(null),
});
export type SessionList = z.infer<typeof SessionListSchema>;

/**
 * Query string of GET /api/sessions. Leave `limit` out for every session. `recent` leaves out sessions
 * discarded more than 7 days ago, as the sidebar does (product spec, "Cleaning up"). `cursor` asks for the
 * page after the one whose `nextCursor` it is (spec 020).
 */
export const SessionListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  recent: z.stringbool().optional(),
  cursor: SessionCursorSchema.optional(),
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
  /**
   * Orynx sent Claude the brief (Q5): the ticket and its description, or none, then what the composer added
   * (spec 015): whether you wrote a message, each pull request as its chip reads, and each file's name. A step
   * saved before spec 015 is the ticket alone.
   */
  ActivityBaseSchema.extend({
    kind: z.literal('brief'),
    key: JiraIssueKeySchema.nullable(),
    /** The other tickets Claude got, after the session's own (spec 022, Q2); none before spec 022. */
    tickets: z.array(JiraIssueKeySchema).default([]),
    message: z.boolean().default(false),
    pullRequests: z.array(z.string().min(1)).default([]),
    files: z.array(z.string().min(1)).default([]),
  }),
  ActivityBaseSchema.extend({ kind: z.literal('explore'), files: FilesSchema }),
  /** The plan's items, from Claude's to-do list. */
  ActivityBaseSchema.extend({ kind: z.literal('plan'), items: z.array(z.string().min(1)) }),
  ActivityBaseSchema.extend({ kind: z.literal('edit'), files: FilesSchema }),
  /**
   * A call Orynx refused: outside the worktree (spec 011, Q6), a push or a background command (spec 012,
   * Q7). `path` holds the command for a `run`. `ask_everything` is from before spec 012, when an edit in
   * Ask before everything was refused instead of asked.
   */
  ActivityBaseSchema.extend({
    kind: z.literal('refused'),
    access: z.enum(['read', 'edit', 'run']),
    reason: z.enum(['outside_worktree', 'ask_everything', 'push', 'background']),
    path: z.string().min(1),
  }),
  /** A call waiting for your answer (spec 012): `text` is Claude's line about the command, or the edit's path. */
  ActivityBaseSchema.extend({
    kind: z.literal('waiting'),
    approvalId: z.string().min(1),
    about: z.enum(['command', 'edit']),
    text: z.string().nullable(),
  }),
  /** Commands that ran, in the order they were allowed. */
  ActivityBaseSchema.extend({ kind: z.literal('command'), commands: z.array(z.string().min(1)) }),
  /** You denied a call: `text` is the command, or the edit's path. */
  ActivityBaseSchema.extend({ kind: z.literal('denied'), about: z.enum(['command', 'edit']), text: z.string().min(1) }),
  /** Claude can't run commands in this session (spec 012, Q2b). */
  ActivityBaseSchema.extend({ kind: z.literal('no_commands'), reason: z.enum(['no_sandbox']) }),
  /** Claude finished, with its own summary of what it changed. */
  ActivityBaseSchema.extend({ kind: z.literal('finished'), summary: z.string() }),
  /** You wrote to Claude in the follow-up box (spec 013): exactly the text Claude got. */
  ActivityBaseSchema.extend({ kind: z.literal('message'), text: z.string().min(1) }),
  /**
   * Orynx opened the pull request on your press (spec 014): `files` it committed first (0 when Claude had
   * committed everything), and `linked` when GitHub already had an open one from this branch, which it took.
   */
  ActivityBaseSchema.extend({
    kind: z.literal('pull_request'),
    number: z.int().positive(),
    url: GitHubLinkSchema,
    files: z.int().nonnegative(),
    branch: z.string().min(1),
    linked: z.boolean(),
  }),
  /** Orynx pushed what was new to the pull request's branch on your press (spec 014): `files` it committed. */
  ActivityBaseSchema.extend({
    kind: z.literal('pushed'),
    number: z.int().positive(),
    url: GitHubLinkSchema,
    files: z.int().nonnegative(),
  }),
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
 * spec 011 Q10f. `resume` is a follow-up Claude Code couldn't carry on, because it no longer has the
 * session's conversation (spec 013, AC-16). The details go to the terminal only.
 */
export const SessionProblemSchema = z.object({
  kind: z.enum(['jira', 'folder', 'git', 'login', 'limit', 'resume', 'other']),
  stage: z.enum(['starting', 'working']),
});
export type SessionProblem = z.infer<typeof SessionProblemSchema>;

/** One line of the change an edit would make, as the approval callout shows it (spec 012, Q9). */
export const ChangeLineSchema = z.object({
  kind: z.enum(['context', 'added', 'removed']),
  /** The new file's number for added and unchanged lines, the old file's for removed ones. */
  number: z.int().positive(),
  text: z.string(),
});
export type ChangeLine = z.infer<typeof ChangeLineSchema>;

const ApprovalBaseSchema = z.object({ id: z.string().min(1), askedAt: z.iso.datetime() });

/** A call waiting for your answer (spec 012): a command, or an edit while Ask before everything is on. */
export const SessionApprovalSchema = z.discriminatedUnion('kind', [
  ApprovalBaseSchema.extend({
    kind: z.literal('command'),
    command: z.string().min(1),
    /** Claude's own line about what the command does, when it gave one. */
    description: z.string().nullable(),
    /** Null when it asks only because of the mode or the list. */
    alwaysAsk: AlwaysAskReasonSchema.nullable(),
    /** The entry Always allow would save (Q4); null when Always allow isn't offered (Q1). */
    alwaysAllow: z.string().min(1).nullable(),
  }),
  ApprovalBaseSchema.extend({
    kind: z.literal('edit'),
    /** Relative to the worktree. */
    path: z.string().min(1),
    creates: z.boolean(),
    /** At most 20 lines of the change; `moreLines` says how many follow them. */
    lines: z.array(ChangeLineSchema),
    moreLines: z.int().nonnegative(),
  }),
]);
export type SessionApproval = z.infer<typeof SessionApprovalSchema>;

/**
 * The ticket on the Ticket tab (spec 013, Q7): its type and description as Claude got them when the session
 * started, and its status and due date as the cache knows them now (null when it doesn't have the ticket).
 * The key and title are the session's own.
 */
export const SessionTicketSchema = z.object({
  type: z.string().min(1).nullable(),
  /** Markdown, from Orynx's converter; null when the ticket has none. */
  description: z.string().nullable(),
  /** The status's own name ("In progress") and its board column, for the pill's look. */
  status: z.object({ name: z.string().min(1), column: TicketColumnSchema }).nullable(),
  /** A calendar day, worded by the app ("Due Fri"), as on Tickets. */
  dueDate: z.iso.date().nullable(),
});
export type SessionTicket = z.infer<typeof SessionTicketSchema>;

/**
 * Whether the follow-up box takes a message (spec 013, Q1), or why not: the changes are discarded, Claude
 * never started, or the ticket has a newer live session, which the box links to. Three sessions already
 * working is said only when you send, because it can change at any moment.
 */
export const SessionFollowUpSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('open') }),
  z.object({ kind: z.literal('discarded') }),
  z.object({ kind: z.literal('never_started') }),
  z.object({ kind: z.literal('newer_session'), sessionId: SessionIdSchema }),
]);
export type SessionFollowUp = z.infer<typeof SessionFollowUpSchema>;

/** The pull request Orynx opened for a session, or the open one it linked (spec 014). */
export const SessionPullRequestSchema = z.object({
  number: z.int().positive(),
  /** Https on github.com only, so a saved or forged session can't send you anywhere else (AC-16). */
  url: GitHubLinkSchema,
  /** `owner/name`, as the dialog and the lines say it. */
  repository: GitHubRepositorySchema,
  openedAt: z.iso.datetime(),
});
export type SessionPullRequest = z.infer<typeof SessionPullRequestSchema>;

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
  /** The calls waiting for your answer, oldest first (spec 012). A session saved before spec 012 has none. */
  approvals: z.array(SessionApprovalSchema).default([]),
  /** The Ticket tab (spec 013). Null for a session saved before spec 013 until the server reads its brief. */
  ticket: SessionTicketSchema.nullable().default(null),
  followUp: SessionFollowUpSchema.default({ kind: 'open' }),
  /** Where the worktree is, for Open in VS Code or Cursor (spec 013, Q9); null before it's made. */
  worktreePath: z.string().min(1).nullable().default(null),
  /**
   * Claude's working time before the current run, added up over the first run and every follow-up (spec 013,
   * Q3). The time beside "Claude's progress" adds the current run's, from `runStartedAt`, while it works.
   */
  workedMs: z.int().nonnegative().default(0),
  /** When the current run started; null while Claude isn't working. */
  runStartedAt: z.iso.datetime().nullable().default(null),
  /** Null until you create the pull request (spec 014); a session saved before spec 014 has none. */
  pullRequest: SessionPullRequestSchema.nullable().default(null),
});
export type Session = z.infer<typeof SessionSchema>;

/** Ship's start (spec 011): Claude on a ticket. `repositoryId` picks the folder when its project has several (Q3). */
export const TicketStartSchema = z.object({
  ticketKey: JiraIssueKeySchema,
  repositoryId: RepositoryIdSchema.optional(),
});
export type TicketStart = z.infer<typeof TicketStartSchema>;

/** A follow-up, or the composer's message, holds at most this many characters (spec 013, spec 015). */
export const mostMessageCharacters = 10_000;

/**
 * What one session can take from the composer (spec 022, Q5): its tickets, pull requests and files, and the skills
 * its message names. A file has no size or type limit: Claude reads it where it is.
 */
export const composerLimits = { tickets: 10, pullRequests: 10, files: 20, skills: 5 } as const;

/** GitHub's own rules for a user or organisation and for a repository's name, so neither can be read as a path. */
const GitHubOwnerSchema = z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/);
const GitHubRepositoryNameSchema = z.string().regex(/^(?!\.\.?$)[A-Za-z0-9._-]{1,100}$/);

/**
 * One thing the composer adds to the brief (spec 015). The server reads a ticket from Jira and a pull request
 * from GitHub at Send; a file is its path on this computer, which Claude reads where it is (spec 022, Q4). A file
 * whose name looks like a secret is never one.
 */
export const ComposerChipSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('jira'), key: JiraIssueKeySchema }),
  z.object({
    kind: z.literal('pull_request'),
    owner: GitHubOwnerSchema,
    name: GitHubRepositoryNameSchema,
    number: z.int().positive(),
  }),
  z.object({
    kind: z.literal('file'),
    path: FilePathSchema.refine((path) => !looksLikeSecret(path), { message: 'A file that looks like a secret.' }),
  }),
]);
export type ComposerChip = z.infer<typeof ComposerChipSchema>;

function pullRequestId(chip: Extract<ComposerChip, { kind: 'pull_request' }>): string {
  return `${chip.owner}/${chip.name}#${String(chip.number)}`.toLowerCase();
}

/**
 * The composer's start (spec 015): your message, the folder, and the chips in the order you added them. The
 * message can be empty only when a ticket is the brief (AC-8). Without `repositoryId`, the server picks the
 * ticket's project's only folder, or asks (Q7).
 */
export const ComposerStartSchema = z
  .object({
    message: z.string().trim().max(mostMessageCharacters),
    repositoryId: RepositoryIdSchema.optional(),
    context: z.array(ComposerChipSchema),
  })
  .superRefine(({ message, context }, check) => {
    const tickets = context.filter((chip) => chip.kind === 'jira');
    const pulls = context.filter((chip) => chip.kind === 'pull_request');
    const files = context.filter((chip) => chip.kind === 'file');
    if (tickets.length > composerLimits.tickets) check.addIssue({ code: 'custom', message: 'Ten tickets at most.' });
    if (new Set(tickets.map((chip) => chip.key)).size < tickets.length)
      check.addIssue({ code: 'custom', message: 'The same ticket twice.' });
    if (pulls.length > composerLimits.pullRequests)
      check.addIssue({ code: 'custom', message: 'Ten pull requests at most.' });
    if (new Set(pulls.map(pullRequestId)).size < pulls.length)
      check.addIssue({ code: 'custom', message: 'The same pull request twice.' });
    if (files.length > composerLimits.files) check.addIssue({ code: 'custom', message: 'Twenty files at most.' });
    if (new Set(files.map((chip) => chip.path)).size < files.length)
      check.addIssue({ code: 'custom', message: 'The same file twice.' });
    if (message === '' && tickets.length === 0)
      check.addIssue({ code: 'custom', message: 'A message, or a ticket as the brief.' });
  });
export type ComposerStart = z.infer<typeof ComposerStartSchema>;

/** POST /api/sessions: Ship's start on a ticket, or the composer's (spec 015). */
export const StartSessionRequestSchema = z.union([TicketStartSchema, ComposerStartSchema]);
export type StartSessionRequest = z.infer<typeof StartSessionRequestSchema>;

/**
 * The answer to POST /api/sessions. A ticket with a live session answers `existing` with it. A start
 * that can't happen creates nothing and says why (Q4): no folder for the project, a folder still to
 * pick, Claude Code signed out, three sessions already working (Q11), or a chip that couldn't be read.
 */
export const StartSessionAnswerSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('started'), sessionId: SessionIdSchema }),
  z.object({ result: z.literal('existing'), sessionId: SessionIdSchema }),
  z.object({
    result: z.literal('cannot_start'),
    reason: z.enum(['no_folder', 'choose_folder', 'signed_out', 'too_many']),
  }),
  /**
   * The composer's start (spec 015, AC-21): Jira or GitHub couldn't give a chip, so nothing was made. `chip` is
   * its place in `context`.
   */
  z.object({
    result: z.literal('context_failed'),
    chip: z.int().nonnegative(),
    problem: z.enum(['not_connected', 'not_found', 'unreachable', 'other']),
  }),
]);
export type StartSessionAnswer = z.infer<typeof StartSessionAnswerSchema>;
export type CannotStartReason = Extract<StartSessionAnswer, { result: 'cannot_start' }>['reason'];
export type ContextProblem = Extract<StartSessionAnswer, { result: 'context_failed' }>['problem'];

/** POST /api/sessions/:id/approvals/:approvalId: your answer to a waiting call (spec 012). */
export const ApprovalDecisionSchema = z.enum(['allow_once', 'always_allow', 'deny']);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const RespondToApprovalRequestSchema = z.object({ decision: ApprovalDecisionSchema });
export type RespondToApprovalRequest = z.infer<typeof RespondToApprovalRequestSchema>;

/** POST /api/sessions/:id/messages: what you typed in the follow-up box, exactly as Claude gets it (spec 013). */
export const SendMessageRequestSchema = z.object({
  text: z.string().trim().min(1).max(mostMessageCharacters),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

/**
 * The answer to a follow-up. One that can't go says why, and nothing is sent (AC-14, AC-15): three sessions
 * already working, the changes discarded, Claude never started, or the ticket has a newer live session.
 */
export const SendMessageAnswerSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('sent') }),
  z.object({
    result: z.literal('cannot_send'),
    reason: z.enum(['too_many', 'discarded', 'never_started', 'newer_session']),
  }),
]);
export type SendMessageAnswer = z.infer<typeof SendMessageAnswerSchema>;
export type CannotSendReason = Extract<SendMessageAnswer, { result: 'cannot_send' }>['reason'];
