import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { slackScopes } from '@devhub/contracts';
import {
  acceptingAuthTest,
  knownUsers,
  slackApi,
  slackDms,
  slackMentions,
  slackThreads,
  slackToken,
  slackUserId,
  useFakeSlack,
  type FakeMention,
} from '../../test/fake-slack.ts';
import { createSlackClient } from './client.ts';

const slack = useFakeSlack();
const now = Date.parse('2026-11-02T10:00:00.000Z');
const client = createSlackClient({ now: () => now });

describe('Slack client (spec 016)', () => {
  it('AC-2: names the workspace and the person, sending the token only in the Authorization header', async () => {
    const bodies: string[] = [];
    slack.events.on('request:start', ({ request }) => {
      void request
        .clone()
        .text()
        .then((body) => bodies.push(body));
    });

    expect(await client.check(slackToken)).toEqual({
      ok: true,
      userId: slackUserId,
      name: 'Neha K.',
      workspace: 'Acme',
      url: 'https://acme.slack.com/',
    });
    expect(bodies.join('')).not.toContain(slackToken);
  });

  it('AC-3: a token without every scope names the missing ones, in the order Orynx asks for them', async () => {
    const scopes = slackScopes.filter((scope) => scope !== 'chat:write' && scope !== 'im:history');
    slack.use(acceptingAuthTest({ scopes }));

    expect(await client.check(slackToken)).toEqual({
      ok: false,
      problem: { kind: 'missing_scopes', missing: ['im:history', 'chat:write'] },
    });
  });

  it('AC-4: Slack refusing the token, or a revoked one, is refused', async () => {
    expect(await client.check('fake-wrong-token')).toEqual({ ok: false, problem: { kind: 'rejected' } });

    slack.use(http.post(`${slackApi}/auth.test`, () => HttpResponse.json({ ok: false, error: 'token_revoked' })));
    expect(await client.check(slackToken)).toEqual({ ok: false, problem: { kind: 'rejected' } });
  });

  it('a 429 is the rate limit, with when to try again from Retry-After', async () => {
    slack.use(
      http.post(`${slackApi}/auth.test`, () =>
        HttpResponse.json({ ok: false, error: 'ratelimited' }, { status: 429, headers: { 'Retry-After': '30' } }),
      ),
    );

    expect(await client.check(slackToken)).toEqual({
      ok: false,
      problem: { kind: 'rate_limited', resetAt: now + 30_000 },
    });
  });

  it('no network is unreachable, and any other Slack error keeps only its code', async () => {
    slack.use(http.post(`${slackApi}/auth.test`, () => HttpResponse.error()));
    expect(await client.check(slackToken)).toMatchObject({ ok: false, problem: { kind: 'unreachable' } });

    slack.use(http.post(`${slackApi}/auth.test`, () => HttpResponse.json({ ok: false, error: 'internal_error' })));
    expect(await client.check(slackToken)).toEqual({
      ok: false,
      problem: { kind: 'slack_error', error: 'internal_error' },
    });
  });
});

