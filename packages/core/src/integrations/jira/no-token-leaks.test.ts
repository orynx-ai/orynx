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
import { goodBasicValue, goodToken, jiraEmail, myselfUrl, useFakeJira } from '../../test/fake-jira.ts';

const jira = useFakeJira();
const sessionToken = 'leaks-session-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: sessionToken };
const wrongToken = 'fake-wrong-token-for-leaks';
const spacedToken = 'fake-spaced token-for-leaks';
const secrets = [goodToken, goodBasicValue, wrongToken, Buffer.from(`${jiraEmail}:${wrongToken}`).toString('base64')];

let app: FastifyInstance | undefined;
let home: string | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
  if (home !== undefined) await rm(home, { recursive: true, force: true });
  home = undefined;
});

/** The real hub at trace level, with every log line, event and response body kept for searching. */
async function startHub() {
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
  const bodies: string[] = [];
  const hub = app;
  const call = async (method: 'GET' | 'PUT' | 'DELETE', url: string, payload?: object) => {
    const res = await hub.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) });
    bodies.push(res.body);
    return res;
  };
  return { app: hub, home, log, events, bodies, call };
}

describe('Jira tokens never leave core', () => {
  it('AC-15: no log line, response, event or settings.json holds the token or its Basic value', async () => {
    const { home, log, events, bodies, call } = await startHub();
    const connection = apiRoutes.jiraConnection;
    const site = 'your-team.atlassian.net';

    await call('PUT', connection, { site, email: jiraEmail, apiToken: spacedToken });
    await call('PUT', connection, { site, email: jiraEmail, apiToken: wrongToken });
    jira.use(http.get(myselfUrl(), () => HttpResponse.error(), { once: true }));
    await call('PUT', connection, { site, email: jiraEmail, apiToken: goodToken });
    expect((await call('PUT', connection, { site, email: jiraEmail, apiToken: goodToken })).statusCode).toBe(200);
    const settingsWhileConnected = await readFile(settingsFilePath(home), 'utf8');
    expect(settingsWhileConnected).toContain(site);
    await call('GET', apiRoutes.status);
    await call('GET', connection);
    await call('DELETE', connection);

    const everything = [...log, ...bodies, JSON.stringify(events), settingsWhileConnected].join('\n');
    expect(log.length).toBeGreaterThan(5);
    for (const secret of secrets) expect(everything).not.toContain(secret);
    expect(everything).not.toContain('token-for-leaks');
  });

  it('AC-15: the logger hides an authorization header wherever a log line carries one', async () => {
    const { app, log } = await startHub();

    app.log.warn({ headers: { authorization: `Basic ${goodBasicValue}` } }, 'direct');
    app.log.warn({ request: { headers: { Authorization: `Basic ${goodBasicValue}` } } }, 'nested');
    app.log.warn({ error: { config: { headers: { Authorization: `Basic ${goodBasicValue}` } } } }, 'axios style');

    const lines = log.filter((line) => /direct|nested|axios style/.test(line));
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line).not.toContain(goodBasicValue);
      expect(line).toContain('[redacted]');
    }
  });
});
