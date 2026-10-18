import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { apiPaths, ClaudeLoginSchema } from '@devhub/contracts';
import type { ClaudeLoginService } from '../agents/claude/claude-login.ts';

/** Settings › Coding agent's Claude card (spec 010). A failed check is an answer, never an error. */
export const claudeRoutes: FastifyPluginCallbackZod<{ claude: ClaudeLoginService }> = (app, { claude }, done) => {
  app.get(apiPaths.claudeLogin, { schema: { response: { 200: ClaudeLoginSchema } } }, () => claude.read());

  // Check again. A changed answer also reaches every other page through status.changed.
  app.post(apiPaths.claudeLoginCheck, { schema: { response: { 200: ClaudeLoginSchema } } }, () => claude.checkNow());

  done();
};
