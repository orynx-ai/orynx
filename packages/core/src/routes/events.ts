import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { apiPaths, type ServerEvent } from '@devhub/contracts';
import type { EventBus } from '../events/event-bus.ts';

export interface EventsRouteOptions {
  events: EventBus;
  /** How often to send a comment line so proxies and the browser keep the stream open. */
  keepAliveMs?: number;
}

/** GET /api/events: a server-sent event stream of the ServerEvent union (learn/live-updates.md). */
export const eventsRoutes: FastifyPluginCallbackZod<EventsRouteOptions> = (app, options, done) => {
  const keepAliveMs = options.keepAliveMs ?? 25_000;

  app.get(apiPaths.events, (request, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });

    const send = (event: ServerEvent): void => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    send({ type: 'hello', at: new Date().toISOString() });
    const unsubscribe = options.events.subscribe(send, { page: true });
    const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), keepAliveMs);

    request.raw.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  done();
};
