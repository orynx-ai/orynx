import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { ApiRequestError, createApiClient, queryKeys, skillsQueryOptions } from './index.ts';

const baseURL = 'http://127.0.0.1:4317';
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

describe('skills (spec 022)', () => {
  it('AC-49, AC-59: asks for the folder’s skills and yours, or yours alone, each folder under its own key', async () => {
    const asked: (string | null)[] = [];
    server.use(
      http.get(`${baseURL}${apiRoutes.skills}`, ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('repositoryId'));
        return HttpResponse.json({ skills: [{ name: 'review', description: null, source: 'folder' }] });
      }),
    );
    expect(await api.skills('00000000000000aa')).toEqual({
      skills: [{ name: 'review', description: null, source: 'folder' }],
    });
    await api.skills(null);
    expect(asked).toEqual(['00000000000000aa', null]);
    expect(skillsQueryOptions(api, '00000000000000aa').queryKey).toEqual([...queryKeys.skills, '00000000000000aa']);
    expect(skillsQueryOptions(api, null).queryKey).toEqual([...queryKeys.skills, null]);
  });

  it('AC-56: refuses an answer of the wrong shape', async () => {
    server.use(http.get(`${baseURL}${apiRoutes.skills}`, () => HttpResponse.json({ skills: [{ name: 'Bad Name' }] })));
    await expect(api.skills(null)).rejects.toBeInstanceOf(ApiRequestError);
  });
});
