import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  AddTerminalTabAnswerSchema,
  apiRoutes,
  ApiErrorSchema,
  RunCommandAnswerSchema,
  SessionSchema,
  TerminalSchema,
  tokenHeader,
  type Session,
  type Terminal,
} from '@devhub/contracts';
import { makeSession } from '@devhub/contracts/testing';
import { createServer } from '../create-server.ts';
import { createMemorySessionStore } from '../sessions/session-store.ts';

const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };
const id = '0123456789abcdef';

let app: FastifyInstance | undefined;
const folders: string[] = [];

afterEach(async () => {
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
  });
  const env = { PATH: '/usr/bin:/bin', HOME: home, SHELL: '/bin/sh' };
  app = await createServer({
    token,
    port,
    version: '1.2.3',
    sessions: store,
    userHome: home,
    ...(terminal ? { terminal: { env } } : {}),
  });
  return { app, worktree };
}

const path = (route: string, tabId = 'tab-1', blockId = '') =>
  route.replace(':id', id).replace(':tabId', tabId).replace(':blockId', blockId);

async function readTerminal(server: FastifyInstance): Promise<Terminal> {
  const res = await server.inject({ method: 'GET', url: path(apiRoutes.sessionTerminal), headers });
  expect(res.statusCode).toBe(200);
  return TerminalSchema.parse(res.json());
}

/** The first tab's last block once it has ended. */
async function lastEnded(server: FastifyInstance) {
  for (let tries = 0; tries < 500; tries++) {
    const block = (await readTerminal(server)).tabs[0]?.blocks.at(-1);
    if (block !== undefined && block.state !== 'running') return block;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The command never ended');
}

describe('the Terminal’s routes', () => {
  it('AC-1, AC-4: reads your shell tabs, runs a command in the worktree, and shows its output', async () => {
    const { app, worktree } = await setUp();
    expect(await readTerminal(app)).toEqual({
      shell: 'sh',
      worktree: `~/.devhub/worktrees/${id}`,
      tabs: [{ id: 'tab-1', number: 1, blocks: [], cleared: false }],
      history: [],
    });

    const run = await app.inject({
      method: 'POST',
      url: path(apiRoutes.sessionTerminalRun),
      headers,
      payload: { command: 'pwd' },
    });
    expect(RunCommandAnswerSchema.parse(run.json())).toEqual({ result: 'started', blockId: 'block-1' });
    expect(await lastEnded(app)).toMatchObject({ state: 'done', command: 'pwd', output: [worktree] });
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
    const run = await app.inject({
      method: 'POST',
      url: path(apiRoutes.sessionTerminalRun),
      headers,
      payload: { command: 'ls' },
    });
    expect(run.statusCode).toBe(404);
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
      url: path(apiRoutes.sessionTerminalRun),
      headers: { host: headers.host },
      payload: { command: 'touch here' },
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it('AC-4: refuses a command with nothing in it, and answers 404 for a tab it doesn’t have', async () => {
    const { app } = await setUp();
    const empty = await app.inject({
      method: 'POST',
      url: path(apiRoutes.sessionTerminalRun),
      headers,
      payload: { command: '  ' },
    });
    expect(empty.statusCode).toBe(400);
    const noTab = await app.inject({
      method: 'POST',
      url: path(apiRoutes.sessionTerminalRun, 'tab-9'),
      headers,
      payload: { command: 'ls' },
    });
    expect(noTab.statusCode).toBe(404);
  });

  it('AC-8, AC-9: a busy tab says so, and Stop ends its command', async () => {
    const { app } = await setUp();
    const run = (command: string) =>
      app.inject({ method: 'POST', url: path(apiRoutes.sessionTerminalRun), headers, payload: { command } });
    await run('sleep 30');
    expect((await run('ls')).json()).toEqual({ result: 'busy' });

    const stop = await app.inject({ method: 'POST', url: path(apiRoutes.sessionTerminalStop), headers });
    expect(stop.statusCode).toBe(204);
    expect(await lastEnded(app)).toMatchObject({ state: 'failed', exitCode: 143 });
  });

  it('AC-10, AC-11, AC-15: adds a tab, closes it, keeps the first, and clears a tab', async () => {
    const { app } = await setUp();
    await readTerminal(app);
    const added = await app.inject({ method: 'POST', url: path(apiRoutes.sessionTerminalTabs), headers });
    expect(AddTerminalTabAnswerSchema.parse(added.json())).toEqual({ result: 'added', tabId: 'tab-2' });

    const close = (tabId: string) =>
      app.inject({ method: 'DELETE', url: path(apiRoutes.sessionTerminalTab, tabId), headers });
    expect((await close('tab-2')).statusCode).toBe(204);
    expect((await close('tab-1')).statusCode).toBe(404);

    const clear = await app.inject({ method: 'DELETE', url: path(apiRoutes.sessionTerminalBlocks), headers });
    expect(clear.statusCode).toBe(204);
    expect((await readTerminal(app)).tabs).toEqual([{ id: 'tab-1', number: 1, blocks: [], cleared: true }]);
  });
});
