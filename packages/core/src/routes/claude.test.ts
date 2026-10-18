import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, ClaudeLoginSchema, StatusSchema, tokenHeader, type ServerEvent } from '@devhub/contracts';
import { createClaudeCode } from '../agents/claude/claude-code.ts';
import { createServer } from '../create-server.ts';
import { createEventBus } from '../events/event-bus.ts';
import { claudeEmail, claudeOrganisation, useFakeClaudeFolder, type FakeClaudeBehaviour } from '../test/fake-claude.ts';

const fakeClaudeFolder = useFakeClaudeFolder();
const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };
const signedIn = { state: 'signed_in', method: 'claude_ai', email: claudeEmail, organisation: claudeOrganisation };

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** The real hub, with a fake Claude Code that behaves as asked. */
async function server(behaviour: FakeClaudeBehaviour) {
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  const folder = await fakeClaudeFolder();
  await folder.install(behaviour);
  app = await createServer({
    token,
    port,
    version: '1.2.3',
    events,
    userName: () => Promise.resolve(null),
    claudeCode: createClaudeCode({
      program: folder.program,
      env: { PATH: '/usr/bin:/bin' },
      workFolder: folder.workFolder,
    }),
  });
  return { app, seen, folder };
}

async function readLogin(hub: FastifyInstance) {
  const response = await hub.inject({ method: 'GET', url: apiRoutes.claudeLogin, headers });
  expect(response.statusCode).toBe(200);
  return ClaudeLoginSchema.parse(response.json());
}

async function readStatus(hub: FastifyInstance) {
  const response = await hub.inject({ method: 'GET', url: apiRoutes.status, headers });
  expect(response.statusCode).toBe(200);
  return StatusSchema.parse(response.json());
}

describe.skipIf(process.platform === 'win32')('Claude login routes', () => {
  it('needs the session token, like every /api route', async () => {
    const { app } = await server({ kind: 'signed_in' });

    for (const [method, url] of [
      ['GET', apiRoutes.claudeLogin],
      ['POST', apiRoutes.claudeLoginCheck],
    ] as const) {
      const response = await app.inject({ method, url, headers: { host: headers.host } });
      expect(response.statusCode).toBe(401);
    }
  });

  it('AC-1, AC-2: signed in, the card gets the account and the footer says connected, from one check', async () => {
    const { app, folder } = await server({ kind: 'signed_in' });

    expect(await readLogin(app)).toEqual(signedIn);
    expect((await readStatus(app)).agent).toEqual({ id: 'claude', connected: true });
    expect(await folder.runs()).toHaveLength(1);
  });

  it('AC-4: signed out, the card says so, the footer says not connected, and the rest answers', async () => {
    const { app } = await server({ kind: 'signed_out' });

    expect(await readLogin(app)).toEqual({ state: 'signed_out' });
    const status = await readStatus(app);
    expect(status.agent.connected).toBe(false);
    expect(status.integrations.jira.state).toBe('not_connected');
  });

  it('AC-6: a crashed check is an error on the card, never a failed request, and the rest answers', async () => {
    const { app } = await server({ kind: 'crashes', exitCode: 1, stderr: 'boom' });

    expect(await readLogin(app)).toEqual({ state: 'error' });
    const status = await readStatus(app);
    expect(status.agent.connected).toBe(false);
    expect(status.integrations.github.state).toBe('not_connected');
  });

  it('AC-5: Check again checks at once, answers with the new login, and tells every page', async () => {
    const { app, folder, seen } = await server({ kind: 'signed_out' });
    expect(await readLogin(app)).toEqual({ state: 'signed_out' });
    await folder.install({ kind: 'signed_in' });

    const response = await app.inject({ method: 'POST', url: apiRoutes.claudeLoginCheck, headers });

    expect(response.statusCode).toBe(200);
    expect(ClaudeLoginSchema.parse(response.json())).toEqual(signedIn);
    expect(seen).toEqual([{ type: 'status.changed' }]);
    expect((await readStatus(app)).agent.connected).toBe(true);
    expect(await folder.runs()).toHaveLength(2);
  });

  it('AC-12: a hub built with no program says Claude is not connected and starts nothing', async () => {
    const folder = await fakeClaudeFolder();
    await folder.install({ kind: 'signed_in' });
    app = await createServer({ token, port, version: '1.2.3', userName: () => Promise.resolve(null) });

    expect(await readLogin(app)).toEqual({ state: 'error' });
    expect((await readStatus(app)).agent.connected).toBe(false);
    expect(await folder.runs()).toEqual([]);
  });
});
