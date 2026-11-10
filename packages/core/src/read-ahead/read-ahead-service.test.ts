import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, InboxSchema, SessionListSchema, tokenHeader } from '@devhub/contracts';
import { createClaudeCode } from '../agents/claude/claude-code.ts';
import { createServer } from '../create-server.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { openFileSessionStore } from '../sessions/file-session-store.ts';
import { createMemorySettingsStore } from '../settings/settings-store.ts';
import { fakeClaudeSdk, type FakeTurn } from '../test/fake-claude-sdk.ts';
import { useFakeClaudeFolder } from '../test/fake-claude.ts';
import {
  acceptingInboxQuery,
  acceptingPullContext,
  acceptingPullDiff,
  githubLogin,
  githubToken,
  type FakePull,
} from '../test/fake-github.ts';

// A real server and session store; only Claude Code and GitHub are faked.
vi.setConfig({ testTimeout: 30_000 });

const tools = setupServer();
beforeAll(() => {
  tools.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  tools.resetHandlers();
});
afterAll(() => {
  tools.close();
});

const fakeClaudeFolder = useFakeClaudeFolder();
const token = 'read-ahead-session-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };

let app: FastifyInstance | undefined;
let home: string | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
  if (home !== undefined) await rm(home, { recursive: true, force: true });
  home = undefined;
});

/** A review asked of you on acme/web-app, by someone else. */
const asked = (number: number): FakePull => ({
  number,
  title: `Pull request ${String(number)}`,
  author: { login: 'priya' },
  requests: [{ login: githubLogin, at: '2026-11-09T09:00:00Z' }],
});

async function hub(script: readonly FakeTurn[] = [{ finish: 'Looks good.' }]) {
  home = await realpath(await mkdtemp(join(tmpdir(), 'devhub-read-ahead-')));
  const folder = await fakeClaudeFolder();
  await folder.install({ kind: 'signed_in' });
  const numbers = [2836, 2837, 2838];
  // The inbox's fake answers any query, so a review's own reads go before it, each time it's set.
  const pulls = [
    acceptingPullContext(numbers.map((number) => ({ number, title: `Pull request ${String(number)}`, body: null }))),
    acceptingPullDiff(numbers.map((number) => ({ number, diff: 'diff --git a/a.ts b/a.ts\n+x' }))),
  ];
  const sdk = fakeClaudeSdk(script);
  app = await createServer({
    token,
    port,
    version: 'test',
    userName: () => Promise.resolve(null),
    keychain: createMemoryKeychain({ github: githubToken }),
    settings: createMemorySettingsStore({ github: { method: 'token' } }),
    dataDir: home,
    sessions: await openFileSessionStore(home),
    claudeCode: createClaudeCode({
      program: folder.program,
      env: { PATH: '/usr/bin:/bin' },
      workFolder: folder.workFolder,
    }),
    agent: { query: sdk.query, program: '/opt/claude/claude', env: { PATH: '/usr/bin:/bin' }, sandbox: true },
  });
  const server = app;
  const call = async (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
    server.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) });
  await call('POST', apiRoutes.claudeLoginCheck);
  return {
    /** GitHub now asks for these reviews, and the inbox syncs. */
    sync: async (reviews: FakePull[]) => {
      tools.use(...pulls, acceptingInboxQuery({ reviews }));
      expect((await call('POST', apiRoutes.inboxRefresh)).statusCode).toBeLessThan(300);
    },
    turn: async (on: boolean) => {
      expect((await call('PATCH', apiRoutes.preferences, { readReviewsAhead: on })).statusCode).toBe(200);
    },
    sessions: async () => SessionListSchema.parse((await call('GET', apiRoutes.sessions)).json()).sessions,
    row: async (number: number) =>
      InboxSchema.parse((await call('GET', apiRoutes.inbox)).json()).items.find(
        (item) => item.id === `github:acme/web-app#${String(number)}`,
      ),
  };
}

describe.skipIf(process.platform === 'win32')('Read review requests ahead (spec 057, D)', () => {
  it('AC-35, AC-36, AC-37: a request that arrives after turning it on starts a review, and its row follows it', async () => {
    const set = await hub();
    await set.turn(true);
    await set.sync([asked(2836)]);
    expect(await set.sessions()).toEqual([]);

    await set.sync([asked(2836), asked(2837)]);

    await vi.waitFor(async () => {
      expect((await set.sessions()).map(({ title }) => title)).toEqual(['Review web-app #2837']);
    });
    const [review] = await set.sessions();
    await vi.waitFor(async () => {
      expect((await set.row(2837))?.readAhead).toEqual({ state: 'ready', sessionId: review?.id });
    });
    expect((await set.row(2836))?.readAhead).toBeNull();
  });

  it('AC-11 (spec 057, D): with the row off, nothing is read', async () => {
    const set = await hub();
    await set.sync([asked(2836)]);
    await set.sync([asked(2836), asked(2837)]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await set.sessions()).toEqual([]);
  });

  it('AC-38, AC-40: one at a time, the next one waiting its turn, and turning it off drops the wait', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const set = await hub([{ gate }, { finish: 'Looks good.' }]);
    await set.turn(true);
    await set.sync([]);
    await set.sync([asked(2837), asked(2838)]);

    await vi.waitFor(async () => {
      expect((await set.row(2837))?.readAhead).toMatchObject({ state: 'reading' });
    });
    expect((await set.row(2838))?.readAhead).toEqual({ state: 'waiting', sessionId: null });

    await set.turn(false);
    await vi.waitFor(async () => {
      expect((await set.row(2838))?.readAhead).toBeNull();
    });
    release();
    await vi.waitFor(async () => {
      expect((await set.row(2837))?.readAhead).toMatchObject({ state: 'ready' });
    });
    expect(await set.sessions()).toHaveLength(1);
  });
});
