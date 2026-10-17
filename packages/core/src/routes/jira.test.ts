import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  apiRoutes,
  ApiErrorSchema,
  JiraConnectionSchema,
  JiraProjectListSchema,
  StatusSchema,
  tokenHeader,
  type ServerEvent,
} from '@devhub/contracts';
import { createServer, type CoreOptions } from '../create-server.ts';
import { createEventBus } from '../events/event-bus.ts';
import type { Keychain } from '../secrets/keychain.ts';
import { createMemoryKeychain, createUnreachableKeychain } from '../secrets/memory-keychain.ts';
import { createMemorySettingsStore } from '../settings/settings-store.ts';
import {
  acceptingProjectSearch,
  goodToken,
  jiraEmail,
  jiraSite,
  myselfUrl,
  projectSearchUrl,
  useFakeJira,
} from '../test/fake-jira.ts';

const jira = useFakeJira();
const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };
const saved = { site: jiraSite, email: jiraEmail };
const body = { site: 'https://your-team.atlassian.net/jira/your-work', email: jiraEmail, apiToken: goodToken };

let app: FastifyInstance | undefined;

async function server(options: Partial<CoreOptions> & { keychain?: Keychain } = {}) {
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  const keychain = options.keychain ?? createMemoryKeychain();
  app = await createServer({ token, port, version: '1.2.3', events, ...options, keychain });
  return { app, keychain, seen };
}

afterEach(async () => {
  jira.events.removeAllListeners();
  await app?.close();
  app = undefined;
});

function jiraCalls(): () => number {
  let count = 0;
  jira.events.on('request:start', () => {
    count += 1;
  });
  return () => count;
}

async function jiraStatus(server: FastifyInstance) {
  const res = await server.inject({ method: 'GET', url: apiRoutes.status, headers });
  return StatusSchema.parse(res.json()).integrations.jira;
}

