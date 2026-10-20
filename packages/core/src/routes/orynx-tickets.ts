import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import {
  apiPaths,
  CreateOrynxTicketSchema,
  OrynxTicketAnswerSchema,
  OrynxTicketDeleteAnswerSchema,
  OrynxTicketKeyParamsSchema,
  OrynxTicketSaveAnswerSchema,
  OrynxTicketSchema,
  UpdateOrynxTicketSchema,
} from '@devhub/contracts';
import type { OrynxTicketService } from '../orynx-tickets/ticket-service.ts';

/**
 * Orynx's own tickets for the page (spec 037): you make, read, change and delete them. A failed save is a 500 from
 * the /api error handler, with nothing changed (AC-11).
 */
export const orynxTicketsRoutes: FastifyPluginCallbackZod<{ tickets: OrynxTicketService }> = (
  app,
  { tickets },
  done,
) => {
  app.post(
    apiPaths.orynxTickets,
    { schema: { body: CreateOrynxTicketSchema, response: { 200: OrynxTicketSchema } } },
    (request) => tickets.create(request.body, { kind: 'you' }),
  );

  app.get(
    apiPaths.orynxTicket,
    { schema: { params: OrynxTicketKeyParamsSchema, response: { 200: OrynxTicketAnswerSchema } } },
    async (request) => {
      const ticket = await tickets.get(request.params.key);
      return ticket === null ? { result: 'not_found' as const } : { result: 'found' as const, ticket };
    },
  );

  app.patch(
    apiPaths.orynxTicket,
    {
      schema: {
        params: OrynxTicketKeyParamsSchema,
        body: UpdateOrynxTicketSchema,
        response: { 200: OrynxTicketSaveAnswerSchema },
      },
    },
    (request) => tickets.update(request.params.key, request.body),
  );

  app.delete(
    apiPaths.orynxTicket,
    { schema: { params: OrynxTicketKeyParamsSchema, response: { 200: OrynxTicketDeleteAnswerSchema } } },
    (request) => tickets.remove(request.params.key),
  );

  done();
};
