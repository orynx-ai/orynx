import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ApiErrorSchema,
  apiPaths,
  SessionListQuerySchema,
  SessionListSchema,
  SessionSchema,
  StartSessionAnswerSchema,
  StartSessionRequestSchema,
  type ApiError,
} from '@devhub/contracts';
import type { SessionService } from '../sessions/session-service.ts';
import { listSessions, type SessionStore } from '../sessions/session-store.ts';

const SessionParamsSchema = z.object({ id: z.string().min(1).max(64) });

const notFound: ApiError = { code: 'not_found', message: 'There is no session with this id.' };

export const sessionsRoutes: FastifyPluginCallbackZod<{ sessions: SessionStore; service: SessionService }> = (
  app,
  { sessions, service },
  done,
) => {
  app.get(
    apiPaths.sessions,
    { schema: { querystring: SessionListQuerySchema, response: { 200: SessionListSchema } } },
    async (request) => ({ sessions: await listSessions(sessions, request.query) }),
  );

  app.post(
    apiPaths.sessions,
    { schema: { body: StartSessionRequestSchema, response: { 200: StartSessionAnswerSchema } } },
    (request) => service.start(request.body),
  );

  app.get(
    apiPaths.session,
    { schema: { params: SessionParamsSchema, response: { 200: SessionSchema, 404: ApiErrorSchema } } },
    async (request, reply) => {
      const session = await service.get(request.params.id);
      return session ?? reply.code(404).send(notFound);
    },
  );

  app.post(
    apiPaths.sessionStop,
    { schema: { params: SessionParamsSchema, response: { 204: z.undefined(), 404: ApiErrorSchema } } },
    async (request, reply) => {
      const stopped = await service.stop(request.params.id);
      return stopped === 'not_found' ? reply.code(404).send(notFound) : reply.code(204).send();
    },
  );

  app.post(
    apiPaths.sessionDiscard,
    {
      schema: {
        params: SessionParamsSchema,
        response: { 204: z.undefined(), 404: ApiErrorSchema, 500: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const discarded = await service.discard(request.params.id);
      if (discarded === 'not_found') return reply.code(404).send(notFound);
      if (discarded === 'failed') {
        // The session service told the terminal what failed.
        const body: ApiError = {
          code: 'internal',
          message: 'Something went wrong in the local server. See the terminal for details.',
        };
        return reply.code(500).send(body);
      }
      return reply.code(204).send();
    },
  );
  done();
};
