import { z } from 'zod';
import { AgentChoiceSchema } from './agent-models.ts';
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

/**
 * The kinds of step a session goes through (spec 042): never shown, they say what moves a step and who may. The
 * first five were every session's steps before spec 042. A Build on your pull request ends at `pull_request`, shown as
 * Push (spec 031).
 */
export const SessionStepSchema = z.enum(['setup', 'plan', 'build', 'test', 'run', 'answer', 'review', 'pull_request']);

/**
 * How a session works (spec 026): `build` makes a worktree and a branch, where Claude changes files; `ask` reads the
 * folder where it is and changes nothing, so it has no worktree, branch, Changes or pull request.
 */
export const SessionModeSchema = z.enum(['ask', 'build']);
export type SessionMode = z.infer<typeof SessionModeSchema>;
export type SessionStep = z.infer<typeof SessionStepSchema>;

/** A step's words (spec 042, Q5): Claude's own, 1 to 3 words, at most 16 characters, starting with a capital. */
export const mostStepLabelCharacters = 16;
export const StepLabelSchema = z
  .string()
  .max(mostStepLabelCharacters, `At most ${String(mostStepLabelCharacters)} characters.`)
  .regex(
    /^\p{Lu}[\p{L}\p{N}]*(?: [\p{L}\p{N}]+){0,2}$/u,
    '1 to 3 words of letters and digits, starting with a capital.',
  );

export const SessionStepItemSchema = z.object({ kind: SessionStepSchema, label: StepLabelSchema });
export type SessionStepItem = z.infer<typeof SessionStepItemSchema>;

/** The most steps a session shows (spec 042, Q5), a pull request's included. */
export const mostSessionSteps = 5;

/**
 * Steps as Claude may give them (spec 042, Q5), refused whole when one rule breaks: 1 to 5, no two with the same
 * words or kind, and a pull request only as the last.
 */
export const SessionStepsSchema = z
  .array(SessionStepItemSchema)
  .min(1, 'At least one step.')
  .max(mostSessionSteps, `At most ${String(mostSessionSteps)} steps, a pull request included.`)
  .superRefine((steps, check) => {
    const issue = (message: string) => {
      check.addIssue({ code: 'custom', message });
    };
    const labels = steps.map((step) => step.label);
    for (const label of new Set(labels.filter((label, index) => labels.indexOf(label) !== index)))
      issue(`Two steps are both called "${label}".`);
    const kinds = steps.map((step) => step.kind);
    for (const kind of new Set(kinds.filter((kind, index) => kinds.indexOf(kind) !== index)))
      issue(`Two steps are both of kind ${kind}.`);
    if (kinds.includes('pull_request') && kinds.at(-1) !== 'pull_request')
      issue('A pull_request step can only be the last.');
  });

/** What a Build session is for, as Orynx read your ask (spec 042): edit code, run something, or answer. */
export const SessionIntentSchema = z.enum(['change', 'run', 'answer']);
export type SessionIntent = z.infer<typeof SessionIntentSchema>;

/** Where a branch name's shape came from (spec 042, Q3): first match wins, in this order. */
export const BranchFromSchema = z.enum(['message', 'repo_rules', 'your_branches', 'orynx']);
export type BranchFrom = z.infer<typeof BranchFromSchema>;

/**
 * Where a Build works (spec 031): a new branch of its own, or your open pull request's own branch, whose last step
 * is Push rather than Pull request.
 */
export const SessionWorkOnSchema = z.enum(['new_branch', 'pull_request']);
export type SessionWorkOn = z.infer<typeof SessionWorkOnSchema>;

/** What a session was started from: shown as `PROJ-1423` or `PR #2836` under its title. */
export const SessionSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('jira'), key: z.string().min(1) }),
  z.object({ kind: z.literal('pull_request'), number: z.int().positive() }),
]);
export type SessionSource = z.infer<typeof SessionSourceSchema>;

/**
 * What a finished session is ready for, from what Claude did (spec 031: the stepper follows Claude's work, and so does
 * "Done"): a pull request, a push to your pull request's own branch, or nothing, when it was an Ask or Claude edited
 * no file. The server works it out each time it sends a session.
 */
export const SessionReadySchema = z.enum(['pull_request', 'push', 'nothing']);
export type SessionReady = z.infer<typeof SessionReadySchema>;

