import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AgentModelsSchema, apiRoutes, tokenHeader } from '@devhub/contracts';
import { createClaudeCode } from '../agents/claude/claude-code.ts';
import { createServer } from '../create-server.ts';
import { useFakeClaudeFolder, type FakeClaudeBehaviour } from '../test/fake-claude.ts';
import { fakeClaudeSdk } from '../test/fake-claude-sdk.ts';

const fakeClaudeFolder = useFakeClaudeFolder();
const token = 'agent-models-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** The real hub, with a fake Claude Code for the login and the SDK faked at its boundary; or no Claude Code at all. */
async function hub(login: FakeClaudeBehaviour, { withAgent = true } = {}) {
  const folder = await fakeClaudeFolder();
  await folder.install(login);
  const sdk = fakeClaudeSdk([]);
  sdk.models = [
    { value: 'opus', displayName: 'Opus', description: 'Most capable', supportedEffortLevels: ['low', 'high'] },
  ];
  app = await createServer({
    token,
    port,
    version: 'test',
    userName: () => Promise.resolve(null),
    claudeCode: createClaudeCode({
      program: folder.program,
      env: { PATH: '/usr/bin:/bin' },
      workFolder: folder.workFolder,
    }),
    ...(withAgent ? { agent: { query: sdk.query, program: folder.program, env: { PATH: '/usr/bin:/bin' } } } : {}),
  });
  return { app, sdk };
}

async function readModels(server: FastifyInstance) {
  const response = await server.inject({ method: 'GET', url: apiRoutes.agentModels, headers });
  expect(response.statusCode).toBe(200);
  return AgentModelsSchema.parse(response.json());
}

describe.skipIf(process.platform === 'win32')('GET /api/agent/models', () => {
  it('needs the session token, like every /api route', async () => {
    const { app } = await hub({ kind: 'signed_in' });
    const response = await app.inject({ method: 'GET', url: apiRoutes.agentModels, headers: { host: headers.host } });
    expect(response.statusCode).toBe(401);
  });

  it('lists the models Claude Code offers while it is signed in', async () => {
    const { app } = await hub({ kind: 'signed_in' });
    expect(await readModels(app)).toEqual({
      state: 'ready',
      models: [{ value: 'opus', displayName: 'Opus', description: 'Most capable', efforts: ['low', 'high'] }],
    });
  });

  it('is unavailable, without starting Claude Code, when it is signed out or there is none', async () => {
    const signedOut = await hub({ kind: 'signed_out' });
    expect(await readModels(signedOut.app)).toEqual({ state: 'unavailable' });
    expect(signedOut.sdk.runs).toEqual([]);
    await signedOut.app.close();

    const none = await hub({ kind: 'signed_in' }, { withAgent: false });
    expect(await readModels(none.app)).toEqual({ state: 'unavailable' });
  });
});
