import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { apiPaths, StandupSchema } from '@devhub/contracts';
import type { StandupService } from '../standup/standup-service.ts';

/** Home's Write my standup (spec 057, C): a draft for you to copy. Orynx posts nothing. */
export const standupRoutes: FastifyPluginCallbackZod<{ standup: StandupService }> = (app, { standup }, done) => {
  app.get(apiPaths.standup, { schema: { response: { 200: StandupSchema } } }, () => standup.draft());
  done();
};
