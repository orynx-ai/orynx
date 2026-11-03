import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { apiPaths, CodexLoginSchema } from '@devhub/contracts';
import type { CodexLoginService } from '../agents/codex/codex-login.ts';

/** Settings › Coding agent's Codex card (spec 052). A failed check is an answer, never an error. */
export const codexRoutes: FastifyPluginCallbackZod<{ codex: CodexLoginService }> = (app, { codex }, done) => {
  app.get(apiPaths.codexLogin, { schema: { response: { 200: CodexLoginSchema } } }, () => codex.read());

  // Check again. A changed answer also reaches every other page through status.changed.
  app.post(apiPaths.codexLoginCheck, { schema: { response: { 200: CodexLoginSchema } } }, () => codex.checkNow());

  done();
};
