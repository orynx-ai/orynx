import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { apiPaths, JiraConnectionRequestSchema, JiraConnectionSchema } from '@devhub/contracts';
import type { JiraConnectionService } from '../integrations/jira/connection.ts';

/** Settings › Connections › Jira. A failure is a JiraConnectionError, which the /api error handler answers. */
export const jiraRoutes: FastifyPluginCallbackZod<{ jira: JiraConnectionService }> = (app, { jira }, done) => {
  app.get(apiPaths.jiraConnection, { schema: { response: { 200: JiraConnectionSchema } } }, () => jira.read());

  app.put(
    apiPaths.jiraConnection,
    { schema: { body: JiraConnectionRequestSchema, response: { 200: JiraConnectionSchema } } },
    (request) => jira.connect(request.body),
  );

  app.delete(apiPaths.jiraConnection, { schema: { response: { 204: z.undefined() } } }, async (_request, reply) => {
    await jira.disconnect();
    return reply.code(204).send();
  });

  done();
};
