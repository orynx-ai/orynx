import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { apiPaths, StatusSchema } from '@devhub/contracts';
import type { StatusService } from '../status/status-service.ts';

export const statusRoutes: FastifyPluginCallbackZod<{ status: StatusService }> = (app, { status }, done) => {
  app.get(apiPaths.status, { schema: { response: { 200: StatusSchema } } }, () => status.getStatus());
  done();
};
