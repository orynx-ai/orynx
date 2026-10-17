import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { apiPaths, InboxSchema } from '@devhub/contracts';
import type { InboxService } from '../inbox/inbox-service.ts';

/** Home's "Needs your attention" list (spec 007): read it, sync it now, or clear the cache. */
export const inboxRoutes: FastifyPluginCallbackZod<{ inbox: InboxService }> = (app, { inbox }, done) => {
  app.get(apiPaths.inbox, { schema: { response: { 200: InboxSchema } } }, () => inbox.read());

  // Answers once the sync has ended, so Refresh's spinner stops when the new rows are there.
  app.post(apiPaths.inboxRefresh, { schema: { response: { 204: z.undefined() } } }, async (_request, reply) => {
    await inbox.sync();
    return reply.code(204).send();
  });

  app.delete(apiPaths.inboxCache, { schema: { response: { 204: z.undefined() } } }, async (_request, reply) => {
    await inbox.clear();
    return reply.code(204).send();
  });

  done();
};
