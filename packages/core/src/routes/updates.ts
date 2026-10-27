import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { apiPaths, ApiErrorSchema, UpdateInstallSchema, UpdatesSchema } from '@devhub/contracts';
import type { UpdateService } from '../updates/update-service.ts';

/** Settings › About (spec 045): the version, the releases, Check for updates, Update and Restart to update. */
export const updatesRoutes: FastifyPluginCallbackZod<{ updates: UpdateService }> = (app, { updates }, done) => {
  app.get(apiPaths.updates, { schema: { response: { 200: UpdatesSchema } } }, () => updates.read());

  app.post(apiPaths.updatesCheck, { schema: { response: { 200: UpdatesSchema } } }, () => updates.check());

  app.post(
    apiPaths.updatesInstall,
    { schema: { body: UpdateInstallSchema, response: { 200: UpdatesSchema, 409: ApiErrorSchema } } },
    (request) => updates.install(request.body.step),
  );

  done();
};