/** One row in the sidebar and in the full session list. */
export const SessionSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  state: SessionStateSchema,
  /** A session saved before this was kept with none: the server works it out as it sends one. */
  ready: SessionReadySchema.default('pull_request'),
  /** Null when the session was started from the composer without a ticket or pull request. */
  source: SessionSourceSchema.nullable(),
  /** Last activity; lists are ordered by it, newest first. */
  updatedAt: z.iso.datetime(),
  /** When you pinned it to the top of the lists, which keep pins in that order (spec 039); null when it isn't. */
  pinnedAt: z.iso.datetime().nullable().default(null),
  /** Ask or Build (spec 026); a session saved before it was a Build. In the summary for Sessions' Kind filter (spec 039). */
  mode: SessionModeSchema.default('build'),
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
  /** Only the pinned sessions, every one in the order they were pinned, or only the rest (spec 039). */
  pinned: z.stringbool().optional(),
});
export type SessionListQuery = z.infer<typeof SessionListQuerySchema>;

/** The most characters a session's title may have once you rename it (spec 039). */
export const sessionTitleLimit = 200;

/** PATCH /api/sessions/:id (spec 039): a new title, trimmed, or a pin. It never changes the activity time. */
export const SessionChangeRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(sessionTitleLimit).optional(),
    pinned: z.boolean().optional(),
  })
  .refine((change) => change.title !== undefined || change.pinned !== undefined, 'Change the title or the pin.');
export type SessionChangeRequest = z.infer<typeof SessionChangeRequestSchema>;

/**
 * Query string of DELETE /api/sessions/:id (spec 039): `branch=true` deletes the session's branch too. Delete is the one
 * way to let a session go since it took Discard's place (the user's call, 20 Oct 2026); the branch stays unless asked.
 */
export const SessionDeleteQuerySchema = z.object({ branch: z.stringbool().optional() });
export type SessionDeleteQuery = z.infer<typeof SessionDeleteQuerySchema>;

/** The id a new session gets: 16 hex characters, so it's always a safe folder name under DEVHUB_HOME. */
export const SessionIdSchema = z.string().regex(/^[0-9a-f]{16}$/);
export type SessionId = z.infer<typeof SessionIdSchema>;

/** A step in Claude's progress is `running` until the next kind of work starts, then `done` (spec 011, AC-4). */
export const SessionActivityStateSchema = z.enum(['running', 'done']);
export type SessionActivityState = z.infer<typeof SessionActivityStateSchema>;

const ActivityBaseSchema = z.object({ id: z.string().min(1), state: SessionActivityStateSchema });
/** Paths relative to the worktree, in the order Claude first touched them. */
const FilesSchema = z.array(z.string().min(1));

/** Why Orynx refused a call (see the `refused` step); a refused command keeps it too (spec 036). */
export const RefusalReasonSchema = z.enum(['outside_worktree', 'ask_everything', 'push', 'background', 'ask_session']);
export type RefusalReason = z.infer<typeof RefusalReasonSchema>;

/**
 * One step in "Claude's progress". It's data, not words: the app says each kind in its own words
 * (spec 011, Q10a), so the server never holds copy.
 */
