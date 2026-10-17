import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { apiPaths, PreferencesChangeSchema, PreferencesSchema } from '@devhub/contracts';
import type { PreferencesService } from '../preferences/preferences-service.ts';

/** Settings › Coding agent and Inbox rules (spec 005). */
export const preferencesRoutes: FastifyPluginCallbackZod<{ preferences: PreferencesService }> = (
  app,
  { preferences },
  done,
) => {
  app.get(apiPaths.preferences, { schema: { response: { 200: PreferencesSchema } } }, () => preferences.read());

  app.patch(
    apiPaths.preferences,
    { schema: { body: PreferencesChangeSchema, response: { 200: PreferencesSchema } } },
    (request) => preferences.change(request.body),
  );

  done();
};
