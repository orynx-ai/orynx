import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  apiRoutes,
  ApiErrorSchema,
  ConnectionCheckSchema,
  SlackConnectionSchema,
  StatusSchema,
  tokenHeader,
} from '@devhub/contracts';
import { createServer } from '../create-server.ts';
import { createEventBus } from '../events/event-bus.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { slackToken, useFakeSlack } from '../test/fake-slack.ts';

useFakeSlack();
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

describe('/api/slack/connection (spec 016)', () => {
  it('AC-1, AC-2: connects with a token, then GET and /api/status say who and where', async () => {
    const { app, keychain } = await server();

    expect(
      SlackConnectionSchema.parse(
        (await app.inject({ method: 'GET', url: apiRoutes.slackConnection, headers })).json(),
      ),
    ).toEqual({
      saved: null,
      envToken: false,
      bot: false,
    });
    const put = await app.inject({
      method: 'PUT',
      url: apiRoutes.slackConnection,
      headers,
      payload: { token: slackToken },
    });
    expect(put.statusCode).toBe(200);
    expect(SlackConnectionSchema.parse(put.json()).saved).toMatchObject({ workspace: 'Acme', name: 'Neha K.' });
    expect(put.body).not.toContain(slackToken);
    expect(await keychain.get('slack')).toBe(slackToken);

    const status = StatusSchema.parse((await app.inject({ method: 'GET', url: apiRoutes.status, headers })).json());
    expect(status.integrations.slack).toMatchObject({ state: 'connected', detail: 'Neha K. in Acme' });

    const check = await app.inject({ method: 'POST', url: apiRoutes.slackConnectionCheck, headers });
    expect(ConnectionCheckSchema.parse(check.json()).status.state).toBe('connected');
  });

  it('AC-4: a refused token answers 422 integration_rejected in Orynx words', async () => {
    const { app } = await server();
    const put = await app.inject({
      method: 'PUT',
      url: apiRoutes.slackConnection,
      headers,
      payload: { token: 'fake-wrong-token' },
    });
    expect(put.statusCode).toBe(422);
    expect(ApiErrorSchema.parse(put.json())).toEqual({
      code: 'integration_rejected',
      message: "Slack didn't accept this token. Check it, or copy it again.",
    });
  });

  it('AC-9: Disconnect forgets the token, and the status says not connected', async () => {
    const { app, keychain } = await server();
    await app.inject({ method: 'PUT', url: apiRoutes.slackConnection, headers, payload: { token: slackToken } });

    expect((await app.inject({ method: 'DELETE', url: apiRoutes.slackConnection, headers })).statusCode).toBe(204);
    expect(await keychain.get('slack')).toBeNull();
    const status = StatusSchema.parse((await app.inject({ method: 'GET', url: apiRoutes.status, headers })).json());
    expect(status.integrations.slack.state).toBe('not_connected');
  });
});