export const SessionActivitySchema = z.discriminatedUnion('kind', [
  /**
   * Orynx made the branch and the worktree, from `base`; `fetched` is false when the fetch failed (Q1a). With
   * `pullRequest`, it made the worktree from that pull request's own branch, and no branch (spec 031).
   */
  /**
   * Orynx read your ask before anything else (spec 042): running while it reads; done with the `intent`, or with none
   * when the read failed. `base` is where the worktree starts, `missingBase` a branch you named that isn't on
   * `origin`. `branch` is the name the first edit will make, and `suggested` what the read gave instead when Orynx
   * couldn't use it (`branchNote`).
   */
  ActivityBaseSchema.extend({
    kind: z.literal('reading'),
    intent: SessionIntentSchema.nullable(),
    base: z.string().min(1).nullable(),
    missingBase: z.string().min(1).nullable(),
    branch: z.string().min(1).nullable(),
    branchFrom: BranchFromSchema.nullable(),
    suggested: z.string().min(1).nullable(),
    branchNote: z.enum(['unusable', 'taken']).nullable(),
  }),
  /** Claude changed the steps to come (spec 042), with its reason. */
  ActivityBaseSchema.extend({
    kind: z.literal('steps_changed'),
    from: z.array(SessionStepItemSchema),
    to: z.array(SessionStepItemSchema),
    reason: z.string(),
  }),
  /** Orynx made the session's branch at Claude's first edit or at Create pull request (spec 042). */
  ActivityBaseSchema.extend({ kind: z.literal('branch_made'), branch: z.string().min(1), from: BranchFromSchema }),
  /**
   * A server of the session's (spec 042): Claude started it, you or Claude stopped it, or it ended by itself. `port`
   * is where it listened; null when it never did.
   */
  ActivityBaseSchema.extend({
    kind: z.literal('server'),
    event: z.enum(['started', 'stopped', 'exited']),
    port: z.int().positive().max(65_535).nullable(),
    command: z.string().min(1),
  }),
  ActivityBaseSchema.extend({
    kind: z.literal('worktree'),
    /** Null since spec 042: the branch is made at the first edit (`branch_made`). */
    branch: z.string().min(1).nullable(),
    base: z.string().min(1),
    fetched: z.boolean(),
    pullRequest: z.int().positive().optional(),
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
    /** The skills your message named, as `/review` (spec 022, AC-53); none before spec 022. */
    skills: z.array(z.string().min(1)).default([]),
    /**
     * The folders of your Orynx skills among them (spec 023), for Settings › Skills' use counts. Absent means none,
     * as in every session from before spec 023. A folder's skill with the same name isn't one.
     */
    orynxSkills: z.array(z.string().min(1)).optional(),
  }),
  ActivityBaseSchema.extend({ kind: z.literal('explore'), files: FilesSchema }),
  /** The plan's items, from Claude's to-do list. */
  ActivityBaseSchema.extend({ kind: z.literal('plan'), items: z.array(z.string().min(1)) }),
  ActivityBaseSchema.extend({ kind: z.literal('edit'), files: FilesSchema }),
  /**
   * A call Orynx refused: outside the worktree (spec 011, Q6), a push or a background command (spec 012,
   * Q7), or any edit or command in an Ask session (spec 026). `path` holds the command for a `run`.
   * `ask_everything` is from before spec 012, when an edit in Ask before everything was refused instead of asked.
   */
  ActivityBaseSchema.extend({
    kind: z.literal('refused'),
    access: z.enum(['read', 'edit', 'run']),
    reason: RefusalReasonSchema,
    path: z.string().min(1),
  }),
  /** A call waiting for your answer (spec 012): `text` is Claude's line about the command, or the edit's path. */
  ActivityBaseSchema.extend({
    kind: z.literal('waiting'),
    approvalId: z.string().min(1),
    about: z.enum(['command', 'edit', 'ticket', 'server', 'jira']),
    text: z.string().nullable(),
  }),
  /** Commands that ran, in the order they were allowed. */
  ActivityBaseSchema.extend({ kind: z.literal('command'), commands: z.array(z.string().min(1)) }),
  /** You denied a call: `text` is the command, the edit's path, or the ticket's key (spec 037). */
  ActivityBaseSchema.extend({
    kind: z.literal('denied'),
    about: z.enum(['command', 'edit', 'ticket', 'server', 'jira']),
    text: z.string().min(1),
  }),
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
  /**
   * Claude used one of Orynx's ticket tools (spec 037, AC-28, AC-29): listed the tickets, read, made, changed or
   * deleted one. `fields` are those a change set; `status`, the one it moved the ticket to. The key is an Orynx one.
   */
  ActivityBaseSchema.extend({
    kind: z.literal('ticket'),
    action: z.enum(['listed', 'read', 'created', 'updated', 'deleted']),
    key: JiraIssueKeySchema.nullable(),
    title: z.string().min(1).nullable(),
    fields: z.array(z.enum(['title', 'description', 'type', 'priority', 'status', 'dueDate'])).default([]),
    status: TicketColumnSchema.nullable().default(null),
  }),
  /**
   * Claude used one of Orynx's Jira tools (spec 044): read the projects, searched (`found` issues, `more` when Jira found
   * more), read an issue (its `summary`), or, once allowed, commented on one, moved it `to` a status, or assigned it
   * `to` `me` or `nobody`. Only the fields its action needs are set; never anything about a person.
   */
  ActivityBaseSchema.extend({
    kind: z.literal('jira'),
    action: z.enum(['projects', 'searched', 'read', 'commented', 'moved', 'assigned']),
    key: JiraIssueKeySchema.nullable().default(null),
    summary: z.string().nullable().default(null),
    found: z.int().nonnegative().nullable().default(null),
    more: z.boolean().default(false),
    to: z.string().min(1).nullable().default(null),
  }),
  /** You pressed Stop Claude. */
  ActivityBaseSchema.extend({ kind: z.literal('stopped') }),
  /** Orynx closed while Claude was working (AC-14). */
  ActivityBaseSchema.extend({ kind: z.literal('interrupted') }),
  /**
   * The worktree and this branch were deleted (AC-10). `kept`: the branch is a pull request's, so only the worktree
   * went (spec 031).
   */
  ActivityBaseSchema.extend({
    kind: z.literal('discarded'),
    branch: z.string().min(1),
    kept: z.boolean().default(false),
  }),
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

/**
 * The change Claude asks to make in Jira (spec 044): a comment in Markdown; a move to the status `to`, from `from`
 * (null when Jira didn't say); or an assignment to you or to nobody.
 */
export const JiraChangeAskSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('comment'), text: z.string().min(1) }),
  z.object({ action: z.literal('transition'), from: z.string().min(1).nullable(), to: z.string().min(1) }),
  z.object({ action: z.literal('assign'), to: z.enum(['me', 'nobody']) }),
]);
export type JiraChangeAsk = z.infer<typeof JiraChangeAskSchema>;

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
  /**
   * Claude asks to start a server (spec 042, Q7): it runs in a Terminal tab, outside Claude's sandbox, so it always
   * asks. `folder` is where in the worktree, `.` for its top; `alwaysAllow` the entry that allows it in this repository.
   */
  ApprovalBaseSchema.extend({
    kind: z.literal('server'),
    command: z.string().min(1),
    folder: z.string().min(1),
    alwaysAllow: z.string().min(1),
  }),
  /** Claude asks to delete one of Orynx's own tickets (spec 037, AC-30): Allow once or Deny, never Always allow. */
  ApprovalBaseSchema.extend({
    kind: z.literal('ticket'),
    key: JiraIssueKeySchema,
    /** Null when the ticket was already gone when Claude asked. */
    title: z.string().min(1).nullable(),
  }),
  /**
   * Claude asks to change a Jira issue (spec 044, AC-13, AC-14): Allow once, Always allow, which turns Claude changes
   * Jira on in Settings › Coding agent, or Deny.
   */
  ApprovalBaseSchema.extend({ kind: z.literal('jira'), key: JiraIssueKeySchema, change: JiraChangeAskSchema }),
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
  /** An Orynx ticket deleted since the session started (spec 037, AC-19); a Jira ticket never is. */
  deleted: z.boolean().default(false),
});
export type SessionTicket = z.infer<typeof SessionTicketSchema>;

