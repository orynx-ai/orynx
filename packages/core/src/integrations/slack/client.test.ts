import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { slackScopes } from '@devhub/contracts';
import { acceptingAuthTest, slackApi, slackToken, slackUserId, useFakeSlack } from '../../test/fake-slack.ts';
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
