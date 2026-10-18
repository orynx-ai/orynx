import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { apiPaths, SessionListQuerySchema, SessionListSchema } from '@devhub/contracts';
import { listSessions, type SessionStore } from '../sessions/session-store.ts';

export const sessionsRoutes: FastifyPluginCallbackZod<{ sessions: SessionStore }> = (app, { sessions }, done) => {
  app.get(
    apiPaths.sessions,
    { schema: { querystring: SessionListQuerySchema, response: { 200: SessionListSchema } } },
    async (request) => ({ sessions: await listSessions(sessions, request.query) }),
  );
  done();
};
