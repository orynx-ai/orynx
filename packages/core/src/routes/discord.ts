import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  apiPaths,
  ConnectionCheckSchema,
  DiscordConnectionRequestSchema,
  DiscordConnectionSchema,
} from '@devhub/contracts';
import type { DiscordConnectionService } from '../integrations/discord/connection.ts';

/** Settings › Connections › Discord (spec 016). A failure is a ConnectionError, which the /api error handler answers. */
export const discordRoutes: FastifyPluginCallbackZod<{ discord: DiscordConnectionService }> = (
  app,
  { discord },
  done,
) => {
  app.get(apiPaths.discordConnection, { schema: { response: { 200: DiscordConnectionSchema } } }, () => discord.read());

  app.put(
    apiPaths.discordConnection,
    { schema: { body: DiscordConnectionRequestSchema, response: { 200: DiscordConnectionSchema } } },
    (request) => discord.connect(request.body),
  );

  app.delete(apiPaths.discordConnection, { schema: { response: { 204: z.undefined() } } }, async (_request, reply) => {
    await discord.disconnect();
    return reply.code(204).send();
  });

  // Test connection and Reconnect (spec 030). A changed answer also reaches every page through status.changed.
  app.post(apiPaths.discordConnectionCheck, { schema: { response: { 200: ConnectionCheckSchema } } }, () =>
    discord.checkNow(),
  );

  done();
};