/**
 * Whether the follow-up box takes a message (spec 013, Q1), or why not: the changes are discarded, or Claude
 * never started. Three sessions already working is said only when you send, because it can change at any moment.
 */
export const SessionFollowUpSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('open') }),
  z.object({ kind: z.literal('discarded') }),
  z.object({ kind: z.literal('never_started') }),
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

/** GET /api/sessions/:id: everything the Session screen shows (spec 011). */
export const SessionSchema = SessionSummarySchema.extend({
  /** The folder Claude works in, as Settings › Repositories shows it; null for an Ask with no folder (spec 031). */
  folder: z.object({ name: z.string().min(1), displayPath: z.string().min(1) }).nullable(),
  /** Null until the worktree is made. */
  branch: z.string().min(1).nullable(),
  /** Where the stepper is (AC-7): the kind of the current step. */
  step: SessionStepSchema,
  /**
   * The session's steps in order, Claude's words (spec 042). None for an Ask, and for a session saved before spec
   * 042, which the server sends with the five it always had.
   */
  steps: z.array(SessionStepItemSchema).max(mostSessionSteps).default([]),
  /** What the session is for (spec 042); null for an Ask, a failed read, or a session saved before spec 042. */
  intent: SessionIntentSchema.nullable().default(null),
  /** Where the branch name's shape came from (spec 042); null until the branch is made, or before spec 042. */
  branchFrom: BranchFromSchema.nullable().default(null),
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
  /**
   * Every ticket, pull request and file Claude was sent, in the order added: the composer's chips at the start,
   * then each follow-up's new ones. A session saved before this kept none, so it shows its ticket alone.
   */
  context: z.array(ComposerChipSchema).default([]),
  /** A new branch, or your pull request's own (spec 031); a session saved before it had a new branch. */
  workOn: SessionWorkOnSchema.default('new_branch'),
  /** The steps the stepper passed over when Claude finished without them (spec 031, Q5); none before it. */
  skipped: z.array(SessionStepSchema).default([]),
  /**
   * Whether the Terminal opens on this session (spec 036, Q9): a Build whose worktree is there, on a computer that
   * isn't Windows. A session saved before spec 036 is read as none until the server says.
   */
  terminal: z.boolean().default(false),
  /**
   * Whether Push changes has anything to send: false once origin's branch has the worktree's last commit, whoever
   * pushed it, and nothing waits to be committed. The server works it out as it sends a session.
   */
  unpushed: z.boolean().default(true),
});
export type Session = z.infer<typeof SessionSchema>;

