import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { makeDiscordConnection, makeSlackConnection } from '@devhub/contracts/testing';
import {
  ApiRequestError,
  createApiClient,
  discordConnectionQueryOptions,
  queryKeys,
  slackConnectionQueryOptions,
} from './index.ts';

const baseURL = 'http://127.0.0.1:4317';
const server = setupServer();
const api = createApiClient({ baseURL, token: 'abc' });
const url = (route: string) => `${baseURL}${route}`;

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

describe('Slack and Discord connections (spec 016)', () => {
  it('AC-2: connects Slack with the page token and parses the answer with the contract', async () => {
    let sent: unknown = null;
    let token: string | null = null;
    server.use(
      http.put(url(apiRoutes.slackConnection), async ({ request }) => {
        sent = await request.json();
        token = request.headers.get(tokenHeader);
        return HttpResponse.json(makeSlackConnection());
      }),
    );

    expect(await api.connectSlack({ token: 'fake-slack-token' })).toEqual(makeSlackConnection());
    expect(sent).toEqual({ token: 'fake-slack-token' });
    expect(token).toBe('abc');
    expect(slackConnectionQueryOptions(api).queryKey).toEqual(queryKeys.slackConnection);
  });

  it('AC-8: a team’s Discord bot rejects with user_id_needed, so the form can ask for it', async () => {
    server.use(
      http.put(url(apiRoutes.discordConnection), () =>
        HttpResponse.json({ code: 'user_id_needed', message: 'A team owns this bot.' }, { status: 422 }),
      ),
    );

    const error: unknown = await api.connectDiscord({ token: 'fake-discord-token' }).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ code: 'user_id_needed' });
  });

  it('AC-6, AC-9: reads, checks and disconnects Discord', async () => {
    server.use(
      http.get(url(apiRoutes.discordConnection), () => HttpResponse.json(makeDiscordConnection())),
      http.post(url(apiRoutes.discordConnectionCheck), () =>
        HttpResponse.json({ status: { state: 'connected', detail: 'Orynx · 2 servers' }, ms: 120 }),
      ),
      http.delete(url(apiRoutes.discordConnection), () => new HttpResponse(null, { status: 204 })),
    );

    expect(await discordConnectionQueryOptions(api).queryFn?.({} as never)).toEqual(makeDiscordConnection());
    expect((await api.checkDiscordConnection()).status.detail).toBe('Orynx · 2 servers');
    await expect(api.disconnectDiscord()).resolves.toBeUndefined();
  });
});

describe('threads (spec 016)', () => {
  it('AC-26: previews a pasted link, sent as a query parameter', async () => {
    let link: string | null = null;
    const answer = {
      result: 'found',
      chip: { kind: 'slack_thread', channel: 'C024BE91L', ts: '1793613600.000100' },
      label: { from: 'Neha K.', channel: 'web-platform', server: null },
    };
    server.use(
      http.get(url(apiRoutes.threadPreview), ({ request }) => {
        link = new URL(request.url).searchParams.get('link');
        return HttpResponse.json(answer);
      }),
    );

    expect(await api.threadPreview('https://acme.slack.com/archives/C024BE91L/p1793613600000100')).toEqual(answer);
    expect(link).toBe('https://acme.slack.com/archives/C024BE91L/p1793613600000100');
  });

  it('AC-41, AC-43: posts the reply with its text, and dismisses it', async () => {
    const id = '0000000000000001';
    let sent: unknown = null;
    let dismissed = false;
    server.use(
      http.post(url(apiRoutes.sessionThreadReply.replace(':id', id)), async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ result: 'posted', url: 'https://acme.slack.com/archives/C024BE91L/p1' });
      }),
      http.post(url(apiRoutes.sessionThreadReplyDismiss.replace(':id', id)), () => {
        dismissed = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    expect(await api.postThreadReply(id, 'A fix is up')).toEqual({
      result: 'posted',
      url: 'https://acme.slack.com/archives/C024BE91L/p1',
    });
    expect(sent).toEqual({ text: 'A fix is up' });
    await api.dismissThreadReply(id);
    expect(dismissed).toBe(true);
  });
});
