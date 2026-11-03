import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, tokenHeader, type ServerEvent } from '@devhub/contracts';
import { createServer } from '../../create-server.ts';
import { createEventBus } from '../../events/event-bus.ts';
import { createMemoryKeychain } from '../../secrets/memory-keychain.ts';
import { createFileSettingsStore, settingsFilePath } from '../../settings/settings-store.ts';
import { acceptingAuthTest, slackApi, slackToken, useFakeSlack } from '../../test/fake-slack.ts';

const slack = useFakeSlack();
const sessionToken = 'leaks-session-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: sessionToken };
const wrongToken = 'fake-wrong-slack-token-for-leaks';
const envToken = 'fake-env-slack-token-for-leaks';

let app: FastifyInstance | undefined;
let home: string | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
  if (home !== undefined) await rm(home, { recursive: true, force: true });
  home = undefined;
});

describe.skipIf(process.platform === 'win32')('Slack tokens never leave core (spec 016)', () => {
  it('AC-33: no log line, response, event or settings.json holds a token or its header', async () => {
    home = await mkdtemp(join(tmpdir(), 'devhub-leaks-'));
    const log: string[] = [];
    const bus = createEventBus();
    const events: ServerEvent[] = [];
    bus.subscribe((event) => events.push(event));
    app = await createServer({
      token: sessionToken,
      port,
      version: 'test',
      events: bus,
      userName: () => Promise.resolve(null),
      keychain: createMemoryKeychain(),
      envTokens: { slack: envToken },
      settings: createFileSettingsStore(home),
      logger: {
        level: 'trace',
        stream: new Writable({
          write(chunk: Buffer, _encoding, done) {
            log.push(chunk.toString());
            done();
          },
        }),
      },
    });
    const hub = app;
    const bodies: string[] = [];
    const call = async (method: 'GET' | 'PUT' | 'DELETE', url: string, payload?: object) => {
      const res = await hub.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) });
      bodies.push(res.body);
      return res;
    };
    const connection = apiRoutes.slackConnection;

    // A wrong token, the network failing, the rate limit, missing scopes, the .env token (refused here), then a good one.
    await call('PUT', connection, { token: wrongToken });
    slack.use(http.post(`${slackApi}/auth.test`, () => HttpResponse.error(), { once: true }));
    await call('PUT', connection, { token: slackToken });
    slack.use(
      http.post(
        `${slackApi}/auth.test`,
        () => HttpResponse.json({}, { status: 429, headers: { 'Retry-After': '9' } }),
        {
          once: true,
        },
      ),
    );
    await call('PUT', connection, { token: slackToken });
    slack.use(acceptingAuthTest({ scopes: ['search:read'] }));
    await call('PUT', connection, { token: slackToken });
    slack.resetHandlers();
    await call('PUT', connection, {});
    expect((await call('PUT', connection, { token: slackToken })).statusCode).toBe(200);
    const settingsWhileConnected = await readFile(settingsFilePath(home), 'utf8');
    await call('GET', apiRoutes.status);
    await call('GET', connection);
    await call('DELETE', connection);

    const everything = [...log, ...bodies, JSON.stringify(events), settingsWhileConnected].join('\n');
    expect(log.length).toBeGreaterThan(5);
    for (const secret of [slackToken, wrongToken, envToken]) expect(everything).not.toContain(secret);
    expect(everything).not.toContain('for-leaks');
  });
});
