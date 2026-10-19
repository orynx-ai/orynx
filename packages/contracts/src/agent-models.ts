import { z } from 'zod';

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

/** What the composer picked; both left out means Claude Code's own default. */
export const AgentChoiceSchema = z.object({
  model: AgentModelIdSchema.optional(),
  effort: EffortLevelSchema.optional(),
});
export type AgentChoice = z.infer<typeof AgentChoiceSchema>;
