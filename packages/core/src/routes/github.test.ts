import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  apiRoutes,
  ApiErrorSchema,
  GitHubConnectionSchema,
  StatusSchema,
  tokenHeader,
  type ServerEvent,
} from '@devhub/contracts';
import { createServer, type CoreOptions } from '../create-server.ts';
import { createEventBus } from '../events/event-bus.ts';
import { createGhCli } from '../integrations/github/gh.ts';
import type { Keychain } from '../secrets/keychain.ts';
import { createMemoryKeychain, createUnreachableKeychain } from '../secrets/memory-keychain.ts';
import { createMemorySettingsStore } from '../settings/settings-store.ts';
import { useFakeGhFolder } from '../test/fake-gh.ts';
import { githubToken, userUrl, useFakeGitHub } from '../test/fake-github.ts';

const github = useFakeGitHub();
const fakeGhFolder = useFakeGhFolder();
const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };

let app: FastifyInstance | undefined;

/** The real hub, with a signed-in fake gh on its search path. */
async function server(rest: Partial<CoreOptions> & { keychain?: Keychain } = {}) {
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  const keychain = rest.keychain ?? createMemoryKeychain();
  const folder = await fakeGhFolder();
  await folder.install({ kind: 'signed_in' });
  app = await createServer({
    token,
    port,
    version: '1.2.3',
    events,
    userName: () => Promise.resolve(null),
    gh: createGhCli({ searchPath: folder.dir }),
    ...rest,
    keychain,
  });
  return { app, keychain, seen, folder };
}

afterEach(async () => {
  github.events.removeAllListeners();
  await app?.close();
  app = undefined;
});

function githubCalls(): () => number {
  let count = 0;
  github.events.on('request:start', () => {
    count += 1;
  });
  return () => count;
}

async function githubStatus(server: FastifyInstance) {
  const res = await server.inject({ method: 'GET', url: apiRoutes.status, headers });
  return StatusSchema.parse(res.json()).integrations.github;
}

