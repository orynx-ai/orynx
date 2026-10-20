import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { AgentsAccessSchema, apiPaths } from '@devhub/contracts';
import type { AgentAccess } from '../agents-access/agent-access.ts';

/** Settings › Coding agent's Other agents row (spec 037, Q12m): whether agents outside Orynx may use its tickets. */
export const agentsAccessRoutes: FastifyPluginCallbackZod<{ access: AgentAccess }> = (app, { access }, done) => {
  app.get(apiPaths.agentsAccess, { schema: { response: { 200: AgentsAccessSchema } } }, async () => ({
    enabled: await access.enabled(),
  }));

  app.put(
    apiPaths.agentsAccess,
    { schema: { body: AgentsAccessSchema, response: { 200: AgentsAccessSchema } } },
    async (request) => {
      await access.set(request.body.enabled);
      return { enabled: request.body.enabled };
    },
  );

  done();
};
