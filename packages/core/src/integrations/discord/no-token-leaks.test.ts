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
import { acceptingBot, discordApi, discordToken, useFakeDiscord } from '../../test/fake-discord.ts';

const discord = useFakeDiscord();
const sessionToken = 'leaks-session-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: sessionToken };
const wrongToken = 'fake-wrong-discord-token-for-leaks';
const envToken = 'fake-env-discord-token-for-leaks';

let app: FastifyInstance | undefined;
let home: string | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
  if (home !== undefined) await rm(home, { recursive: true, force: true });
  home = undefined;
});

describe.skipIf(process.platform === 'win32')('Discord tokens never leave core (spec 016)', () => {
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
      envTokens: { discord: envToken },
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
    const connection = apiRoutes.discordConnection;

    // A wrong token, the network failing, the rate limit, Message Content off, the .env token (refused here), then a
    // good one.
    await call('PUT', connection, { token: wrongToken });
    discord.use(http.get(`${discordApi}/users/@me`, () => HttpResponse.error(), { once: true }));
    await call('PUT', connection, { token: discordToken });
    discord.use(
      http.get(`${discordApi}/users/@me`, () => HttpResponse.json({ retry_after: 1 }, { status: 429 }), { once: true }),
    );
    await call('PUT', connection, { token: discordToken });
    discord.use(...acceptingBot({ flags: 0 }));
    await call('PUT', connection, { token: discordToken });
    discord.resetHandlers();
    await call('PUT', connection, {});
    expect((await call('PUT', connection, { token: discordToken })).statusCode).toBe(200);
    const settingsWhileConnected = await readFile(settingsFilePath(home), 'utf8');
    await call('GET', apiRoutes.status);
    await call('GET', connection);
    await call('DELETE', connection);

    const everything = [...log, ...bodies, JSON.stringify(events), settingsWhileConnected].join('\n');
    expect(log.length).toBeGreaterThan(5);
    for (const secret of [discordToken, wrongToken, envToken]) expect(everything).not.toContain(secret);
    expect(everything).not.toContain('for-leaks');
  });
});
