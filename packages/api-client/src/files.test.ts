import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { ApiRequestError, createApiClient } from './index.ts';

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

describe('files by path (spec 022)', () => {
  it('AC-9, AC-11: the picker answers the paths picked, or null for Cancel', async () => {
    server.use(http.post(`${baseURL}${apiRoutes.filePicker}`, () => HttpResponse.json({ paths: ['~/a.pdf'] })));
    expect(await api.pickFiles()).toEqual({ paths: ['~/a.pdf'] });
    server.use(http.post(`${baseURL}${apiRoutes.filePicker}`, () => HttpResponse.json({ paths: null })));
    expect(await api.pickFiles()).toEqual({ paths: null });
  });

  it('AC-12: no picker is picker_unavailable, and a typed path is found or not', async () => {
    server.use(
      http.post(`${baseURL}${apiRoutes.filePicker}`, () =>
        HttpResponse.json({ code: 'picker_unavailable', message: 'No picker.' }, { status: 503 }),
      ),
      http.post(`${baseURL}${apiRoutes.fileCheck}`, async ({ request }) => {
        const { path } = (await request.json()) as { path: string };
        return HttpResponse.json(path === '~/a.pdf' ? { result: 'found', path } : { result: 'not_found' });
      }),
    );
    await expect(api.pickFiles()).rejects.toMatchObject({ code: 'picker_unavailable' });
    expect(await api.checkFile({ path: '~/a.pdf' })).toEqual({ result: 'found', path: '~/a.pdf' });
    expect(await api.checkFile({ path: '~/b.pdf' })).toEqual({ result: 'not_found' });
  });

  it('refuses an answer of the wrong shape', async () => {
    server.use(http.post(`${baseURL}${apiRoutes.filePicker}`, () => HttpResponse.json({ paths: ['relative.txt'] })));
    await expect(api.pickFiles()).rejects.toBeInstanceOf(ApiRequestError);
  });
});
