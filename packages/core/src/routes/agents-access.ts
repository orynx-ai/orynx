import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { AgentsAccessSchema, ApiErrorSchema, apiPaths, McpConfigSchema, type ApiError } from '@devhub/contracts';
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

  // Copy MCP config (Q12m): the bridge is written for the token now, and the config that runs it comes back.
  app.post(
    apiPaths.agentsAccessConfig,
    { schema: { response: { 200: McpConfigSchema, 400: ApiErrorSchema } } },
    async (_request, reply) => {
      const config = await access.config();
      if (config !== null) return { config };
      const body: ApiError = { code: 'bad_request', message: 'Turn on Other agents first.' };
      return reply.code(400).send(body);
    },
  );

  done();
};
