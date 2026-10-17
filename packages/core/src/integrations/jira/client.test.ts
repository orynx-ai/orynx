import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { goodBasicValue, goodToken, jiraEmail, jiraSite, myselfUrl, useFakeJira } from '../../test/fake-jira.ts';
import { createJiraClient, type JiraCheck } from './client.ts';

const jira = useFakeJira();
const client = createJiraClient({ timeoutMs: 200 });
const credentials = { site: jiraSite, email: jiraEmail, apiToken: goodToken };

function answerMyself(response: () => Response | Promise<Response>) {
  jira.use(http.get(myselfUrl(), response));
}

/** No outcome may carry the token, or the Basic value built from it (AC-15). */
function expectNoSecret(check: JiraCheck) {
  const text = JSON.stringify(check);
  expect(text).not.toContain(goodToken);
  expect(text).not.toContain(goodBasicValue);
}

describe('Jira client', () => {
  it('AC-3: Jira accepts the email and token with Basic auth on https', async () => {
    const seen: Request[] = [];
    jira.events.on('request:start', ({ request }) => {
      seen.push(request.clone());
    });

    expect(await client.check(credentials)).toEqual({ ok: true });
    expect(seen.map((request) => request.url)).toEqual([myselfUrl()]);
    expect(seen[0]?.headers.get('authorization')).toBe(`Basic ${goodBasicValue}`);
    jira.events.removeAllListeners();
  });

  it('AC-4: Jira refuses a wrong token with 401', async () => {
    const check = await client.check({ ...credentials, apiToken: 'fake-wrong-token' });
    expect(check).toEqual({ ok: false, problem: { kind: 'rejected' } });
    expectNoSecret(check);
  });

  it('AC-4: Jira answers as an anonymous user, which still means the token was refused', async () => {
    answerMyself(() => HttpResponse.json({}, { headers: { 'X-Seraph-LoginReason': 'AUTHENTICATED_FAILED' } }));
    expect(await client.check(credentials)).toEqual({ ok: false, problem: { kind: 'rejected' } });
  });

  it('AC-6: Jira wants a sign-in on the web first', async () => {
    answerMyself(() =>
      HttpResponse.json(
        {},
        {
          status: 403,
          headers: {
            'X-Seraph-LoginReason': 'AUTHENTICATION_DENIED',
            'X-Authentication-Denied-Reason': 'CAPTCHA_CHALLENGE; login-url=https://your-team.atlassian.net/login.jsp',
          },
        },
      ),
    );
    expect(await client.check(credentials)).toEqual({ ok: false, problem: { kind: 'sign_in_needed' } });
  });

  it('AC-5: there is no Jira at that address (404)', async () => {
    answerMyself(() => HttpResponse.text('Not found', { status: 404 }));
    expect(await client.check(credentials)).toEqual({ ok: false, problem: { kind: 'not_found' } });
  });

  it('AC-5: the address answers, but not as Jira does', async () => {
    answerMyself(() => HttpResponse.html('<html><body>Site unavailable</body></html>'));
    expect(await client.check(credentials)).toEqual({ ok: false, problem: { kind: 'not_found' } });
  });

  it('AC-5: the address answers JSON that is not a Jira user', async () => {
    answerMyself(() => HttpResponse.json({ hello: 'world' }));
    expect(await client.check(credentials)).toEqual({ ok: false, problem: { kind: 'not_found' } });
  });

  it("AC-5: the site can't be reached", async () => {
    answerMyself(() => HttpResponse.error());
    const check = await client.check(credentials);
    expect(check).toEqual({ ok: false, problem: { kind: 'unreachable', code: undefined } });
    expectNoSecret(check);
  });

  it("AC-5: the site doesn't answer in time", async () => {
    answerMyself(async () => {
      await delay('infinite');
      return HttpResponse.json({});
    });
    expect(await client.check(credentials)).toEqual({ ok: false, problem: { kind: 'timeout' } });
  });

  it.each([429, 500, 503])('AC-5: Jira answers with an error (%i)', async (status) => {
    answerMyself(() => HttpResponse.json({ errorMessages: ['Busy'] }, { status }));
    expect(await client.check(credentials)).toEqual({ ok: false, problem: { kind: 'jira_error', status } });
  });

  it('AC-5: a 403 without a sign-in challenge is a Jira error, not a refused token', async () => {
    answerMyself(() => HttpResponse.json({}, { status: 403 }));
    expect(await client.check(credentials)).toEqual({ ok: false, problem: { kind: 'jira_error', status: 403 } });
  });

  it.each([
    ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'],
    ['ENOTFOUND', 'ENOTFOUND'],
    ['fake-good-token', undefined],
  ])('AC-5: keeps the network error code %s for the terminal only when it looks like a code', async (code, kept) => {
    // MSW can't fail a request with a code, so this one stands in for fetch, the network itself.
    const failing = createJiraClient({
      fetch: () =>
        Promise.reject(new TypeError('fetch failed', { cause: Object.assign(new Error('connect failed'), { code }) })),
    });
    expect(await failing.check(credentials)).toEqual({ ok: false, problem: { kind: 'unreachable', code: kept } });
  });

  it('waits 10 seconds by default', () => {
    expect(createJiraClient().timeoutMs).toBe(10_000);
  });
});
