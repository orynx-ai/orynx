import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  apiPaths,
  ConnectionCheckSchema,
  SlackBotRequestSchema,
  SlackConnectionRequestSchema,
  SlackConnectionSchema,
} from '@devhub/contracts';
import type { SlackConnectionService } from '../integrations/slack/connection.ts';

/** Settings › Connections › Slack (spec 016). A failure is a ConnectionError, which the /api error handler answers. */
export const slackRoutes: FastifyPluginCallbackZod<{ slack: SlackConnectionService }> = (app, { slack }, done) => {
  app.get(apiPaths.slackConnection, { schema: { response: { 200: SlackConnectionSchema } } }, () => slack.read());

  app.put(
    apiPaths.slackConnection,
    { schema: { body: SlackConnectionRequestSchema, response: { 200: SlackConnectionSchema } } },
    (request) => slack.connect(request.body),
  );

  app.delete(apiPaths.slackConnection, { schema: { response: { 204: z.undefined() } } }, async (_request, reply) => {
    await slack.disconnect();
    return reply.code(204).send();
  });

  // Slack's bot, which DMs you Claude's questions (spec 057, AC-14).
  app.put(
    apiPaths.slackBot,
    { schema: { body: SlackBotRequestSchema, response: { 200: SlackConnectionSchema } } },
    (request) => slack.connectBot(request.body.token),
  );

  app.delete(apiPaths.slackBot, { schema: { response: { 204: z.undefined() } } }, async (_request, reply) => {
    await slack.disconnectBot();
    return reply.code(204).send();
  });

  // Test connection and Reconnect (spec 030). A changed answer also reaches every page through status.changed.
  app.post(apiPaths.slackConnectionCheck, { schema: { response: { 200: ConnectionCheckSchema } } }, () =>
    slack.checkNow(),
  );

  done();
};
