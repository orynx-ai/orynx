import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AgentModelsSchema, apiRoutes, CodexLoginSchema, StatusSchema, tokenHeader } from '@devhub/contracts';
import { createServer } from '../create-server.ts';
import { useFakeCodex, type FakeCodex } from '../test/fake-codex.ts';

const fakeCodex = useFakeCodex();
const token = 'codex-routes-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };
const email = 'fake-codex-user@company.example';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** The real hub, with a fake Codex, or none found on this computer. */
async function hub({ found = true }: { found?: boolean } = {}) {
  const fake = await fakeCodex();
  app = await createServer({
    token,
    port,
    version: 'test',
    userName: () => Promise.resolve(null),
    dataDir: await mkdtemp(join(tmpdir(), 'orynx-codex-hub-')),
    codex: { program: found ? fake.program : null, env: { PATH: '/usr/bin:/bin' }, sandbox: true },
  });
  return { app, fake };
}

/** Plays Codex for one app-server: answers `initialize`, then `method` with `result`. */
async function answer(fake: FakeCodex, method: string, result: unknown) {
  const codex = await fake.next();
  codex.reply((await codex.expectRequest('initialize')).id, {});
  await codex.read();
  codex.reply((await codex.expectRequest(method)).id, result);
}

async function get(server: FastifyInstance, url: string) {
  const response = await server.inject({ method: 'GET', url, headers });
  expect(response.statusCode).toBe(200);
  return response.json<unknown>();
}

describe.skipIf(process.platform === 'win32')('Codex login routes (spec 052)', () => {
  it('needs the session token, like every /api route', async () => {
    const { app } = await hub({ found: false });
    for (const [method, url] of [
      ['GET', apiRoutes.codexLogin],
      ['POST', apiRoutes.codexLoginCheck],
    ] as const) {
      expect((await app.inject({ method, url, headers: { host: headers.host } })).statusCode).toBe(401);
    }
  });

  it('AC-2: with no Codex on this computer, the card says not installed and Codex is not connected', async () => {
    const { app } = await hub({ found: false });
    expect(CodexLoginSchema.parse(await get(app, apiRoutes.codexLogin))).toEqual({ state: 'not_installed' });
    expect(StatusSchema.parse(await get(app, apiRoutes.status)).agents.codex).toEqual({ connected: false });
  });

  it('AC-1: signed in, the card gets the account, and Check again asks Codex again', async () => {
    const { app, fake } = await hub();
    const reading = get(app, apiRoutes.codexLogin);
    await answer(fake, 'account/read', { account: { type: 'chatgpt', email }, requiresOpenaiAuth: true });
    expect(CodexLoginSchema.parse(await reading)).toEqual({ state: 'signed_in', method: 'chatgpt', email });
    expect(StatusSchema.parse(await get(app, apiRoutes.status)).agents.codex).toEqual({ connected: true });

    const checking = app.inject({ method: 'POST', url: apiRoutes.codexLoginCheck, headers });
    await answer(fake, 'account/read', { account: null, requiresOpenaiAuth: true });
    expect((await checking).json()).toEqual({ state: 'signed_out' });
  });

  it("AC-4: lists Codex's models while it is signed in, and Claude's when the query names no agent", async () => {
    const { app, fake } = await hub();
    const listing = get(app, `${apiRoutes.agentModels}?agent=codex`);
    await answer(fake, 'account/read', { account: { type: 'apiKey' }, requiresOpenaiAuth: true });
    await answer(fake, 'model/list', {
      data: [{ model: 'gpt-5.5-codex', displayName: 'GPT-5.5 Codex', description: '', supportedReasoningEfforts: [] }],
    });
    expect(AgentModelsSchema.parse(await listing)).toEqual({
      state: 'ready',
      models: [{ value: 'gpt-5.5-codex', displayName: 'GPT-5.5 Codex', description: '', efforts: [] }],
    });
    // This hub has no Claude Code at all.
    expect(AgentModelsSchema.parse(await get(app, apiRoutes.agentModels))).toEqual({ state: 'unavailable' });
  });

  it('AC-4: no models while Codex is signed out, and it is never started to list them', async () => {
    const { app, fake } = await hub();
    const listing = get(app, `${apiRoutes.agentModels}?agent=codex`);
    await answer(fake, 'account/read', { account: null, requiresOpenaiAuth: true });
    expect(AgentModelsSchema.parse(await listing)).toEqual({ state: 'unavailable' });
    expect((await fake.runs()).filter((run) => run.args[0] === 'app-server')).toHaveLength(1);
  });

  it('refuses an agent it does not know', async () => {
    const { app } = await hub({ found: false });
    const response = await app.inject({ method: 'GET', url: `${apiRoutes.agentModels}?agent=gemini`, headers });
    expect(response.statusCode).toBe(400);
  });
});
