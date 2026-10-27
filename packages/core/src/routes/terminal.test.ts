import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  AddTerminalTabAnswerSchema,
  apiRoutes,
  ApiErrorSchema,
  homeTerminalId,
  SessionSchema,
  TerminalOutputSchema,
  TerminalSchema,
  tokenHeader,
  tokenQueryParam,
  type Session,
  type Terminal,
  type TerminalOutput,
} from '@devhub/contracts';
import { makeSession } from '@devhub/contracts/testing';
import { createServer } from '../create-server.ts';
import { createMemorySessionStore } from '../sessions/session-store.ts';

const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };
const id = '0123456789abcdef';

let app: FastifyInstance | undefined;
let stream: IncomingMessage | undefined;
const folders: string[] = [];

afterEach(async () => {
  stream?.destroy();
  stream = undefined;
  await app?.close();
  app = undefined;
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

/** A server with your shell, holding one session whose worktree is a real folder under the user's home. */
async function setUp({ session = {}, terminal = true }: { session?: Partial<Session>; terminal?: boolean } = {}) {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'orynx-home-')));
  folders.push(home);
  const worktree = join(home, '.devhub', 'worktrees', id);
  await mkdir(worktree, { recursive: true });
  const store = createMemorySessionStore();
  await store.create({
    session: makeSession({ id, mode: 'build', ...session }),
    repository: { id: '00000000000000aa', path: '/nowhere/web-app' },
    worktree,
    startCommit: null,
    claudeSessionId: null,
    pushedCommit: null,
    approvalLog: [],
    commandLog: [],
    commandsDropped: 0,
  });
  const env = { PATH: '/usr/bin:/bin', HOME: home, SHELL: '/bin/sh' };
  app = await createServer({
    token,
    port,
    version: '1.2.3',
    sessions: store,
    userHome: home,
    dataDir: join(home, '.devhub'),
    ...(terminal ? { terminal: { env } } : {}),
  });
  return { app, worktree, orynxHome: join(home, '.devhub') };
}

const path = (route: string, tabId = 'tab-1', terminalId = id) =>
  route.replace(':id', terminalId).replace(':tabId', tabId);

async function readTerminal(server: FastifyInstance): Promise<Terminal> {
  const res = await server.inject({ method: 'GET', url: path(apiRoutes.sessionTerminal), headers });
  expect(res.statusCode).toBe(200);
  return TerminalSchema.parse(res.json());
}

/** Opens a tab's output over a real socket, the way the page's EventSource does, with the token in its URL. */
async function openOutput(server: FastifyInstance, { tabId = 'tab-1', key = token, terminalId = id } = {}) {
  await server.listen({ host: '127.0.0.1', port: 0 });
  const { port: real } = server.server.address() as AddressInfo;
  stream = await new Promise<IncomingMessage>((resolve, reject) => {
    httpRequest(
      {
        host: '127.0.0.1',
        port: real,
        path: `${path(apiRoutes.sessionTerminalOutput, tabId, terminalId)}?${tokenQueryParam}=${key}`,
      },
      resolve,
    )
      .on('error', reject)
      .end();
  });
  stream.setEncoding('utf8');
  const frames: TerminalOutput[] = [];
  let buffer = '';
  stream.on('data', (chunk: string) => {
    buffer += chunk;
    for (let end = buffer.indexOf('\n\n'); end !== -1; end = buffer.indexOf('\n\n')) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (frame.startsWith('data: ')) frames.push(TerminalOutputSchema.parse(JSON.parse(frame.slice(6))));
    }
  });
  const hostHeaders = { ...headers, host: `127.0.0.1:${String(real)}` };
  // The replay comes first, right after the headers.
  for (let tries = 0; tries < 500 && stream.statusCode === 200 && frames.length === 0; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return {
    status: stream.statusCode,
    frames,
    hostHeaders,
    async shows(piece: string): Promise<void> {
      for (let tries = 0; tries < 500; tries++) {
        if (
          frames
            .map((frame) => frame.data)
            .join('')
            .includes(piece)
        )
          return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`The output never showed ${piece}`);
    },
  };
}

