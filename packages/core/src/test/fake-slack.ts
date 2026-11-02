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

/**
 * MSW standing in for Slack, an outside service, for the test file that calls this. It answers `auth.test` and
 * `users.info` and fails any other request, so no test can reach the real internet.
 */
export function useFakeSlack() {
  const server = setupServer(acceptingAuthTest(), knownUsers());
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
