import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AddTerminalTabAnswerSchema,
  ApiErrorSchema,
  apiPaths,
  RunCommandAnswerSchema,
  RunCommandRequestSchema,
  TerminalSchema,
  type ApiError,
} from '@devhub/contracts';
import type { SessionRecords } from '../sessions/session-store.ts';
import { terminalWorktree, type TerminalService } from '../terminal/terminal-service.ts';

const SessionParamsSchema = z.object({ id: z.string().min(1).max(64) });
const TabParamsSchema = SessionParamsSchema.extend({ tabId: z.string().min(1).max(64) });

const noTerminal: ApiError = { code: 'not_found', message: 'This session has no Terminal.' };
const noTab: ApiError = { code: 'not_found', message: 'This Terminal has no such tab.' };

/**
 * Your shell tabs in a session's Terminal (spec 036). Every command runs in the session's own worktree, read
 * from the store, never from the request; `registerLocalOnly` checks the Host and the token first, as on every
 * route. A session with no Terminal (an Ask, a discarded one) answers 404 to all of them.
 */
export const terminalRoutes: FastifyPluginCallbackZod<{
  sessions: Pick<SessionRecords, 'get'>;
  terminal: TerminalService;
}> = (app, { sessions, terminal }, done) => {
  async function worktreeOf(id: string): Promise<string | null> {
    const record = await sessions.get(id);
    return record === null ? null : terminalWorktree(record);
  }
  const notFound = { 404: ApiErrorSchema };

  app.get(
    apiPaths.sessionTerminal,
    { schema: { params: SessionParamsSchema, response: { 200: TerminalSchema, ...notFound } } },
    async (request, reply) => {
      const worktree = await worktreeOf(request.params.id);
      return worktree === null ? reply.code(404).send(noTerminal) : terminal.read(request.params.id, worktree);
    },
  );

  app.post(
    apiPaths.sessionTerminalTabs,
    { schema: { params: SessionParamsSchema, response: { 200: AddTerminalTabAnswerSchema, ...notFound } } },
    async (request, reply) =>
      (await worktreeOf(request.params.id)) === null
        ? reply.code(404).send(noTerminal)
        : terminal.addTab(request.params.id),
  );

  app.delete(
    apiPaths.sessionTerminalTab,
    { schema: { params: TabParamsSchema, response: { 204: z.undefined(), ...notFound } } },
    async (request, reply) => {
      const { id, tabId } = request.params;
      if ((await worktreeOf(id)) === null) return reply.code(404).send(noTerminal);
      return (await terminal.closeTab(id, tabId)) ? reply.code(204).send() : reply.code(404).send(noTab);
    },
  );

  app.post(
    apiPaths.sessionTerminalRun,
    {
      schema: {
        params: TabParamsSchema,
        body: RunCommandRequestSchema,
        response: { 200: RunCommandAnswerSchema, ...notFound },
      },
    },
    async (request, reply) => {
      const { id, tabId } = request.params;
      const worktree = await worktreeOf(id);
      if (worktree === null) return reply.code(404).send(noTerminal);
      return (await terminal.run(id, tabId, request.body.command, worktree)) ?? reply.code(404).send(noTab);
    },
  );

  app.post(
    apiPaths.sessionTerminalStop,
    { schema: { params: TabParamsSchema, response: { 204: z.undefined(), ...notFound } } },
    async (request, reply) => {
      const { id, tabId } = request.params;
      if ((await worktreeOf(id)) === null) return reply.code(404).send(noTerminal);
      // Nothing running is already what Stop asks for.
      await terminal.stop(id, tabId);
      return reply.code(204).send();
    },
  );

  app.delete(
    apiPaths.sessionTerminalBlocks,
    { schema: { params: TabParamsSchema, response: { 204: z.undefined(), ...notFound } } },
    async (request, reply) => {
      const { id, tabId } = request.params;
      if ((await worktreeOf(id)) === null) return reply.code(404).send(noTerminal);
      return terminal.clear(id, tabId) ? reply.code(204).send() : reply.code(404).send(noTab);
    },
  );

  done();
};
