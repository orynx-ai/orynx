import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, tokenHeader, UpdatesSchema } from '@devhub/contracts';
import { makeSessionSummary } from '@devhub/contracts/testing';
import { createServer, type CoreOptions } from '../create-server.ts';
import { createMemorySessionStore } from '../sessions/session-store.ts';
import { answeringReleases, githubRelease, useFakeReleases } from '../test/fake-releases.ts';
import { fakeHost } from '../test/fake-update-host.ts';

const fakeReleases = useFakeReleases();
const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };

const servers: FastifyInstance[] = [];
let asked: number;

beforeEach(() => {
  asked = 0;
  fakeReleases.events.on('request:start', () => {
    asked += 1;
  });
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((app) => app.close()));
});

async function server(options: Partial<CoreOptions> = {}) {
  const app = await createServer({ token, port, version: '0.1.37', ...options });
  servers.push(app);
  return app;
}

describe('/api/updates (spec 045)', () => {
  it('answers 401 without the session token', async () => {
    const app = await server({ updates: { host: fakeHost().host } });
    for (const call of [
      { method: 'GET', url: apiRoutes.updates },
      { method: 'POST', url: apiRoutes.updatesCheck },
      { method: 'POST', url: apiRoutes.updatesInstall, payload: { step: 'update' } },
    ] as const) {
      expect((await app.inject({ ...call, headers: { host: headers.host } })).statusCode).toBe(401);
    }
  });

  it('AC-12: a hub given no updates never asks GitHub, and has no updates to show', async () => {
    const app = await server();
    expect((await app.inject({ method: 'GET', url: apiRoutes.updates, headers })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: apiRoutes.updatesCheck, headers })).statusCode).toBe(404);
    expect(asked).toBe(0);
  });

  it('AC-6, AC-12: asks GitHub once at start, and GET answers from that check', async () => {
    fakeReleases.use(answeringReleases([githubRelease({ tag_name: 'v0.1.37' })]));
    const app = await server({ updates: { host: fakeHost().host } });
    await expect
      .poll(async () => {
        const updates = UpdatesSchema.parse(
          (await app.inject({ method: 'GET', url: apiRoutes.updates, headers })).json(),
        );
        return updates.checkedAt !== null && !updates.checking;
      })
      .toBe(true);
    const res = await app.inject({ method: 'GET', url: apiRoutes.updates, headers });
    expect(res.statusCode).toBe(200);
    expect(UpdatesSchema.parse(res.json()).releases).toEqual([
      expect.objectContaining({ version: '0.1.37', newer: false, mine: true }),
    ]);
    expect(asked).toBe(1);
  });

  it('AC-9: Check for updates answers from the last check when GitHub was asked less than a minute ago', async () => {
    const app = await server({ updates: { host: fakeHost().host } });
    const first = await app.inject({ method: 'POST', url: apiRoutes.updatesCheck, headers });
    const second = await app.inject({ method: 'POST', url: apiRoutes.updatesCheck, headers });
    expect(first.statusCode).toBe(200);
    expect(UpdatesSchema.parse(second.json()).checkedAt).toBe(UpdatesSchema.parse(first.json()).checkedAt);
    expect(asked).toBe(1);
  });

  it('AC-19, AC-25: Update asks the host to update to the newest release', async () => {
    const { host, pressed } = fakeHost();
    const app = await server({ updates: { host } });
    await app.inject({ method: 'POST', url: apiRoutes.updatesCheck, headers });
    const res = await app.inject({
      method: 'POST',
      url: apiRoutes.updatesInstall,
      headers,
      payload: { step: 'update' },
    });
    expect(res.statusCode).toBe(200);
    expect(UpdatesSchema.parse(res.json()).update).toEqual({ state: 'downloading', version: '0.1.40' });
    expect(pressed).toEqual(['update 0.1.40']);
  });

  it('AC-22, AC-29: refuses with 409 while a session works, and when there is nothing to do', async () => {
    const { host, pressed } = fakeHost();
    const sessions = createMemorySessionStore([makeSessionSummary({ state: 'working' })]);
    const busy = await server({ updates: { host }, sessions });
    await busy.inject({ method: 'POST', url: apiRoutes.updatesCheck, headers });
    const refused = await busy.inject({
      method: 'POST',
      url: apiRoutes.updatesInstall,
      headers,
      payload: { step: 'update' },
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ code: 'session_working', message: 'Stop the running sessions first.' });

    const idle = await server({ updates: { host } });
    await idle.inject({ method: 'POST', url: apiRoutes.updatesCheck, headers });
    const early = await idle.inject({
      method: 'POST',
      url: apiRoutes.updatesInstall,
      headers,
      payload: { step: 'restart' },
    });
    expect(early.statusCode).toBe(409);
    expect(early.json()).toMatchObject({ code: 'update_unavailable' });
    expect(pressed).toEqual([]);

    const odd = await idle.inject({
      method: 'POST',
      url: apiRoutes.updatesInstall,
      headers,
      payload: { step: 'rm -rf' },
    });
    expect(odd.statusCode).toBe(400);
  });
});