describe('Slack messages waiting on you (spec 016, B)', () => {
  const account = { userId: slackUserId, url: 'https://acme.slack.com/' };
  const since = Date.parse('2026-10-26T10:00:00.000Z');
  const webPlatform = { id: 'C024BE91L', name: 'web-platform' };
  const mention = (ts: string, extra: Partial<FakeMention> = {}): FakeMention => ({
    ts,
    user: 'U0NEHA0001',
    text: `<@${slackUserId}> can you confirm the archive API returns 207?`,
    channel: webPlatform,
    ...extra,
  });
  const people = knownUsers({ U0NEHA0001: { display: 'Neha K.' }, U0ARJUN001: { display: 'Arjun M.' } });

  it('AC-10, AC-12: a mention nobody answered is a row; one you answered in its thread is not', async () => {
    const queries: string[] = [];
    slack.use(
      people,
      slackMentions([mention('1793613600.000100'), mention('1793613900.000100')], queries),
      slackThreads({
        'C024BE91L/1793613600.000100': [{ ts: '1793613600.000100', user: 'U0NEHA0001' }],
        'C024BE91L/1793613900.000100': [
          { ts: '1793613900.000100', user: 'U0NEHA0001' },
          { ts: '1793614000.000100', user: slackUserId, thread_ts: '1793613900.000100' },
        ],
      }),
    );

    expect(await client.waiting(slackToken, account, { since })).toEqual({
      ok: true,
      records: [
        {
          id: 'C024BE91L/1793613600.000100',
          title: '@Neha K. can you confirm the archive API returns 207?',
          from: 'Neha K.',
          channel: 'web-platform',
          waitingSince: '2026-11-02T10:00:00.000Z',
          url: 'https://acme.slack.com/archives/C024BE91L/p1793613600000100',
        },
      ],
    });
    expect(queries).toEqual([`<@${slackUserId}> after:2026-10-25`]);
  });

  it('AC-10: a mention inside a thread is checked in that thread, and links to it', async () => {
    slack.use(
      people,
      slackMentions([mention('1793613700.000200', { thread_ts: '1793613600.000100' })]),
      slackThreads({ 'C024BE91L/1793613600.000100': [{ ts: '1793613600.000100', user: 'U0ARJUN001' }] }),
    );

    const answer = await client.waiting(slackToken, account, { since });
    expect(answer.ok && answer.records.map((record) => record.url)).toEqual([
      'https://acme.slack.com/archives/C024BE91L/p1793613700000200?thread_ts=1793613600.000100&cid=C024BE91L',
    ]);
  });

  it('AC-11: a DM after your last message is a row from its sender, with no channel', async () => {
    slack.use(
      people,
      ...slackDms({
        D0ARJUN01: [
          { ts: '1793612000.000100', user: slackUserId, text: 'hi' },
          { ts: '1793613600.000100', user: 'U0ARJUN001', text: 'Pushed the rate-limit change, mind a look?' },
        ],
        D0PRIYA01: [{ ts: '1793613600.000100', user: slackUserId, text: 'done' }],
      }),
    );

    expect(await client.waiting(slackToken, account, { since })).toEqual({
      ok: true,
      records: [
        {
          id: 'D0ARJUN01/1793613600.000100',
          title: 'Pushed the rate-limit change, mind a look?',
          from: 'Arjun M.',
          channel: null,
          waitingSince: '2026-11-02T10:00:00.000Z',
          url: 'https://acme.slack.com/archives/D0ARJUN01/p1793613600000100',
        },
      ],
    });
  });

  it('AC-14: a bot’s mention, or a mention found in a DM, never reads its thread', async () => {
    const asked: string[] = [];
    slack.use(
      people,
      slackMentions([
        { ts: '1793613600.000100', bot_id: 'B01', text: `<@${slackUserId}> deploy done`, channel: webPlatform },
        mention('1793613700.000100', { channel: { id: 'D0ARJUN01', name: 'arjun', is_im: true } }),
      ]),
      slackThreads({}, asked),
    );

    expect(await client.waiting(slackToken, account, { since })).toEqual({ ok: true, records: [] });
    expect(asked).toEqual([]);
  });

  it('checks at most `most` threads and DMs a sync, the oldest mentions first, and leaves room for DMs', async () => {
    const threads: string[] = [];
    const histories: string[] = [];
    const mentions = ['1793613100.000100', '1793613200.000100', '1793613300.000100'].map((ts) => mention(ts));
    slack.use(
      people,
      slackMentions(mentions),
      slackThreads(Object.fromEntries(mentions.map((each) => [`C024BE91L/${each.ts}`, [each]])), threads),
      ...slackDms({ D0ARJUN01: [], D0PRIYA01: [] }, histories),
    );

    const answer = await client.waiting(slackToken, account, { since, most: 4 });
    expect(threads).toEqual(['C024BE91L/1793613100.000100', 'C024BE91L/1793613200.000100']);
    expect(histories).toEqual(['D0ARJUN01', 'D0PRIYA01']);
    expect(answer.ok && answer.records).toHaveLength(2);
  });

  it('a sender Slack can’t name reads as someone, and the rest of the read goes on', async () => {
    slack.use(
      knownUsers(),
      slackMentions([mention('1793613600.000100', { user: 'U0GONE0001' })]),
      slackThreads({ 'C024BE91L/1793613600.000100': [{ ts: '1793613600.000100', user: 'U0GONE0001' }] }),
    );

    const answer = await client.waiting(slackToken, account, { since });
    expect(answer.ok && answer.records.map((record) => record.from)).toEqual(['someone']);
  });

  it('a refused token or the rate limit stops the read with its problem', async () => {
    slack.use(http.post(`${slackApi}/search.messages`, () => HttpResponse.json({ ok: false, error: 'invalid_auth' })));
    expect(await client.waiting(slackToken, account, { since })).toEqual({ ok: false, problem: { kind: 'rejected' } });
  });
});
