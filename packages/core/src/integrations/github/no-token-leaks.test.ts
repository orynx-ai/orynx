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
import { ghToken, useFakeGhFolder } from '../../test/fake-gh.ts';
import { githubToken, userUrl, useFakeGitHub } from '../../test/fake-github.ts';
import { createGhCli } from './gh.ts';

const github = useFakeGitHub();
const fakeGhFolder = useFakeGhFolder();
const sessionToken = 'leaks-session-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: sessionToken };
const wrongToken = 'fake-wrong-token-for-leaks';
const staleGhToken = 'fake-stale-gh-token-for-leaks';
const ghOutput = 'fake-gh-output-for-leaks';
const envToken = 'fake-env-token-for-leaks';
const secrets = [githubToken, ghToken, wrongToken, staleGhToken, ghOutput, envToken];

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
  const folder = await fakeGhFolder();
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
    envTokens: { github: envToken },
    settings: createFileSettingsStore(home),
    gh: createGhCli({ searchPath: folder.dir, timeoutMs: 300 }),
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
  return { home, folder, log, events, bodies, call };
}

describe.skipIf(process.platform === 'win32')('GitHub tokens never leave core', () => {
  it("AC-17: no log line, response, event or settings.json holds a token, its header, or gh's output", async () => {
    const { home, folder, log, events, bodies, call } = await startHub();
    const connection = apiRoutes.githubConnection;

    // The gh way: gh fails with output, gh is too slow, gh hands out a token GitHub refuses, then a good one.
    await folder.install({ kind: 'fails', exitCode: 1, stderr: ghOutput });
    await call('PUT', connection, { method: 'gh' });
    await folder.install({ kind: 'slow' });
    await call('PUT', connection, { method: 'gh' });
    await folder.install({ kind: 'signed_in', token: staleGhToken });
    await call('PUT', connection, { method: 'gh' });
    await folder.install({ kind: 'signed_in' });
    expect((await call('PUT', connection, { method: 'gh' })).statusCode).toBe(200);
    await call('GET', apiRoutes.status);

    // The token way: a spaced token, a wrong one, the network failing, the rate limit, the .env token
    // (which GitHub refuses here), then a good one.
    await call('PUT', connection, { method: 'token', token: `${wrongToken} x` });
    await call('PUT', connection, { method: 'token', token: wrongToken });
    github.use(http.get(userUrl, () => HttpResponse.error(), { once: true }));
    await call('PUT', connection, { method: 'token', token: githubToken });
    github.use(
      http.get(userUrl, () => HttpResponse.json({}, { status: 429, headers: { 'Retry-After': '60' } }), { once: true }),
    );
    await call('PUT', connection, { method: 'token', token: githubToken });
    await call('PUT', connection, { method: 'token' });
    expect((await call('PUT', connection, { method: 'token', token: githubToken })).statusCode).toBe(200);
    const settingsWhileConnected = await readFile(settingsFilePath(home), 'utf8');
    expect(settingsWhileConnected).toContain('"method": "token"');
    await call('GET', apiRoutes.status);
    await call('GET', connection);
    await call('DELETE', connection);

    const everything = [...log, ...bodies, JSON.stringify(events), settingsWhileConnected].join('\n');
    expect(log.length).toBeGreaterThan(5);
    for (const secret of secrets) expect(everything).not.toContain(secret);
    expect(everything).not.toContain('for-leaks');
  });

  it('AC-17: the logger hides the token header octokit sends, wherever a log line carries one', async () => {
    const { log } = await startHub();
    const hub = app;
    if (hub === undefined) throw new Error('no hub');

    hub.log.warn({ request: { headers: { authorization: `token ${githubToken}` } } }, 'octokit style');
    hub.log.warn({ err: { response: { headers: { Authorization: `token ${ghToken}` } } } }, 'nested');

    const lines = log.filter((line) => /octokit style|nested/.test(line));
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).not.toContain(githubToken);
      expect(line).not.toContain(ghToken);
      expect(line).toContain('[redacted]');
    }
  });
});
