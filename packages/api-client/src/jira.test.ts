import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { makeJiraConnection } from '@devhub/contracts/testing';
import {
  ApiRequestError,
  createApiClient,
  jiraConnectionQueryOptions,
  jiraProjectsQueryOptions,
  queryKeys,
} from './index.ts';

const baseURL = 'http://127.0.0.1:4317';
const connectionUrl = `${baseURL}${apiRoutes.jiraConnection}`;
const server = setupServer();
const api = createApiClient({ baseURL, token: 'abc' });
const saved = { site: 'your-team.atlassian.net', email: 'dev@example.com' };

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

describe('Jira connection endpoints', () => {
  it('AC-10: reads the saved site and email with the page token', async () => {
    let token: string | null = null;
    server.use(
      http.get(connectionUrl, ({ request }) => {
        token = request.headers.get(tokenHeader);
        return HttpResponse.json(makeJiraConnection({ saved }));
      }),
    );

    expect(await api.jiraConnection()).toEqual({ saved, envToken: false });
    expect(token).toBe('abc');
  });

  it('AC-3: sends what the form holds and returns the saved connection', async () => {
    let body: unknown;
    server.use(
      http.put(connectionUrl, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeJiraConnection({ saved }));
      }),
    );

    const request = { site: 'your-team', email: 'dev@example.com', apiToken: 'fake-token-for-tests' };
    expect(await api.connectJira(request)).toEqual({ saved, envToken: false });
    expect(body).toEqual(request);
  });

  it('AC-4: rejects with the code and message the server sends', async () => {
    server.use(
      http.put(connectionUrl, () =>
        HttpResponse.json(
          {
            code: 'integration_rejected',
            message: "Jira didn't accept this email and API token. Check both, or create a new token.",
          },
          { status: 422 },
        ),
      ),
    );

    const error = await api.connectJira({ ...saved, apiToken: 'wrong' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      code: 'integration_rejected',
      status: 422,
      message: "Jira didn't accept this email and API token. Check both, or create a new token.",
    });
  });

  it('AC-11: disconnects with DELETE', async () => {
    let deleted = false;
    server.use(
      http.delete(connectionUrl, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await api.disconnectJira();

    expect(deleted).toBe(true);
  });

  it('rejects a body that breaks the contract, from a read or a save', async () => {
    const broken = () => HttpResponse.json({ saved: { site: 'jira.example.com' } });
    server.use(http.get(connectionUrl, broken), http.put(connectionUrl, broken));

    expect(await api.jiraConnection().catch((e: unknown) => e)).toMatchObject({ code: 'internal' });
    expect(await api.connectJira({ ...saved, apiToken: 't' }).catch((e: unknown) => e)).toMatchObject({
      code: 'internal',
    });
  });

  it("says the Orynx server can't be reached when a disconnect gets no answer", async () => {
    server.use(http.delete(connectionUrl, () => HttpResponse.error()));

    expect(await api.disconnectJira().catch((e: unknown) => e)).toMatchObject({ code: 'network' });
  });

  it('keeps the connection under its own key, fresh from status.changed rather than polling', () => {
    const options = jiraConnectionQueryOptions(api);
    expect(options.queryKey).toEqual(queryKeys.jiraConnection);
    expect(options.staleTime).toBe(Infinity);
  });
});

describe('Jira projects endpoint', () => {
  it('AC-5: reads the projects the saved connection can see', async () => {
    const projects = [{ key: 'PROJ', name: 'Intranet' }];
    server.use(http.get(`${baseURL}${apiRoutes.jiraProjects}`, () => HttpResponse.json({ projects })));

    expect(await api.jiraProjects()).toEqual({ projects });
  });

  it('AC-9: rejects with the code the server sends when Jira fails', async () => {
    server.use(
      http.get(`${baseURL}${apiRoutes.jiraProjects}`, () =>
        HttpResponse.json(
          { code: 'integration_unreachable', message: "Can't reach your-team.atlassian.net." },
          { status: 502 },
        ),
      ),
    );

    await expect(api.jiraProjects()).rejects.toMatchObject({ code: 'integration_unreachable' });
  });

  it('keeps the list only while the form shows it, and asks Jira again every time', () => {
    const options = jiraProjectsQueryOptions(api);
    expect(options.queryKey).toEqual(queryKeys.jiraProjects);
    expect(options.gcTime).toBe(0);
    expect(options.staleTime).toBe(0);
  });
});
