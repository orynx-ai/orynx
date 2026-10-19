import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { AgentModelsSchema, apiPaths, type AgentModels } from '@devhub/contracts';

/** The composer's agent picker: the models Claude offers now. Claude Code that can't say is an answer, never an error. */
export const agentRoutes: FastifyPluginCallbackZod<{ models: () => Promise<AgentModels> }> = (
  app,
  { models },
  done,
) => {
  app.get(apiPaths.agentModels, { schema: { response: { 200: AgentModelsSchema } } }, () => models());
  done();
};
