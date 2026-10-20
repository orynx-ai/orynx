import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  apiPaths,
  ConnectionCheckSchema,
  GitHubConnectionRequestSchema,
  GitHubConnectionSchema,
} from '@devhub/contracts';
import type { GitHubConnectionService } from '../integrations/github/connection.ts';

/** Settings › Connections › GitHub. A failure is a ConnectionError, which the /api error handler answers. */
export const githubRoutes: FastifyPluginCallbackZod<{ github: GitHubConnectionService }> = (app, { github }, done) => {
  app.get(apiPaths.githubConnection, { schema: { response: { 200: GitHubConnectionSchema } } }, () => github.read());

  app.put(
    apiPaths.githubConnection,
    { schema: { body: GitHubConnectionRequestSchema, response: { 200: GitHubConnectionSchema } } },
    (request) => github.connect(request.body),
  );

  app.delete(apiPaths.githubConnection, { schema: { response: { 204: z.undefined() } } }, async (_request, reply) => {
    await github.disconnect();
    return reply.code(204).send();
  });

  // Test connection and Reconnect (spec 030). A changed answer also reaches every page through status.changed.
  app.post(apiPaths.githubConnectionCheck, { schema: { response: { 200: ConnectionCheckSchema } } }, () =>
    github.checkNow(),
  );

  done();
};
