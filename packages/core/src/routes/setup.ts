import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import {
  apiPaths,
  ApiErrorSchema,
  ProfileSchema,
  SetupRequestSchema,
  SetupStateSchema,
  type ApiError,
} from '@devhub/contracts';
import type { SetupService } from '../setup/setup-service.ts';

const alreadySetUp: ApiError = {
  code: 'already_set_up',
  message: 'Orynx is set up already. Delete ~/.devhub/password and restart Orynx to set it up again.',
};

/** Set up Orynx and Edit profile (spec 043). */
export const setupRoutes: FastifyPluginCallbackZod<{ setup: SetupService }> = (app, { setup }, done) => {
  app.get(apiPaths.setup, { schema: { response: { 200: SetupStateSchema } } }, async () => ({
    done: await setup.done(),
  }));

  app.post(
    apiPaths.setup,
    { schema: { body: SetupRequestSchema, response: { 200: SetupStateSchema, 409: ApiErrorSchema } } },
    async (request, reply) =>
      (await setup.complete(request.body)) === 'done' ? { done: true } : reply.code(409).send(alreadySetUp),
  );

  app.get(apiPaths.profile, { schema: { response: { 200: ProfileSchema } } }, () => setup.profile());

  app.put(apiPaths.profile, { schema: { body: ProfileSchema, response: { 200: ProfileSchema } } }, (request) =>
    setup.saveProfile(request.body),
  );

  done();
};
