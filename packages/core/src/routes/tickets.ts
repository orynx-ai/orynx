import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { apiPaths, TicketsSchema } from '@devhub/contracts';
import type { TicketsService } from '../tickets/tickets-service.ts';

/** Tickets' sprint (spec 008), from the cache. It syncs with the inbox, so Refresh and Clear cache live there. */
export const ticketsRoutes: FastifyPluginCallbackZod<{ tickets: TicketsService }> = (app, { tickets }, done) => {
  app.get(apiPaths.tickets, { schema: { response: { 200: TicketsSchema } } }, () => tickets.read());
  done();
};
