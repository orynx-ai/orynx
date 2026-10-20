import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AddTerminalTabAnswerSchema,
  ApiErrorSchema,
  apiPaths,
  TerminalInputSchema,
  TerminalSchema,
  TerminalSizeSchema,
  type ApiError,
  type TerminalOutput,
} from '@devhub/contracts';
import type { SessionRecords } from '../sessions/session-store.ts';
import { terminalWorktree, type TerminalService } from '../terminal/terminal-service.ts';

const SessionParamsSchema = z.object({ id: z.string().min(1).max(64) });
const TabParamsSchema = SessionParamsSchema.extend({ tabId: z.string().min(1).max(64) });

const noTerminal: ApiError = { code: 'not_found', message: 'This session has no Terminal.' };
const noTab: ApiError = { code: 'not_found', message: 'This Terminal has no such tab.' };

/**
 * Your shell tabs in a session's Terminal (spec 036, spec 038). Every shell starts in the session's own worktree,
 * read from the store, never from the request; `registerLocalOnly` checks the Host and the token first, as on
 * every route. A session with no Terminal (an Ask, a discarded one) answers 404 to all of them.
 */
export const terminalRoutes: FastifyPluginCallbackZod<{
  sessions: Pick<SessionRecords, 'get'>;
  terminal: TerminalService;
  /** How often the output stream sends a comment line, so it stays open while the shell is quiet. */
  keepAliveMs?: number;
}> = (app, { sessions, terminal, keepAliveMs = 25_000 }, done) => {
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
    async (request, reply) => {
      const worktree = await worktreeOf(request.params.id);
      return worktree === null ? reply.code(404).send(noTerminal) : terminal.addTab(request.params.id, worktree);
    },
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

  // A server-sent event stream of the tab's output (TerminalOutputSchema), the token in its URL as on /events.
  app.get(
    apiPaths.sessionTerminalOutput,
    { schema: { params: TabParamsSchema, response: notFound } },
    async (request, reply) => {
      const { id, tabId } = request.params;
      if ((await worktreeOf(id)) === null) return reply.code(404).send(noTerminal);
      const res = reply.raw;
      const send = (frame: TerminalOutput) => {
        res.write(`data: ${JSON.stringify(frame)}\n\n`);
      };
      // The headers go out with the first frame, sent before listen() returns, once the tab is known to be there.
      let open = false;
      const stop = terminal.listen(id, tabId, (frame) => {
        if (!open) {
          open = true;
          reply.hijack();
          res.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
            'x-accel-buffering': 'no',
          });
        }
        send(frame);
      });
      if (stop === null) return reply.code(404).send(noTab);
      const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), keepAliveMs);
      request.raw.on('close', () => {
        clearInterval(keepAlive);
        stop();
      });
      return reply;
    },
  );

  app.post(
    apiPaths.sessionTerminalInput,
    { schema: { params: TabParamsSchema, body: TerminalInputSchema, response: { 204: z.undefined(), ...notFound } } },
    async (request, reply) => {
      const { id, tabId } = request.params;
      if ((await worktreeOf(id)) === null) return reply.code(404).send(noTerminal);
      return terminal.write(id, tabId, request.body.data) ? reply.code(204).send() : reply.code(404).send(noTab);
    },
  );

  app.post(
    apiPaths.sessionTerminalSize,
    { schema: { params: TabParamsSchema, body: TerminalSizeSchema, response: { 204: z.undefined(), ...notFound } } },
    async (request, reply) => {
      const { id, tabId } = request.params;
      if ((await worktreeOf(id)) === null) return reply.code(404).send(noTerminal);
      return terminal.resize(id, tabId, request.body) ? reply.code(204).send() : reply.code(404).send(noTab);
    },
  );

  done();
};
