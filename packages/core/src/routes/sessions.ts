import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ApiErrorSchema,
  apiPaths,
  FileDiffQuerySchema,
  FileDiffSchema,
  RespondToApprovalRequestSchema,
  SendMessageAnswerSchema,
  SendMessageRequestSchema,
  SessionChangesSchema,
  SessionListQuerySchema,
  SessionListSchema,
  SessionSchema,
  StartSessionAnswerSchema,
  TicketStartSchema,
  type ApiError,
} from '@devhub/contracts';
import type { RespondResult, SessionService } from '../sessions/session-service.ts';
import { listSessions, type SessionStore } from '../sessions/session-store.ts';

const SessionParamsSchema = z.object({ id: z.string().min(1).max(64) });

const notFound: ApiError = { code: 'not_found', message: 'There is no session with this id.' };

const ApprovalParamsSchema = SessionParamsSchema.extend({ approvalId: z.string().min(1).max(64) });

const notListed: ApiError = { code: 'not_found', message: 'That file isn’t among this session’s changes.' };

/** git couldn't read the worktree; the terminal says why, and the page words it itself (spec 013, Q10c). */
const unreadable: ApiError = {
  code: 'internal',
  message: 'The changes could not be read. See the terminal for details.',
};

/** How each answer to an approval goes back over HTTP (spec 012). The page words them itself (Q8e). */
const approvalErrors: Record<Exclude<RespondResult, 'answered'>, { status: 400 | 404 | 409 | 503; body: ApiError }> = {
  not_found: { status: 404, body: { code: 'not_found', message: 'Nothing is waiting with this id.' } },
  already_answered: { status: 409, body: { code: 'already_answered', message: 'This call was answered already.' } },
  not_offered: { status: 400, body: { code: 'bad_request', message: 'Always allow isn’t offered for this call.' } },
  not_saved: {
    status: 503,
    body: { code: 'settings_unsaved', message: 'The allow list could not be saved. See the terminal for details.' },
  },
};

export const sessionsRoutes: FastifyPluginCallbackZod<{ sessions: SessionStore; service: SessionService }> = (
  app,
  { sessions, service },
  done,
) => {
  app.get(
    apiPaths.sessions,
    { schema: { querystring: SessionListQuerySchema, response: { 200: SessionListSchema } } },
    (request) => listSessions(sessions, request.query),
  );

  app.post(
    apiPaths.sessions,
    { schema: { body: TicketStartSchema, response: { 200: StartSessionAnswerSchema } } },
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
  app.post(
    apiPaths.sessionMessages,
    {
      schema: {
        params: SessionParamsSchema,
        body: SendMessageRequestSchema,
        response: { 200: SendMessageAnswerSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const answer = await service.send(request.params.id, request.body.text);
      return answer.result === 'not_found' ? reply.code(404).send(notFound) : answer;
    },
  );

  app.get(
    apiPaths.sessionChanges,
    {
      schema: {
        params: SessionParamsSchema,
        response: { 200: SessionChangesSchema, 404: ApiErrorSchema, 500: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const changes = await service.changes(request.params.id);
      if (changes === null) return reply.code(404).send(notFound);
      if (changes === 'unreadable') {
        request.log.warn({ session: request.params.id }, "git couldn't read a session's changes");
        return reply.code(500).send(unreadable);
      }
      return changes;
    },
  );

  app.get(
    apiPaths.sessionChangesDiff,
    {
      schema: {
        params: SessionParamsSchema,
        querystring: FileDiffQuerySchema,
        response: { 200: FileDiffSchema, 404: ApiErrorSchema, 500: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const diff = await service.fileDiff(request.params.id, request.query.path);
      if (diff === null) return reply.code(404).send(notListed);
      if (diff === 'unreadable') {
        request.log.warn({ session: request.params.id }, "git couldn't read a changed file's diff");
        return reply.code(500).send(unreadable);
      }
      return diff;
    },
  );

  app.post(
    apiPaths.sessionApproval,
    {
      schema: {
        params: ApprovalParamsSchema,
        body: RespondToApprovalRequestSchema,
        response: {
          204: z.undefined(),
          400: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { id, approvalId } = request.params;
      const result = await service.respond(id, approvalId, request.body.decision);
      if (result === 'answered') return reply.code(204).send();
      const { status, body } = approvalErrors[result];
      return reply.code(status).send(body);
    },
  );
  done();
};
