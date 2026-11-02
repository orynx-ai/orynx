import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, ApiErrorSchema, DiscordConnectionSchema, StatusSchema, tokenHeader } from '@devhub/contracts';
import { createServer } from '../create-server.ts';
import { createEventBus } from '../events/event-bus.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { acceptingBot, discordToken, useFakeDiscord } from '../test/fake-discord.ts';

const discord = useFakeDiscord();
const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };

let app: FastifyInstance | undefined;

async function server() {
  const keychain = createMemoryKeychain();
  app = await createServer({
    token,
    port,
    version: '1.2.3',
    events: createEventBus(),
    userName: () => Promise.resolve(null),
    keychain,
  });
  return { app, keychain };
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('/api/discord/connection (spec 016)', () => {
  it('AC-6: connects with a bot token, and /api/status names the bot and its servers', async () => {
    const { app, keychain } = await server();

    const put = await app.inject({
      method: 'PUT',
      url: apiRoutes.discordConnection,
      headers,
      payload: { token: discordToken },
    });
    expect(DiscordConnectionSchema.parse(put.json()).saved).toEqual({ bot: 'Orynx', userId: '80351110224678912' });
    expect(put.body).not.toContain(discordToken);
    expect(await keychain.get('discord')).toBe(discordToken);
    const status = StatusSchema.parse((await app.inject({ method: 'GET', url: apiRoutes.status, headers })).json());
    expect(status.integrations.discord).toMatchObject({ state: 'connected', detail: 'Orynx · 2 servers' });
  });

  it('AC-8: a team’s bot answers 422 user_id_needed, so the form asks for your user ID', async () => {
    discord.use(...acceptingBot({ team: true }));
    const { app } = await server();

    const put = await app.inject({
      method: 'PUT',
      url: apiRoutes.discordConnection,
      headers,
      payload: { token: discordToken },
    });
    expect(put.statusCode).toBe(422);
    expect(ApiErrorSchema.parse(put.json()).code).toBe('user_id_needed');
  });

  it('AC-9: Disconnect forgets the bot', async () => {
    const { app, keychain } = await server();
    await app.inject({ method: 'PUT', url: apiRoutes.discordConnection, headers, payload: { token: discordToken } });

    expect((await app.inject({ method: 'DELETE', url: apiRoutes.discordConnection, headers })).statusCode).toBe(204);
    expect(await keychain.get('discord')).toBeNull();
  });
});
