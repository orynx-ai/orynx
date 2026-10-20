import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  apiPaths,
  ConnectionCheckSchema,
  JiraConnectionRequestSchema,
  JiraConnectionSchema,
  JiraProjectListSchema,
} from '@devhub/contracts';
import type { JiraConnectionService } from '../integrations/jira/connection.ts';

/** Settings › Connections › Jira. A failure is a ConnectionError, which the /api error handler answers. */
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

  // Test connection and Reconnect (spec 030). A changed answer also reaches every page through status.changed.
  app.post(apiPaths.jiraConnectionCheck, { schema: { response: { 200: ConnectionCheckSchema } } }, () =>
    jira.checkNow(),
  );

  // Settings › Repositories asks for these when its form opens (spec 005).
  app.get(apiPaths.jiraProjects, { schema: { response: { 200: JiraProjectListSchema } } }, async () => ({
    projects: await jira.projects(),
  }));

  done();
};
