import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { makeRepository } from '@devhub/contracts/testing';
import { ApiRequestError, createApiClient, queryKeys, repositoriesQueryOptions } from './index.ts';

const baseURL = 'http://127.0.0.1:4317';
const listUrl = `${baseURL}${apiRoutes.repositories}`;
const server = setupServer();
const api = createApiClient({ baseURL, token: 'abc' });

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

describe('repositories endpoints', () => {
  it('AC-4: lists the folders with the page token', async () => {
    let token: string | null = null;
    server.use(
      http.get(listUrl, ({ request }) => {
        token = request.headers.get(tokenHeader);
        return HttpResponse.json({ repositories: [makeRepository()] });
      }),
    );

    expect(await api.repositories()).toEqual({ repositories: [makeRepository()] });
    expect(token).toBe('abc');
  });

  it('AC-6: sends the folder as typed and returns the one the server saved', async () => {
    let body: unknown;
    server.use(
      http.post(listUrl, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeRepository(), { status: 201 });
      }),
    );

    expect(await api.addRepository({ path: '~/code/intranet-web', jiraProject: 'PROJ' })).toEqual(makeRepository());
    expect(body).toEqual({ path: '~/code/intranet-web', jiraProject: 'PROJ' });
  });

  it('AC-7: rejects with folder_rejected and the message for the Folder field', async () => {
    server.use(
      http.post(listUrl, () =>
        HttpResponse.json({ code: 'folder_rejected', message: 'Nothing is at this path.' }, { status: 422 }),
      ),
    );

    await expect(api.addRepository({ path: '~/nope', jiraProject: null })).rejects.toMatchObject({
      code: 'folder_rejected',
      message: 'Nothing is at this path.',
    });
  });

  it('AC-20 (spec 020): edits a folder by its id and returns the one the server saved', async () => {
    let sent: { id: string; body: unknown } | undefined;
    server.use(
      http.patch(`${baseURL}${apiRoutes.repository}`, async ({ params, request }) => {
        sent = { id: String(params['id']), body: await request.json() };
        return HttpResponse.json(makeRepository({ jiraProject: 'WEB' }));
      }),
    );

    expect(await api.editRepository('0123456789abcdef', { path: '~/code/intranet-web', jiraProject: 'WEB' })).toEqual(
      makeRepository({ jiraProject: 'WEB' }),
    );
    expect(sent).toEqual({ id: '0123456789abcdef', body: { path: '~/code/intranet-web', jiraProject: 'WEB' } });
  });

  it('AC-11: removes a folder by its id', async () => {
    let removed: string | undefined;
    server.use(
      http.delete(`${baseURL}${apiRoutes.repository}`, ({ params }) => {
        removed = String(params['id']);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await api.removeRepository('0123456789abcdef');

    expect(removed).toBe('0123456789abcdef');
  });

  it('refuses a list that is not the contract', async () => {
    server.use(http.get(listUrl, () => HttpResponse.json({ repositories: [{ path: '/x' }] })));

    await expect(api.repositories()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('AC-17: keeps one cache entry that settings.changed refreshes, instead of polling', () => {
    const options = repositoriesQueryOptions(api);
    expect(options.queryKey).toEqual(queryKeys.repositories);
    expect(options.staleTime).toBe(Infinity);
  });
});
