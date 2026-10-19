import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  apiPaths,
  OpenSprintsQuerySchema,
  OpenSprintsSchema,
  TicketDetailAnswerSchema,
  TicketKeyParamsSchema,
  TicketsChoiceSchema,
  TicketsSchema,
} from '@devhub/contracts';
import type { InboxService } from '../inbox/inbox-service.ts';
import type { JiraConnectionService } from '../integrations/jira/connection.ts';
import type { TicketsService } from '../tickets/tickets-service.ts';

/**
 * Tickets' sprint (spec 008), from the cache. It syncs with the inbox, so Refresh and Clear cache live there.
 * Spec 020 adds the project's open sprints for the Sprint menu, asked of Jira now, and the choice of sprint,
 * whose first sync starts at once. A Jira problem is a JiraConnectionError, which the /api error handler answers.
 * Spec 022 adds one ticket in full for the ticket dialog.
 */
export const ticketsRoutes: FastifyPluginCallbackZod<{
  tickets: TicketsService;
  inbox: InboxService;
  jira: Pick<JiraConnectionService, 'openSprints'>;
}> = (app, { tickets, inbox, jira }, done) => {
  app.get(apiPaths.tickets, { schema: { response: { 200: TicketsSchema } } }, () => tickets.read());

  app.get(
    apiPaths.ticketsSprints,
    { schema: { querystring: OpenSprintsQuerySchema, response: { 200: OpenSprintsSchema } } },
    async (request) => ({ sprints: await jira.openSprints(request.query.project) }),
  );

  // One ticket in full for the ticket dialog (spec 022), asked of Jira now; why there's none is in the answer.
  app.get(
    apiPaths.ticket,
    { schema: { params: TicketKeyParamsSchema, response: { 200: TicketDetailAnswerSchema } } },
    (request) => tickets.detail(request.params.key),
  );

  app.put(
    apiPaths.ticketsChoice,
    { schema: { body: TicketsChoiceSchema, response: { 204: z.undefined() } } },
    async (request, reply) => {
      await tickets.choose(request.body);
      // The page reads `syncing` until this pass has read the new sprint, then hears inbox.changed.
      void inbox.sprintAfterChange();
      return reply.code(204).send();
    },
  );

  done();
};
