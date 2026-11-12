import { z } from 'zod';

export const IntegrationIdSchema = z.enum(['jira', 'github', 'slack', 'discord']);
export type IntegrationId = z.infer<typeof IntegrationIdSchema>;

/** Settings › Connections shows one of these per tool. */
export const ConnectionStateSchema = z.enum(['connected', 'not_connected', 'needs_admin_approval', 'error']);
export type ConnectionState = z.infer<typeof ConnectionStateSchema>;

export const IntegrationStatusSchema = z.object({
  state: ConnectionStateSchema,
  /** One line for the connection row, for example "Personal API token for your-team.atlassian.net". */
  detail: z.string().nullable(),
  /** Who Orynx is signed in as: the Jira email, the GitHub login (spec 030). Left out while unknown. */
  account: z.string().optional(),
  /** When Orynx last asked the tool (spec 030). Left out until it has. */
  checkedAt: z.iso.datetime().optional(),
});
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

/** POST /api/<tool>/connection/check: the tool asked now, and how long it took to answer (spec 030). */
export const ConnectionCheckSchema = z.object({
  status: IntegrationStatusSchema,
  ms: z.int().nonnegative(),
});
export type ConnectionCheck = z.infer<typeof ConnectionCheckSchema>;

/** Whether an agent is signed in on this computer, so sessions can start on it. */
export const AgentStatusSchema = z.object({
  connected: z.boolean(),
});
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

/** The person using DevHub, for the sidebar footer. */
export const UserSchema = z.object({
  /** From `git config user.name` until a connection gives a better one; null when nobody is known. */
  name: z.string().regex(/\S/, 'a name needs at least one visible character').nullable(),
});
export type User = z.infer<typeof UserSchema>;

/** GET /api/status: what the hub is connected to right now. */
/**
 * How close you are to one of Claude's plan limits, as Claude Code last said while a session ran (spec 057, E): the
 * 5-hour or a weekly window, how much of it is used, and when it resets, if Claude Code said.
 */
export const ClaudeLimitSchema = z.object({
  window: z.enum(['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet']),
  usedPercent: z.int().min(0).max(100),
  resetsAt: z.iso.datetime().nullable(),
});
export type ClaudeLimit = z.infer<typeof ClaudeLimitSchema>;

export const StatusSchema = z.object({
  version: z.string(),
  user: UserSchema,
  /** Claude and Codex (spec 052). */
  agents: z.object({ claude: AgentStatusSchema, codex: AgentStatusSchema }),
  integrations: z.object({
    jira: IntegrationStatusSchema,
    github: IntegrationStatusSchema,
    slack: IntegrationStatusSchema,
    discord: IntegrationStatusSchema,
  }),
  /**
   * The hub runs in the desktop app on macOS, so it shows Claude's questions with a reply box itself (spec 057, AC-15),
   * and the page leaves them out of its own desktop notifications. False in a status from before spec 057.
   */
  desktopReplies: z.boolean().default(false),
  /** Claude is close to a plan limit (spec 057, AC-45); null while it isn't, and in a status from before spec 057. */
  claudeLimit: ClaudeLimitSchema.nullable().default(null),
});
export type Status = z.infer<typeof StatusSchema>;
