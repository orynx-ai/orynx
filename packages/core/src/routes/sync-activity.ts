import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { apiPaths, SyncActivityQuerySchema, SyncActivitySchema } from '@devhub/contracts';
import type { SyncActivityService } from '../inbox/sync-activity-service.ts';

/** The Sync activity modal's log (spec 035): each tool's figures and its newest runs. Syncing is Refresh's. */
export const syncActivityRoutes: FastifyPluginCallbackZod<{ syncActivity: SyncActivityService }> = (
  app,
  { syncActivity },
  done,
) => {
  app.get(
    apiPaths.syncActivity,
    { schema: { querystring: SyncActivityQuerySchema, response: { 200: SyncActivitySchema } } },
    (request) => syncActivity.read(request.query),
  );
  done();
};
