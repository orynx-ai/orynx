import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, ThreadPreviewAnswerSchema, tokenHeader } from '@devhub/contracts';
import { createServer } from '../create-server.ts';
import { createEventBus } from '../events/event-bus.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { createMemorySettingsStore, type Settings } from '../settings/settings-store.ts';
import { knownUsers, slackChannels, slackThreads, slackToken, slackUserId, useFakeSlack } from '../test/fake-slack.ts';

const slack = useFakeSlack();
const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };
const link = 'https://acme.slack.com/archives/C024BE91L/p1793613600000100';

let app: FastifyInstance | undefined;

async function server(settings: Settings) {
  app = await createServer({
    token,
    port,
    version: '1.2.3',
    events: createEventBus(),
    userName: () => Promise.resolve(null),
    keychain: createMemoryKeychain({ slack: slackToken }),
    settings: createMemorySettingsStore(settings),
  });
  return app;
}

async function preview(hub: FastifyInstance, pasted: string) {
  const res = await hub.inject({
    method: 'GET',
    url: `${apiRoutes.threadPreview}?link=${encodeURIComponent(pasted)}`,
    headers,
  });
  return ThreadPreviewAnswerSchema.parse(res.json());
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const slackConnected: Settings = {
  slack: { workspace: 'Acme', url: 'https://acme.slack.com/', userId: slackUserId, name: 'Rakesh D.' },
};

describe('/api/threads/preview (spec 016)', () => {
  it('AC-26: answers the thread a pasted Slack link names, with who started it and where', async () => {
    slack.use(
      knownUsers({ U0NEHA0001: { display: 'Neha K.' } }),
      slackChannels({ C024BE91L: 'web-platform' }),
      slackThreads({ 'C024BE91L/1793613600.000100': [{ ts: '1793613600.000100', user: 'U0NEHA0001', text: 'Bug!' }] }),
    );

    expect(await preview(await server(slackConnected), link)).toEqual({
      result: 'found',
      chip: { kind: 'slack_thread', channel: 'C024BE91L', ts: '1793613600.000100' },
      label: { from: 'Neha K.', channel: 'web-platform', server: null },
    });
  });

  it('AC-27: a Slack or Discord link whose tool isn’t connected says which', async () => {
    const hub = await server({});
    expect(await preview(hub, link)).toEqual({ result: 'not_connected', tool: 'slack' });
    expect(
      await preview(hub, 'https://discord.com/channels/1100000000000000001/1100000000000000002/1434477000000000001'),
    ).toEqual({ result: 'not_connected', tool: 'discord' });
  });

  it('AC-32: a link to nothing Orynx can read, or no message link at all, is not found', async () => {
    slack.use(slackChannels({ C024BE91L: 'web-platform' }), slackThreads({}));
    const hub = await server(slackConnected);
    expect(await preview(hub, link)).toEqual({ result: 'not_found' });
    expect(await preview(hub, 'https://example.com/x')).toEqual({ result: 'not_found' });
  });
});
