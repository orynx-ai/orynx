import { z } from 'zod';
import { AllowedCommandSchema } from './commands.ts';

/**
 * Settings › Coding agent: what Claude may do without asking (product spec, "Permission modes").
 * Saved now (spec 005) and enforced once sessions run (specs 011 and 012).
 */
export const PermissionModeSchema = z.enum(['ask_everything', 'edit_freely_ask_commands', 'edit_and_run_allowed']);
export type PermissionMode = z.infer<typeof PermissionModeSchema>;

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
  permissionMode: PermissionModeSchema,
  inboxRules: InboxRulesSchema,
  /** Commands that run without asking in "Edit files and run allowed commands" (spec 012), as saved, in the order they were added. */
  allowedCommands: z.array(z.string().min(1)),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

/** What a fresh DevHub starts with (product spec, Settings table). */
export const defaultPreferences: Preferences = {
  permissionMode: 'edit_freely_ask_commands',
  inboxRules: {
    jira_assigned: true,
    review_requested: true,
    checks_failing: true,
    unresolved_comments: true,
    session_waiting: true,
  },
  allowedCommands: [],
};

/**
 * PATCH /api/preferences: one change, as the person makes it. Only the rules that changed are sent, and
 * one allow-list entry at a time, so two quick changes in a row can't undo each other.
 */
export const PreferencesChangeSchema = z
  .strictObject({
    permissionMode: PermissionModeSchema.optional(),
    inboxRules: z.partialRecord(InboxRuleIdSchema, z.boolean()).optional(),
    /** One command to add to the allow list, read as Settings reads it (spec 012, Q8f). */
    allowCommand: AllowedCommandSchema.optional(),
    /** One entry to take off the list, as it was saved. */
    disallowCommand: z.string().min(1).optional(),
  })
  .refine((change) => Object.values(change).some((value) => value !== undefined), {
    message: 'Send the mode, at least one rule, or a command.',
  });
export type PreferencesChange = z.infer<typeof PreferencesChangeSchema>;
