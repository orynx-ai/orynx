import { z } from 'zod';

/** The coding agents a session can run on (spec 052): Claude, the first, and Codex. */
export const AgentIdSchema = z.enum(['claude', 'codex']);
export type AgentId = z.infer<typeof AgentIdSchema>;

/** How hard Claude works on its answer, as Claude Code names the levels. */
export const EffortLevelSchema = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);
export type EffortLevel = z.infer<typeof EffortLevelSchema>;

/** A model id as Claude Code takes it ('opus', 'claude-sonnet-5', 'sonnet[1m]'). */
export const AgentModelIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:\-[\]]{0,199}$/);

/** One model Claude Code offers now, with the effort levels it takes (none when it takes no effort level). */
export const AgentModelSchema = z.object({
  value: AgentModelIdSchema,
  displayName: z.string().min(1),
  description: z.string(),
  efforts: z.array(EffortLevelSchema),
});
export type AgentModel = z.infer<typeof AgentModelSchema>;

/**
 * GET /api/agent/models: the models Claude Code offers, as it lists them. `unavailable` when it isn't installed,
 * isn't signed in, or couldn't say in time.
 */
export const AgentModelsSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('ready'), models: z.array(AgentModelSchema) }),
  z.object({ state: z.literal('unavailable') }),
]);
export type AgentModels = z.infer<typeof AgentModelsSchema>;

/** GET /api/agent/models?agent= (spec 052): one agent's models, Claude's when the query names none. */
export const AgentModelsQuerySchema = z.object({ agent: AgentIdSchema.default('claude') });

/** What the composer picked; left out, Claude, and its own default model and effort. */
export const AgentChoiceSchema = z.object({
  /** The agent the session runs on (spec 052). A follow-up goes to the session's own agent whatever this says. */
  agent: AgentIdSchema.optional(),
  model: AgentModelIdSchema.optional(),
  effort: EffortLevelSchema.optional(),
});
export type AgentChoice = z.infer<typeof AgentChoiceSchema>;
