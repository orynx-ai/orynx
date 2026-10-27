import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  type ApiError,
  ApiErrorSchema,
  apiPaths,
  ClaudeCommandListSchema,
  CreatePullRequestAnswerSchema,
  CreatePullRequestRequestSchema,
  FileDiffQuerySchema,
  FileDiffSchema,
  PortActionAnswerSchema,
  PullRequestDraftAnswerSchema,
  PushAnswerSchema,
  PushDraftAnswerSchema,
  PushRequestSchema,
  ReplyAnswerSchema,
  ReplyDraftAnswerSchema,
  ReplyRequestSchema,
  RespondToApprovalRequestSchema,
  SendMessageAnswerSchema,
  SendMessageRequestSchema,
  SessionBriefSchema,
  SessionChangeRequestSchema,
  SessionChangesSchema,
  SessionDeleteQuerySchema,
  SessionListQuerySchema,
  SessionListSchema,
  SessionPortParamsSchema,
  SessionPortsSchema,
  SessionSchema,
  StartSessionAnswerSchema,
  StartSessionRequestSchema,
} from '@devhub/contracts';
import type { RespondResult, SessionService } from '../sessions/session-service.ts';
import { listSessions, type SessionStore } from '../sessions/session-store.ts';

const SessionParamsSchema = z.object({ id: z.string().min(1).max(64) });

const notFound: ApiError = { code: 'not_found', message: 'There is no session with this id.' };

/** lsof couldn't be run (spec 042, AC-9); the page words it itself. */
const portsUnreadable: ApiError = { code: 'ports_unreadable', message: "Couldn't read the ports." };

/** A delete while Claude works (spec 039, AC-33); the page words it itself. */
const stillWorking: ApiError = { code: 'session_working', message: 'Stop the session first.' };

const serverFailed: ApiError = {
  code: 'internal',
  message: 'Something went wrong in the local server. See the terminal for details.',
};

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

/** 4 MiB, for the composer's start (spec 015); every other route keeps Fastify's 1 MiB. */
const composerBodyLimit = 4 * 1024 * 1024;

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
    {
      // The composer's most (spec 015): five 100 KB files and a 10,000-character message, which JSON can write
      // up to six times over when the text holds control characters, as a coloured log does.
      bodyLimit: composerBodyLimit,
      schema: { body: StartSessionRequestSchema, response: { 200: StartSessionAnswerSchema } },
    },
    (request) => service.start(request.body),
  );

  app.get(
    apiPaths.sessionPorts,
    {
      schema: {
        params: SessionParamsSchema,
        response: { 200: SessionPortsSchema, 404: ApiErrorSchema, 503: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const ports = await service.ports(request.params.id);
      if (ports === 'not_found') return reply.code(404).send(notFound);
      return ports === null ? reply.code(503).send(portsUnreadable) : { ports };
    },
  );

  for (const [path, act] of [
    [apiPaths.sessionPortStop, (id: string, port: number) => service.stopPort(id, port)],
    [apiPaths.sessionPortRestart, (id: string, port: number) => service.restartPort(id, port)],
  ] as const) {
    app.post(
      path,
      { schema: { params: SessionPortParamsSchema, response: { 200: PortActionAnswerSchema, 404: ApiErrorSchema } } },
      async (request, reply) => {
        const result = await act(request.params.id, request.params.port);
        return result === 'not_found' ? reply.code(404).send(notFound) : { result };
      },
    );
  }

  app.get(
    apiPaths.sessionCommands,
    { schema: { params: SessionParamsSchema, response: { 200: ClaudeCommandListSchema, 404: ApiErrorSchema } } },
    async (request, reply) => (await service.commands(request.params.id)) ?? reply.code(404).send(notFound),
  );

  app.get(
    apiPaths.session,
    { schema: { params: SessionParamsSchema, response: { 200: SessionSchema, 404: ApiErrorSchema } } },
    async (request, reply) => {
      const session = await service.get(request.params.id);
      return session ?? reply.code(404).send(notFound);
    },
  );

  app.patch(
    apiPaths.session,
    {
      schema: {
        params: SessionParamsSchema,
        body: SessionChangeRequestSchema,
        response: { 204: z.undefined(), 404: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const changed = await service.edit(request.params.id, request.body);
      return changed === 'not_found' ? reply.code(404).send(notFound) : reply.code(204).send();
    },
  );

  app.delete(
    apiPaths.session,
    {
      schema: {
        params: SessionParamsSchema,
        querystring: SessionDeleteQuerySchema,
        response: { 204: z.undefined(), 404: ApiErrorSchema, 409: ApiErrorSchema, 500: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const removed = await service.remove(request.params.id, request.query);
      if (removed === 'not_found') return reply.code(404).send(notFound);
      if (removed === 'working') return reply.code(409).send(stillWorking);
      // The session service told the terminal what failed.
      if (removed === 'failed') return reply.code(500).send(serverFailed);
      return reply.code(204).send();
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
      // The session service told the terminal what failed.
      if (discarded === 'failed') return reply.code(500).send(serverFailed);
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
      const { text, context, model, effort } = request.body;
      const answer = await service.send(request.params.id, text, context, { model, effort });
      return answer.result === 'not_found' ? reply.code(404).send(notFound) : answer;
    },
  );

  app.get(
    apiPaths.sessionBrief,
    { schema: { params: SessionParamsSchema, response: { 200: SessionBriefSchema, 404: ApiErrorSchema } } },
    async (request, reply) => (await service.brief(request.params.id)) ?? reply.code(404).send(notFound),
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

  // Create pull request and Push changes (spec 014): a draft changes nothing; the others only on your press.
  app.post(
    apiPaths.sessionPullRequestDraft,
    { schema: { params: SessionParamsSchema, response: { 200: PullRequestDraftAnswerSchema, 404: ApiErrorSchema } } },
    async (request, reply) => (await service.draftPullRequest(request.params.id)) ?? reply.code(404).send(notFound),
  );

  app.post(
    apiPaths.sessionPullRequest,
    {
      schema: {
        params: SessionParamsSchema,
        body: CreatePullRequestRequestSchema,
        response: { 200: CreatePullRequestAnswerSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) =>
      (await service.createPullRequest(request.params.id, request.body)) ?? reply.code(404).send(notFound),
  );

  app.post(
    apiPaths.sessionPushDraft,
    { schema: { params: SessionParamsSchema, response: { 200: PushDraftAnswerSchema, 404: ApiErrorSchema } } },
    async (request, reply) => (await service.draftPush(request.params.id)) ?? reply.code(404).send(notFound),
  );

  app.post(
    apiPaths.sessionPush,
    {
      schema: {
        params: SessionParamsSchema,
        body: PushRequestSchema,
        response: { 200: PushAnswerSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) => (await service.push(request.params.id, request.body)) ?? reply.code(404).send(notFound),
  );

  // Spec 048: Claude's replies to the review threads, which write nothing; then posting them, only on your press.
  app.post(
    apiPaths.sessionRepliesDraft,
    { schema: { params: SessionParamsSchema, response: { 200: ReplyDraftAnswerSchema, 404: ApiErrorSchema } } },
    async (request, reply) => (await service.draftReplies(request.params.id)) ?? reply.code(404).send(notFound),
  );

  app.post(
    apiPaths.sessionReplies,
    {
      schema: {
        params: SessionParamsSchema,
        body: ReplyRequestSchema,
        response: { 200: ReplyAnswerSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply) =>
      (await service.postReplies(request.params.id, request.body)) ?? reply.code(404).send(notFound),
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
