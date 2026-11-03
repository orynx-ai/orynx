import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { AgentModelsQuerySchema, AgentModelsSchema, apiPaths, type AgentId, type AgentModels } from '@devhub/contracts';

/**
 * The composer's agent picker: the models an agent offers now, Claude's when the query names none (spec 052). An agent
 * that can't say is an answer, never an error.
 */
export const agentRoutes: FastifyPluginCallbackZod<{ models: (agent: AgentId) => Promise<AgentModels> }> = (
  app,
  { models },
  done,
) => {
  app.get(
    apiPaths.agentModels,
    { schema: { querystring: AgentModelsQuerySchema, response: { 200: AgentModelsSchema } } },
    (request) => models(request.query.agent),
  );
  done();
};
