import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { slackScopes } from '@devhub/contracts';

/** A user token Slack accepts in these tests. Not a real token's shape, so the secrets gate stays quiet. */
export const slackToken = 'fake-slack-token-for-tests';
export const slackApi = 'https://slack.com/api';
/** The person the token belongs to, in the Acme workspace. */
export const slackUserId = 'U024BE7LH';

export interface AcceptingAuthTestOptions {
  tokens?: readonly string[];
  /** What `X-OAuth-Scopes` says, as Slack writes it. */
  scopes?: readonly string[];
}

/** Whether a call carries one of `tokens` as Slack wants it: `Authorization: Bearer …`. */
function sentToken(request: Request, tokens: readonly string[]): boolean {
  return tokens.some((token) => request.headers.get('authorization') === `Bearer ${token}`);
}

/** Slack's `auth.test` as Slack answers it: who the token belongs to and its scopes, or `invalid_auth`. */
export function acceptingAuthTest({ tokens = [slackToken], scopes = slackScopes }: AcceptingAuthTestOptions = {}) {
  return http.post(`${slackApi}/auth.test`, ({ request }) => {
    if (!sentToken(request, tokens)) return HttpResponse.json({ ok: false, error: 'invalid_auth' });
    return HttpResponse.json(
      {
        ok: true,
        url: 'https://acme.slack.com/',
        team: 'Acme',
        user: 'neha',
        team_id: 'T024BE7LD',
        user_id: slackUserId,
      },
      { headers: { 'x-oauth-scopes': scopes.join(',') } },
    );
  });
}

/** People by id, as `users.info` gives them. */
export function knownUsers(people: Record<string, { display: string; real?: string }> = {}) {
  const everyone: Record<string, { display: string; real?: string } | undefined> = {
    [slackUserId]: { display: 'Neha K.', real: 'Neha Kapoor' },
    ...people,
  };
  return http.post(`${slackApi}/users.info`, async ({ request }) => {
    const id = new URLSearchParams(await request.text()).get('user') ?? '';
    const person = everyone[id];
    if (person === undefined) return HttpResponse.json({ ok: false, error: 'user_not_found' });
    return HttpResponse.json({
      ok: true,
      user: { id, name: id.toLowerCase(), real_name: person.real, profile: { display_name: person.display } },
    });
  });
}

/** A message as Slack's search or history gives it. */
export interface FakeSlackMessage {
  ts: string;
  user?: string;
  bot_id?: string;
  text?: string;
  thread_ts?: string;
  files?: { name: string }[];
}

/** A mention as `search.messages` finds it: the message, its channel and its permalink. */
export interface FakeMention extends FakeSlackMessage {
  channel: { id: string; name: string; is_im?: boolean; is_mpim?: boolean };
}

/** Form fields Slack's SDK posts. */
async function fieldsOf(request: Request): Promise<URLSearchParams> {
  return new URLSearchParams(await request.text());
}

/**
 * `search.messages`, finding these mentions, oldest first as Orynx asks; `queries` collects what was searched for.
 */
export function slackMentions(mentions: readonly FakeMention[], queries: string[] = []) {
  return http.post(`${slackApi}/search.messages`, async ({ request }) => {
    queries.push((await fieldsOf(request)).get('query') ?? '');
    const matches = mentions.map((mention) => ({
      ...mention,
      type: 'message',
      permalink: `https://acme.slack.com/archives/${mention.channel.id}/p${mention.ts.replace('.', '')}${
        mention.thread_ts === undefined ? '' : `?thread_ts=${mention.thread_ts}&cid=${mention.channel.id}`
      }`,
    }));
    return HttpResponse.json({ ok: true, messages: { matches, total: matches.length } });
  });
}

/** `conversations.replies` for these threads, by `channel/ts` of their first message; `asked` counts the calls. */
export function slackThreads(threads: Record<string, readonly FakeSlackMessage[]>, asked: string[] = []) {
  return http.post(`${slackApi}/conversations.replies`, async ({ request }) => {
    const fields = await fieldsOf(request);
    const key = `${fields.get('channel') ?? ''}/${fields.get('ts') ?? ''}`;
    asked.push(key);
    const messages = threads[key];
    if (messages === undefined) return HttpResponse.json({ ok: false, error: 'thread_not_found' });
    return HttpResponse.json({ ok: true, messages });
  });
}

/** Your DMs, by channel id, for `users.conversations` and `conversations.history`; `asked` counts history calls. */
export function slackDms(dms: Record<string, readonly FakeSlackMessage[]>, asked: string[] = []) {
  return [
    http.post(`${slackApi}/users.conversations`, () =>
      HttpResponse.json({
        ok: true,
        channels: Object.keys(dms).map((id) => ({ id, is_im: true })),
        response_metadata: { next_cursor: '' },
      }),
    ),
    http.post(`${slackApi}/conversations.history`, async ({ request }) => {
      const channel = (await fieldsOf(request)).get('channel') ?? '';
      asked.push(channel);
      // Newest first, as Slack gives a channel's history.
      const messages = [...(dms[channel] ?? [])].reverse();
      return HttpResponse.json({ ok: true, messages, has_more: false });
    }),
  ];
}

/** Channels by id for `conversations.info`: a name, or `dm` for a direct message. */
export function slackChannels(channels: Record<string, string>) {
  return http.post(`${slackApi}/conversations.info`, async ({ request }) => {
    const id = (await fieldsOf(request)).get('channel') ?? '';
    const name = channels[id];
    if (name === undefined) return HttpResponse.json({ ok: false, error: 'channel_not_found' });
    return HttpResponse.json({ ok: true, channel: name === 'dm' ? { id, is_im: true } : { id, name } });
  });
}

/**
 * MSW standing in for Slack, an outside service, for the test file that calls this. It answers `auth.test`,
 * `users.info`, no mentions and no DMs, and fails any other request, so no test can reach the real internet.
 */
export function useFakeSlack() {
  const server = setupServer(acceptingAuthTest(), knownUsers(), slackMentions([]), slackThreads({}), ...slackDms({}));
  beforeAll(() => {
    server.listen({ onUnhandledFrame: 'error' });
  });
  afterEach(() => {
    server.resetHandlers();
    server.events.removeAllListeners();
  });
  afterAll(() => {
    server.close();
  });
  return server;
}
