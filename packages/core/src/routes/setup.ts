import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  apiPaths,
  ApiErrorSchema,
  ChangePasswordRequestSchema,
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

const wrongPassword: ApiError = { code: 'wrong_password', message: 'That isn’t your current password.' };
const notSetUp: ApiError = { code: 'bad_request', message: 'Set up Orynx first.' };

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

  // A new password changes the wifi door's cookie, so every other device asks for it again (lan.ts).
  app.put(
    apiPaths.password,
    {
      schema: {
        body: ChangePasswordRequestSchema,
        response: { 204: z.undefined(), 400: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const answer = await setup.changePassword(request.body);
      if (answer === 'wrong_password') return reply.code(400).send(wrongPassword);
      if (answer === 'not_set_up') return reply.code(409).send(notSetUp);
      return reply.code(204).send();
    },
  );

  done();
};
