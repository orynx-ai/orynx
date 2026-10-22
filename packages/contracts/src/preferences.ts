import { z } from 'zod';
import { AllowedCommandSchema } from './commands.ts';
import { RepositoryIdSchema, type RepositoryId } from './repositories.ts';

/**
 * The three permission modes saved before spec 026 (spec 005, 012). Read only to carry an older setting over to
 * `permissions`; nothing saves one now.
 */
export const PermissionModeSchema = z.enum(['ask_everything', 'edit_freely_ask_commands', 'edit_and_run_allowed']);
export type PermissionMode = z.infer<typeof PermissionModeSchema>;

/**
 * Settings › Coding agent: what Claude may do without asking, one row for each kind of call (spec 026, the user's
 * call of 20 Oct 2026). Each row decides its own kind, so a network command follows `network` whatever `commands`
 * says. A call allowed by `network`, `deleteOutside`, `push` or `pullRequest` runs outside the sandbox, that once.
 */
export const PermissionsSchema = z.object({
  /** File edits in the session's worktree. Edits outside it are always refused. */
  edits: z.enum(['ask', 'allow']),
  /** Commands in the sandbox: every one asks, those on the allowed list run, or every one runs. */
  commands: z.enum(['ask', 'allowed_list', 'any']),
  /** Commands that reach the network, such as npm install or curl. */
  network: z.enum(['ask', 'allow']),
  /** Commands that delete outside the worktree. */
  deleteOutside: z.enum(['ask', 'allow']),
  /** Commands Claude asks to run outside the sandbox. */
  unsandboxed: z.enum(['ask', 'allow']),
  /** `git push origin <the session's branch>`, never forced and never another branch. */
  push: z.enum(['never', 'ask', 'allow']),
  /** `gh pr create` for the session's branch. */
  pullRequest: z.enum(['never', 'ask', 'allow']),
});
export type Permissions = z.infer<typeof PermissionsSchema>;

/** What a fresh Orynx starts with: the recommended mode before spec 026, edit freely and ask before commands. */
export const defaultPermissions: Permissions = {
  edits: 'allow',
  commands: 'ask',
  network: 'ask',
  deleteOutside: 'ask',
  unsandboxed: 'ask',
  push: 'never',
  pullRequest: 'never',
};

/** An older saved mode as rows: it set only how edits and commands ask, so every other row keeps its default. */
export function permissionsFromMode(mode: PermissionMode): Permissions {
  if (mode === 'ask_everything') return { ...defaultPermissions, edits: 'ask' };
  if (mode === 'edit_and_run_allowed') return { ...defaultPermissions, commands: 'allowed_list' };
  return defaultPermissions;
}

/** Settings › Coding agent's Editor: where Open in opens a session's worktree (spec 013, Q9). */
export const EditorSchema = z.enum(['vscode', 'cursor']);
export type Editor = z.infer<typeof EditorSchema>;

/**
 * Settings › Inbox rules: one per row of the product spec's "What counts as needs you" table. Home
 * (spec 007) applies them. Slack's rule and its wait time join in spec 016 (spec 005, Q6).
 */
export const InboxRuleIdSchema = z.enum([
  'jira_assigned',
  'review_requested',
  'checks_failing',
  'unresolved_comments',
  'session_waiting',
]);
export type InboxRuleId = z.infer<typeof InboxRuleIdSchema>;

/** Whether each rule is on. Every rule is always present. */
export const InboxRulesSchema = z.record(InboxRuleIdSchema, z.boolean());
export type InboxRules = z.infer<typeof InboxRulesSchema>;

/** GET /api/preferences, and the answer to PATCH: the saved values, or the defaults for anything never set. */
export const PreferencesSchema = z.object({
  /** All repositories' rows: what every repository without its own rows follows. */
  permissions: PermissionsSchema,
  /** The repositories with rows of their own (spec 041), which they keep whatever All repositories says. */
  repositoryPermissions: z.record(RepositoryIdSchema, PermissionsSchema),
  inboxRules: InboxRulesSchema,
  /** Commands that run without asking while `permissions.commands` is `allowed_list` (spec 012), as saved, in order. */
  allowedCommands: z.array(z.string().min(1)),
  editor: EditorSchema,
  /** Claude comments on, moves and assigns Jira issues without asking first (spec 044, Q8); off, each one asks. */
  jiraChanges: z.boolean(),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

/** What a fresh DevHub starts with (product spec, Settings table). */
export const defaultPreferences: Preferences = {
  permissions: defaultPermissions,
  repositoryPermissions: {},
  inboxRules: {
    jira_assigned: true,
    review_requested: true,
    checks_failing: true,
    unresolved_comments: true,
    session_waiting: true,
  },
  allowedCommands: [],
  editor: 'vscode',
  jiraChanges: false,
};

/**
 * PATCH /api/preferences: one change, as the person makes it. Only the rows and rules that changed are sent, and
 * one allow-list entry at a time, so two quick changes in a row can't undo each other.
 */
export const PreferencesChangeSchema = z
  .strictObject({
    permissions: z.strictObject(PermissionsSchema.partial().shape).optional(),
    /** The repository whose own rows `permissions` changes (spec 041); left out, All repositories'. */
    repository: RepositoryIdSchema.optional(),
    /** A repository that drops its own rows and follows All repositories again. */
    followAll: RepositoryIdSchema.optional(),
    inboxRules: z.partialRecord(InboxRuleIdSchema, z.boolean()).optional(),
    /** One command to add to the allow list, read as Settings reads it (spec 012, Q8f). */
    allowCommand: AllowedCommandSchema.optional(),
    /** One entry to take off the list, as it was saved. */
    disallowCommand: z.string().min(1).optional(),
    editor: EditorSchema.optional(),
    jiraChanges: z.boolean().optional(),
  })
  .refine((change) => Object.values(change).some((value) => value !== undefined), {
    message: 'Send a permission, at least one rule, a command, the editor, or Claude changes Jira.',
  })
  .refine((change) => change.repository === undefined || change.permissions !== undefined, {
    message: 'Send the permissions to change for that repository.',
  });
export type PreferencesChange = z.infer<typeof PreferencesChangeSchema>;

/** The rows a session in this repository follows (spec 041): its own, else All repositories'. */
export function permissionsFor(
  preferences: Pick<Preferences, 'permissions' | 'repositoryPermissions'>,
  repository: RepositoryId | null,
): Permissions {
  return (repository === null ? undefined : preferences.repositoryPermissions[repository]) ?? preferences.permissions;
}
