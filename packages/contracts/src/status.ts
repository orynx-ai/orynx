import { z } from 'zod';

export const IntegrationIdSchema = z.enum(['jira', 'github', 'slack']);
export type IntegrationId = z.infer<typeof IntegrationIdSchema>;

/** Settings › Connections shows one of these per tool. */
export const ConnectionStateSchema = z.enum(['connected', 'not_connected', 'needs_admin_approval', 'error']);
export type ConnectionState = z.infer<typeof ConnectionStateSchema>;

export const IntegrationStatusSchema = z.object({
  state: ConnectionStateSchema,
  /** One line for the connection row, for example "Personal API token for your-team.atlassian.net". */
  detail: z.string().nullable(),
});
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

export const AgentStatusSchema = z.object({
  id: z.literal('claude'),
  connected: z.boolean(),
});
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

/** GET /api/status: what the hub is connected to right now. */
export const StatusSchema = z.object({
  version: z.string(),
  agent: AgentStatusSchema,
  integrations: z.object({
    jira: IntegrationStatusSchema,
    github: IntegrationStatusSchema,
    slack: IntegrationStatusSchema,
  }),
});
export type Status = z.infer<typeof StatusSchema>;