describe('the Terminal’s routes', () => {
  it('AC-1 (038): reads your shell tabs, and the first one’s shell starts in the worktree', async () => {
    const { app } = await setUp();
    expect(await readTerminal(app)).toEqual({
      shell: 'sh',
      worktree: `~/.devhub/worktrees/${id}`,
      tabs: [{ id: 'tab-1', number: 1, server: null }],
    });
  });

  it('AC-1, AC-2, AC-4 (038): streams the tab’s output, and takes your keys and its size', async () => {
    const { app, worktree } = await setUp();
    await readTerminal(app);
    const output = await openOutput(app);
    expect(output.status).toBe(200);
    expect(output.frames[0]?.kind).toBe('replay');

    const send = (route: string, payload: object) =>
      app.inject({ method: 'POST', url: path(route), headers: output.hostHeaders, payload });
    expect((await send(apiRoutes.sessionTerminalSize, { cols: 100, rows: 30 })).statusCode).toBe(204);
    expect((await send(apiRoutes.sessionTerminalInput, { data: 'pwd; stty size\r' })).statusCode).toBe(204);
    await output.shows(`${worktree}\r\n30 100\r\n`);
  });

  it('AC-3: says the Terminal opens on this session, and nothing opens where it can’t', async () => {
    const { app } = await setUp();
    const res = await app.inject({ method: 'GET', url: path(apiRoutes.session), headers });
    expect(SessionSchema.parse(res.json()).terminal).toBe(true);
  });

  it.each([
    ['an Ask session', { session: { mode: 'ask' as const } }],
    ['a discarded session', { session: { discardedAt: '2026-10-20T10:00:00.000Z' } }],
    ['a server with no terminal (Windows)', { terminal: false }],
  ])('AC-3: answers 404 for %s, whose session says it has no Terminal', async (_, options) => {
    const { app } = await setUp(options);
    const res = await app.inject({ method: 'GET', url: path(apiRoutes.sessionTerminal), headers });
    expect(res.statusCode).toBe(404);
    expect(ApiErrorSchema.parse(res.json()).code).toBe('not_found');
    const input = await app.inject({
      method: 'POST',
      url: path(apiRoutes.sessionTerminalInput),
      headers,
      payload: { data: 'ls\r' },
    });
    expect(input.statusCode).toBe(404);
    const session = await app.inject({ method: 'GET', url: path(apiRoutes.session), headers });
    expect(SessionSchema.parse(session.json()).terminal).toBe(false);
  });

  it('answers 404 for a session it doesn’t have, and 401 without the session token', async () => {
    const { app } = await setUp();
    const missing = await app.inject({
      method: 'GET',
      url: apiRoutes.sessionTerminal.replace(':id', 'fedcba9876543210'),
      headers,
    });
    expect(missing.statusCode).toBe(404);
    const anonymous = await app.inject({
      method: 'POST',
      url: path(apiRoutes.sessionTerminalInput),
      headers: { host: headers.host },
      payload: { data: 'touch here\r' },
    });
    expect(anonymous.statusCode).toBe(401);
    // Only the output stream takes the token in its URL.
    const inUrl = await app.inject({
      method: 'POST',
      url: `${path(apiRoutes.sessionTerminalInput)}?${tokenQueryParam}=${token}`,
      headers: { host: headers.host },
      payload: { data: 'touch here\r' },
    });
    expect(inUrl.statusCode).toBe(401);
  });

  it('refuses the output stream with a wrong token', async () => {
    const { app } = await setUp();
    await readTerminal(app);
    expect((await openOutput(app, { key: 'not-the-token' })).status).toBe(401);
  });

  it('answers 404 for a tab it doesn’t have, and 400 for empty keys or a size out of range', async () => {
    const { app } = await setUp();
    await readTerminal(app);
    const post = (route: string, payload: object, tabId = 'tab-1') =>
      app.inject({ method: 'POST', url: path(route, tabId), headers, payload });
    expect((await post(apiRoutes.sessionTerminalInput, { data: '' })).statusCode).toBe(400);
    expect((await post(apiRoutes.sessionTerminalSize, { cols: 0, rows: 24 })).statusCode).toBe(400);
    expect((await post(apiRoutes.sessionTerminalInput, { data: 'ls\r' }, 'tab-9')).statusCode).toBe(404);
    expect((await post(apiRoutes.sessionTerminalSize, { cols: 80, rows: 24 }, 'tab-9')).statusCode).toBe(404);
    const output = await app.inject({ method: 'GET', url: path(apiRoutes.sessionTerminalOutput, 'tab-9'), headers });
    expect(output.statusCode).toBe(404);
  });

  it('AC-6 (038): adds a tab, closes it, and keeps the first', async () => {
    const { app } = await setUp();
    await readTerminal(app);
    const added = await app.inject({ method: 'POST', url: path(apiRoutes.sessionTerminalTabs), headers });
    expect(AddTerminalTabAnswerSchema.parse(added.json())).toEqual({ result: 'added', tabId: 'tab-2' });

    const close = (tabId: string) =>
      app.inject({ method: 'DELETE', url: path(apiRoutes.sessionTerminalTab, tabId), headers });
    expect((await close('tab-2')).statusCode).toBe(204);
    expect((await close('tab-1')).statusCode).toBe(404);
    expect((await readTerminal(app)).tabs).toEqual([{ id: 'tab-1', number: 1, server: null }]);
  });

  it('Home’s Terminal: your shell in Orynx’s home folder, under its own id, with the same token checks', async () => {
    const { app, orynxHome } = await setUp();
    const home = (route: string) => path(route, 'tab-1', homeTerminalId);
    const read = await app.inject({ method: 'GET', url: home(apiRoutes.sessionTerminal), headers });
    expect(TerminalSchema.parse(read.json())).toEqual({
      shell: 'sh',
      worktree: '~/.devhub',
      tabs: [{ id: 'tab-1', number: 1, server: null }],
    });

    const output = await openOutput(app, { terminalId: homeTerminalId });
    expect(output.status).toBe(200);
    const input = (headers: Record<string, string>) =>
      app.inject({ method: 'POST', url: home(apiRoutes.sessionTerminalInput), headers, payload: { data: 'pwd\r' } });
    expect((await input({ host: output.hostHeaders.host })).statusCode).toBe(401);
    expect((await input(output.hostHeaders)).statusCode).toBe(204);
    await output.shows(`${orynxHome}\r\n`);
  });
});