/**
 * The steps a Build session shows (spec 042): its own, or the five every session had before spec 042, the last
 * Push on your pull request's own branch (spec 031).
 */
export function stepsOf(session: Pick<Session, 'steps' | 'workOn'>): SessionStepItem[] {
  if (session.steps.length > 0) return session.steps;
  return [
    { kind: 'plan', label: 'Plan' },
    { kind: 'build', label: 'Build' },
    { kind: 'test', label: 'Test' },
    { kind: 'review', label: 'Review' },
    { kind: 'pull_request', label: session.workOn === 'pull_request' ? 'Push' : 'Pull request' },
  ];
}

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
export const composerLimits = { tickets: 100, pullRequests: 100, files: 100, skills: 5 } as const;

function pullRequestId(chip: Extract<ComposerChip, { kind: 'pull_request' }>): string {
  return `${chip.owner}/${chip.name}#${String(chip.number)}`.toLowerCase();
}

/** Each kind within its limit (spec 022, Q5), and nothing twice: for the composer's start and a follow-up's. */
function checkChips(context: readonly ComposerChip[], check: z.RefinementCtx): void {
  const tickets = context.filter((chip) => chip.kind === 'jira');
  const pulls = context.filter((chip) => chip.kind === 'pull_request');
  const files = context.filter((chip) => chip.kind === 'file');
  const issue = (message: string) => {
    check.addIssue({ code: 'custom', message });
  };
  if (tickets.length > composerLimits.tickets) issue(`${String(composerLimits.tickets)} tickets at most.`);
  if (new Set(tickets.map((chip) => chip.key)).size < tickets.length) issue('The same ticket twice.');
  if (pulls.length > composerLimits.pullRequests)
    issue(`${String(composerLimits.pullRequests)} pull requests at most.`);
  if (new Set(pulls.map(pullRequestId)).size < pulls.length) issue('The same pull request twice.');
  if (files.length > composerLimits.files) issue(`${String(composerLimits.files)} files at most.`);
  if (new Set(files.map((chip) => chip.path)).size < files.length) issue('The same file twice.');
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
    // The model and effort the composer picked; left out, Claude Code's own default.
    ...AgentChoiceSchema.shape,
    /** Ask or Build (spec 026); left out, Build, as before. */
    mode: SessionModeSchema.optional(),
    /** Start beside the ticket's or pull request's live session instead of answering `existing` (spec 047). */
    another: z.literal(true).optional(),
  })
  .superRefine(({ message, context }, check) => {
    checkChips(context, check);
    if (message === '' && !context.some((chip) => chip.kind === 'jira'))
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
export const SendMessageRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(mostMessageCharacters),
    /** Tickets, pull requests and files added to this follow-up, read at Send as the composer's are at start. */
    context: z.array(ComposerChipSchema).default([]),
    // The model and effort for Claude's next run; left out, Claude Code's own default (spec 025).
    ...AgentChoiceSchema.shape,
  })
  .superRefine(({ context }, check) => {
    checkChips(context, check);
  });
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;
/** A follow-up as the page gives it: `context` may be left out. */
export type SendMessageInput = z.input<typeof SendMessageRequestSchema>;

/**
 * The answer to a follow-up. One that can't go says why, and nothing is sent (AC-14, AC-15): three sessions
 * already working, the changes discarded, or Claude never started.
 */
export const SendMessageAnswerSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('sent') }),
  z.object({
    result: z.literal('cannot_send'),
    reason: z.enum(['too_many', 'discarded', 'never_started']),
  }),
  /** A chip added to the follow-up that Jira, GitHub or the computer couldn't give, by its place, as at start. */
  z.object({
    result: z.literal('context_failed'),
    chip: z.int().nonnegative(),
    problem: z.enum(['not_connected', 'not_found', 'unreachable', 'other']),
  }),
]);
export type SendMessageAnswer = z.infer<typeof SendMessageAnswerSchema>;
export type CannotSendReason = Extract<SendMessageAnswer, { result: 'cannot_send' }>['reason'];
