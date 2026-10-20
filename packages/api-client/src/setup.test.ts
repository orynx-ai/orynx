import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { makeProfile } from '@devhub/contracts/testing';
import { ApiRequestError, createApiClient, profileQueryOptions, queryKeys, setupQueryOptions } from './index.ts';

const baseURL = 'http://127.0.0.1:4317';
const server = setupServer();
const api = createApiClient({ baseURL, token: 'abc' });
const ada = makeProfile({ name: 'Ada', bio: 'Builds things' });

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

describe('setup and profile endpoints (spec 043)', () => {
  it('AC-1: reads whether Orynx is set up, with the page token', async () => {
    server.use(
      http.get(`${baseURL}${apiRoutes.setup}`, ({ request }) =>
        request.headers.get(tokenHeader) === 'abc'
          ? HttpResponse.json({ done: false })
          : new HttpResponse(null, { status: 401 }),
      ),
    );
    expect(await api.setup()).toEqual({ done: false });
    expect(setupQueryOptions(api).queryKey).toEqual(queryKeys.setup);
  });

  it('AC-3: sends the profile and the password once', async () => {
    let sent: unknown;
    server.use(
      http.post(`${baseURL}${apiRoutes.setup}`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ done: true });
      }),
    );
    expect(await api.completeSetup({ profile: ada, password: 'correct horse battery' })).toEqual({ done: true });
    expect(sent).toEqual({ profile: ada, password: 'correct horse battery' });
  });

  it('AC-4: turns a second setup into an ApiRequestError with its code', async () => {
    server.use(
      http.post(`${baseURL}${apiRoutes.setup}`, () =>
        HttpResponse.json({ code: 'already_set_up', message: 'Orynx is set up already.' }, { status: 409 }),
      ),
    );
    const failure = api.completeSetup({ profile: ada, password: 'correct horse battery' });
    await expect(failure).rejects.toBeInstanceOf(ApiRequestError);
    await expect(failure).rejects.toMatchObject({ code: 'already_set_up' });
  });

  it('AC-6: reads and saves the profile', async () => {
    server.use(
      http.get(`${baseURL}${apiRoutes.profile}`, () => HttpResponse.json(makeProfile())),
      http.put(`${baseURL}${apiRoutes.profile}`, async ({ request }) => HttpResponse.json(await request.json())),
    );
    expect(await api.profile()).toEqual(makeProfile());
    expect(profileQueryOptions(api).queryKey).toEqual(queryKeys.profile);
    expect(await api.saveProfile(ada)).toEqual(ada);
  });

  it('changes the password, and turns a wrong current one into an ApiRequestError with its code', async () => {
    let sent: unknown;
    server.use(
      http.put(`${baseURL}${apiRoutes.password}`, async ({ request }) => {
        sent = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await api.changePassword({ current: 'correct horse battery', next: 'battery staple horse' });
    expect(sent).toEqual({ current: 'correct horse battery', next: 'battery staple horse' });

    server.use(
      http.put(`${baseURL}${apiRoutes.password}`, () =>
        HttpResponse.json({ code: 'wrong_password', message: 'That isn’t your current password.' }, { status: 400 }),
      ),
    );
    await expect(api.changePassword({ current: 'nope', next: 'battery staple horse' })).rejects.toMatchObject({
      code: 'wrong_password',
    });
  });
});