describe.skipIf(process.platform === 'win32')('/api/github/connection', () => {
  it('answers 401 without the session token', async () => {
    const { app } = await server();
    for (const method of ['GET', 'PUT', 'DELETE'] as const) {
      const res = await app.inject({ method, url: apiRoutes.githubConnection, headers: { host: headers.host } });
      expect(res.statusCode).toBe(401);
    }
  });

  it('AC-1, AC-2: GET says nothing is saved and gh is there, and the status says not connected', async () => {
    const { app, folder } = await server({ keychain: createUnreachableKeychain() });

    const res = await app.inject({ method: 'GET', url: apiRoutes.githubConnection, headers });

    expect(GitHubConnectionSchema.parse(res.json())).toEqual({ saved: null, envToken: false, ghFound: true });
    expect(await githubStatus(app)).toEqual({ state: 'not_connected', detail: null });
    expect(await folder.runs()).toEqual([]);
  });

  it('AC-20: a hub given no gh never finds one, so nothing can start the real gh', async () => {
    app = await createServer({ token, port, version: '1.2.3', userName: () => Promise.resolve(null) });

    const read = await app.inject({ method: 'GET', url: apiRoutes.githubConnection, headers });
    const connect = await app.inject({
      method: 'PUT',
      url: apiRoutes.githubConnection,
      headers,
      payload: { method: 'gh' },
    });

    expect(GitHubConnectionSchema.parse(read.json()).ghFound).toBe(false);
    expect(connect.statusCode).toBe(422);
    expect(ApiErrorSchema.parse(connect.json()).message).toBe(
      "Orynx can't find the gh command. Install it from cli.github.com, or use a personal access token.",
    );
  });

  it('AC-14: GET says when .env holds a GitHub token', async () => {
    const { app } = await server({ envTokens: { github: githubToken } });

    const res = await app.inject({ method: 'GET', url: apiRoutes.githubConnection, headers });

    expect(GitHubConnectionSchema.parse(res.json()).envToken).toBe(true);
  });

  it('AC-3, AC-16: PUT with the gh way saves it, says the status changed, and the status names the account', async () => {
    const { app, seen } = await server();

    const res = await app.inject({
      method: 'PUT',
      url: apiRoutes.githubConnection,
      headers,
      payload: { method: 'gh' },
    });

    expect(res.statusCode).toBe(200);
    expect(GitHubConnectionSchema.parse(res.json()).saved).toEqual({ method: 'gh' });
    expect(seen).toContainEqual({ type: 'status.changed' });
    expect(await githubStatus(app)).toEqual({
      state: 'connected',
      detail: 'Signed in as octocat with the gh command-line tool',
    });
  });

  it('AC-5: PUT with a token keeps it in the keychain', async () => {
    const { app, keychain } = await server();

    const res = await app.inject({
      method: 'PUT',
      url: apiRoutes.githubConnection,
      headers,
      payload: { method: 'token', token: ` ${githubToken}\n` },
    });

    expect(res.statusCode).toBe(200);
    expect(await keychain.get('github')).toBe(githubToken);
  });

  it('AC-6: a refused token answers 422 with the message for the token field', async () => {
    const { app } = await server();

    const res = await app.inject({
      method: 'PUT',
      url: apiRoutes.githubConnection,
      headers,
      payload: { method: 'token', token: 'fake-wrong-token' },
    });

    expect(res.statusCode).toBe(422);
    expect(ApiErrorSchema.parse(res.json())).toEqual({
      code: 'integration_rejected',
      message: "GitHub didn't accept this token. Check it, or create a new one.",
    });
  });

  it("AC-8: github.com that can't be reached answers 502", async () => {
    github.use(http.get(userUrl, () => HttpResponse.error()));
    const { app } = await server();

    const res = await app.inject({
      method: 'PUT',
      url: apiRoutes.githubConnection,
      headers,
      payload: { method: 'gh' },
    });

    expect(res.statusCode).toBe(502);
    expect(ApiErrorSchema.parse(res.json()).code).toBe('integration_unreachable');
  });

  it('AC-9: refuses a token with a space inside, or no token at all, before asking GitHub', async () => {
    const calls = githubCalls();
    const { app } = await server();

    const spaced = await app.inject({
      method: 'PUT',
      url: apiRoutes.githubConnection,
      headers,
      payload: { method: 'token', token: 'fake token' },
    });
    const empty = await app.inject({
      method: 'PUT',
      url: apiRoutes.githubConnection,
      headers,
      payload: { method: 'token', token: '' },
    });

    expect(spaced.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(spaced.json()).code).toBe('bad_request');
    expect(empty.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(empty.json())).toEqual({ code: 'bad_request', message: 'Paste your GitHub token.' });
    expect(calls()).toBe(0);
  });

  it("AC-10: a keychain that can't be reached answers 503", async () => {
    const { app } = await server({ keychain: createUnreachableKeychain() });

    const res = await app.inject({
      method: 'PUT',
      url: apiRoutes.githubConnection,
      headers,
      payload: { method: 'token', token: githubToken },
    });

    expect(res.statusCode).toBe(503);
    expect(ApiErrorSchema.parse(res.json()).code).toBe('keychain_unavailable');
  });

  it('AC-11: after a restart, the status checks the saved token again', async () => {
    const { app } = await server({
      keychain: createMemoryKeychain({ github: githubToken }),
      settings: createMemorySettingsStore({ github: { method: 'token' } }),
    });

    expect(await githubStatus(app)).toEqual({ state: 'connected', detail: 'Personal access token for octocat' });
  });

  it('AC-13, AC-16: DELETE disconnects with 204 and says the status changed', async () => {
    const { app, keychain, seen } = await server({
      keychain: createMemoryKeychain({ github: githubToken }),
      settings: createMemorySettingsStore({ github: { method: 'token' } }),
    });

    const res = await app.inject({ method: 'DELETE', url: apiRoutes.githubConnection, headers });

    expect(res.statusCode).toBe(204);
    expect(await keychain.get('github')).toBeNull();
    expect(seen).toContainEqual({ type: 'status.changed' });
    expect(await githubStatus(app)).toEqual({ state: 'not_connected', detail: null });
  });
});