describe('/api/jira/connection', () => {
  it('answers 401 without the session token', async () => {
    const { app } = await server();
    for (const method of ['GET', 'PUT', 'DELETE'] as const) {
      const res = await app.inject({ method, url: apiRoutes.jiraConnection, headers: { host: headers.host } });
      expect(res.statusCode).toBe(401);
    }
  });

  it('AC-1: GET says nothing is saved, and the status says not connected', async () => {
    const { app } = await server({ keychain: createUnreachableKeychain() });

    const res = await app.inject({ method: 'GET', url: apiRoutes.jiraConnection, headers });

    expect(JiraConnectionSchema.parse(res.json())).toEqual({ saved: null, envToken: false });
    expect(await jiraStatus(app)).toEqual({ state: 'not_connected', detail: null });
  });

  it('AC-12: GET says when .env holds a Jira token', async () => {
    const { app } = await server({ envTokens: { jira: goodToken } });

    const res = await app.inject({ method: 'GET', url: apiRoutes.jiraConnection, headers });

    expect(JiraConnectionSchema.parse(res.json()).envToken).toBe(true);
  });

  it('AC-3, AC-14: PUT checks with Jira, saves, tells open pages, and the status says connected', async () => {
    const settings = createMemorySettingsStore();
    const { app, keychain, seen } = await server({ settings });

    const res = await app.inject({ method: 'PUT', url: apiRoutes.jiraConnection, headers, payload: body });

    expect(res.statusCode).toBe(200);
    expect(JiraConnectionSchema.parse(res.json())).toEqual({ saved, envToken: false });
    expect(await keychain.get('jira')).toBe(goodToken);
    expect(await settings.read()).toEqual({ jira: saved });
    expect(seen).toContainEqual({ type: 'status.changed' });
    expect(await jiraStatus(app)).toEqual({
      state: 'connected',
      detail: 'Personal API token for your-team.atlassian.net',
    });
  });

  it.each([
    [
      'a site off atlassian.net',
      { ...body, site: 'your-team.atlasian.net' },
      'Use your Jira Cloud address, like your-team.atlassian.net.',
    ],
    ['an email that is not one', { ...body, email: 'dev' }, 'Enter the email you sign in to Jira with.'],
    ['a token with a space', { ...body, apiToken: 'fake Ff' }, 'Paste the token without spaces or line breaks.'],
  ])('AC-7: PUT refuses %s with bad_request and never calls Jira', async (_case, payload, message) => {
    const calls = jiraCalls();
    const { app } = await server();

    const res = await app.inject({ method: 'PUT', url: apiRoutes.jiraConnection, headers, payload });

    expect(res.statusCode).toBe(400);
    const error = ApiErrorSchema.parse(res.json());
    expect(error.code).toBe('bad_request');
    expect(error.message).toContain(message);
    expect(calls()).toBe(0);
  });

  it('AC-4: PUT answers 422 integration_rejected when Jira refuses the token', async () => {
    const { app, keychain } = await server();

    const res = await app.inject({
      method: 'PUT',
      url: apiRoutes.jiraConnection,
      headers,
      payload: { ...body, apiToken: 'fake-wrong-token' },
    });

    expect(res.statusCode).toBe(422);
    expect(ApiErrorSchema.parse(res.json())).toEqual({
      code: 'integration_rejected',
      message: "Jira didn't accept this email and API token. Check both, or create a new token.",
    });
    expect(await keychain.get('jira')).toBeNull();
  });

  it("AC-5: PUT answers 502 integration_unreachable when the site can't be reached", async () => {
    jira.use(http.get(myselfUrl(), () => HttpResponse.error()));
    const { app } = await server();

    const res = await app.inject({ method: 'PUT', url: apiRoutes.jiraConnection, headers, payload: body });

    expect(res.statusCode).toBe(502);
    expect(ApiErrorSchema.parse(res.json())).toEqual({
      code: 'integration_unreachable',
      message: "Can't reach your-team.atlassian.net. Check your network or VPN, then try again.",
    });
  });

  it("AC-8: PUT answers 503 keychain_unavailable when the keychain can't be reached", async () => {
    const settings = createMemorySettingsStore();
    const { app } = await server({ keychain: createUnreachableKeychain(), settings });

    const res = await app.inject({ method: 'PUT', url: apiRoutes.jiraConnection, headers, payload: body });

    expect(res.statusCode).toBe(503);
    expect(ApiErrorSchema.parse(res.json()).code).toBe('keychain_unavailable');
    expect(await settings.read()).toEqual({});
  });

  it('AC-11, AC-14: DELETE disconnects, tells open pages, and the status says not connected', async () => {
    const settings = createMemorySettingsStore({ jira: saved });
    const { app, keychain, seen } = await server({ keychain: createMemoryKeychain({ jira: goodToken }), settings });

    const res = await app.inject({ method: 'DELETE', url: apiRoutes.jiraConnection, headers });

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect(await keychain.get('jira')).toBeNull();
    expect(await settings.read()).toEqual({});
    expect(seen).toContainEqual({ type: 'status.changed' });
    expect(await jiraStatus(app)).toEqual({ state: 'not_connected', detail: null });
  });

  it('AC-9: the status checks a saved connection with Jira when DevHub starts', async () => {
    const { app } = await server({
      keychain: createMemoryKeychain({ jira: 'fake-revoked-token' }),
      settings: createMemorySettingsStore({ jira: saved }),
    });

    expect(await jiraStatus(app)).toEqual({
      state: 'error',
      detail: "Jira didn't accept this email and API token. Check both, or create a new token.",
    });
  });
});

describe('/api/jira/projects', () => {
  const projects = [{ key: 'PROJ', name: 'Intranet' }];

  async function connectedServer() {
    const keychain = createMemoryKeychain();
    await keychain.set('jira', goodToken);
    return server({ keychain, settings: createMemorySettingsStore({ jira: saved }) });
  }

  it('answers 401 without the session token', async () => {
    const { app } = await server();
    const res = await app.inject({ method: 'GET', url: apiRoutes.jiraProjects, headers: { host: headers.host } });
    expect(res.statusCode).toBe(401);
  });

  it('AC-5: lists the projects the saved connection can see', async () => {
    jira.use(acceptingProjectSearch(projects));
    const { app } = await connectedServer();

    const res = await app.inject({ method: 'GET', url: apiRoutes.jiraProjects, headers });

    expect(res.statusCode).toBe(200);
    expect(JiraProjectListSchema.parse(res.json())).toEqual({ projects });
  });

  it('AC-8: answers 400 when Jira is not connected', async () => {
    const { app } = await server();

    const res = await app.inject({ method: 'GET', url: apiRoutes.jiraProjects, headers });

    expect(res.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(res.json())).toEqual({
      code: 'bad_request',
      message: 'Connect Jira in Connections to pick a project.',
    });
  });

  it('AC-9: answers 502 when Jira cannot be reached', async () => {
    jira.use(http.get(projectSearchUrl(), () => HttpResponse.error()));
    const { app } = await connectedServer();

    const res = await app.inject({ method: 'GET', url: apiRoutes.jiraProjects, headers });

    expect(res.statusCode).toBe(502);
    expect(ApiErrorSchema.parse(res.json()).code).toBe('integration_unreachable');
  });
});
