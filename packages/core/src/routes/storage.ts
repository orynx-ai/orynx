import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { apiPaths, StorageSchema } from '@devhub/contracts';
import type { SessionService } from '../sessions/session-service.ts';

/** Settings › Coding agent › Storage (spec 047, D): the worktrees' size, and what each choice would delete now. */
export const storageRoutes: FastifyPluginCallbackZod<{ sessions: Pick<SessionService, 'storage'> }> = (
  app,
  { sessions },
  done,
) => {
  app.get(apiPaths.storage, { schema: { response: { 200: StorageSchema } } }, () => sessions.storage());
  done();
};
