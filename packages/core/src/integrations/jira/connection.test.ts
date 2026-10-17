import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { ServerEvent } from '@devhub/contracts';
import { createEventBus } from '../../events/event-bus.ts';
import type { Keychain } from '../../secrets/keychain.ts';
import { createMemoryKeychain, createUnreachableKeychain } from '../../secrets/memory-keychain.ts';
import { createTokenStore, keychainUnavailableMessage, type EnvTokens } from '../../secrets/token-store.ts';
import { createMemorySettingsStore, type Settings } from '../../settings/settings-store.ts';
import { goodToken, jiraEmail, jiraSite, myselfUrl, useFakeJira } from '../../test/fake-jira.ts';
import { createJiraClient } from './client.ts';
import { createJiraConnection, JiraConnectionError } from './connection.ts';

const jira = useFakeJira();
const saved = { site: jiraSite, email: jiraEmail };

function setup({
  keychain = createMemoryKeychain(),
  envTokens,
  settings: initial = {},
}: { keychain?: Keychain; envTokens?: EnvTokens; settings?: Settings } = {}) {
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  const settings = createMemorySettingsStore(initial);
  const onProblem = vi.fn();
  const connection = createJiraConnection({
    settings,
    tokens: createTokenStore({ keychain, events, ...(envTokens === undefined ? {} : { envTokens }) }),
    jira: createJiraClient({ timeoutMs: 200 }),
    events,
    envToken: envTokens?.jira !== undefined,
    onProblem,
  });
  return { connection, keychain, settings, seen, onProblem };
}

/** Runs `work`, which must fail with a JiraConnectionError, and returns that error. */
async function failure(work: Promise<unknown>): Promise<JiraConnectionError> {
  const error: unknown = await work.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof JiraConnectionError)) throw new Error(`Expected a JiraConnectionError, got ${String(error)}`);
  return error;
}

describe('Jira connection', () => {
  it('AC-1: reads as not connected, without touching the keychain', async () => {
    const keychain = createUnreachableKeychain();
    const { connection } = setup({ keychain });

    expect(await connection.read()).toEqual({ saved: null, envToken: false });
  });

  it('AC-3: checks with Jira, then keeps the token in the keychain and the site and email in settings', async () => {
    const { connection, keychain, settings, seen } = setup();

    expect(await connection.connect({ ...saved, apiToken: goodToken })).toEqual({ saved, envToken: false });

    expect(await keychain.get('jira')).toBe(goodToken);
    expect(await settings.read()).toEqual({ jira: saved });
    expect(seen).toContainEqual({ type: 'status.changed' });
  });

  it('AC-4: saves nothing when Jira refuses the token', async () => {
    const { connection, keychain, settings, seen } = setup();

    const error = await failure(connection.connect({ ...saved, apiToken: 'ATATT3xWrongToken' }));

    expect(error.code).toBe('integration_rejected');
    expect(error.message).toBe("Jira didn't accept this email and API token. Check both, or create a new token.");
    expect(await keychain.get('jira')).toBeNull();
    expect(await settings.read()).toEqual({});
    expect(seen).toEqual([]);
  });

  it('AC-4: keeps an existing connection exactly as it was when a change is refused', async () => {
    const { connection, keychain, settings } = setup({
      keychain: createMemoryKeychain({ jira: goodToken }),
      settings: { jira: saved },
    });

    await failure(connection.connect({ ...saved, email: 'other@example.com', apiToken: 'ATATT3xWrongToken' }));

    expect(await keychain.get('jira')).toBe(goodToken);
    expect(await settings.read()).toEqual({ jira: saved });
  });

  it('AC-6: a sign-in Jira wants on the web counts as refused credentials', async () => {
    jira.use(
      http.get(myselfUrl(), () =>
        HttpResponse.json({}, { status: 403, headers: { 'X-Seraph-LoginReason': 'AUTHENTICATION_DENIED' } }),
      ),
    );
    const { connection } = setup();

    const error = await failure(connection.connect({ ...saved, apiToken: goodToken }));

    expect(error.code).toBe('integration_rejected');
    expect(error.message).toBe(
      'Jira wants you to sign in on the web first. Sign in at your-team.atlassian.net, then try again.',
    );
  });

  it("AC-5: says the site can't be reached, and hands the safe problem to the terminal", async () => {
    jira.use(http.get(myselfUrl(), () => HttpResponse.error()));
    const { connection, settings, onProblem } = setup();

    const error = await failure(connection.connect({ ...saved, apiToken: goodToken }));

    expect(error.code).toBe('integration_unreachable');
    expect(error.message).toBe("Can't reach your-team.atlassian.net. Check your network or VPN, then try again.");
    expect(onProblem).toHaveBeenCalledWith({ kind: 'unreachable', code: undefined });
    expect(await settings.read()).toEqual({});
  });

  it('AC-5: a site with no Jira is unreachable too', async () => {
    jira.use(http.get(myselfUrl('nobody.atlassian.net'), () => HttpResponse.text('Not found', { status: 404 })));
    const { connection } = setup();

    const error = await failure(connection.connect({ ...saved, site: 'nobody.atlassian.net', apiToken: goodToken }));

    expect(error.code).toBe('integration_unreachable');
    expect(error.message).toBe("There's no Jira at nobody.atlassian.net. Check the address.");
  });

  it("AC-8: saves nothing when the keychain can't be reached", async () => {
    const { connection, settings } = setup({ keychain: createUnreachableKeychain() });

    const error = await failure(connection.connect({ ...saved, apiToken: goodToken }));

    expect(error.code).toBe('keychain_unavailable');
    expect(error.message).toBe(keychainUnavailableMessage);
    expect(await settings.read()).toEqual({});
  });

  it('AC-10: with the token left out, checks the saved token and saves the new email', async () => {
    jira.use(
      http.get(myselfUrl(), ({ request }) => {
        const basic = Buffer.from(`new@example.com:${goodToken}`).toString('base64');
        return request.headers.get('authorization') === `Basic ${basic}`
          ? HttpResponse.json({ accountId: 'abc' })
          : HttpResponse.json({}, { status: 401 });
      }),
    );
    const { connection, keychain, settings } = setup({
      keychain: createMemoryKeychain({ jira: goodToken }),
      settings: { jira: saved },
    });

    await connection.connect({ ...saved, email: 'new@example.com' });

    expect(await keychain.get('jira')).toBe(goodToken);
    expect(await settings.read()).toEqual({ jira: { ...saved, email: 'new@example.com' } });
  });

  it('asks for a token when none is saved and none was given', async () => {
    const { connection } = setup();

    const error = await failure(connection.connect(saved));

    expect(error.code).toBe('bad_request');
    expect(error.message).toBe('Paste your Jira API token.');
  });

  it('AC-11: disconnecting removes the token, the site and the email, and says so on the stream', async () => {
    const { connection, keychain, settings, seen } = setup({
      keychain: createMemoryKeychain({ jira: goodToken }),
      settings: { jira: saved },
    });

    await connection.disconnect();

    expect(await keychain.get('jira')).toBeNull();
    expect(await settings.read()).toEqual({});
    expect(await connection.read()).toEqual({ saved: null, envToken: false });
    expect(seen).toContainEqual({ type: 'status.changed' });
  });

  it("AC-11: disconnecting keeps everything when the keychain can't be reached", async () => {
    const { connection, settings } = setup({ keychain: createUnreachableKeychain(), settings: { jira: saved } });

    const error = await failure(connection.disconnect());

    expect(error.code).toBe('keychain_unavailable');
    expect(await settings.read()).toEqual({ jira: saved });
  });

  it('AC-12: with a .env token and the token left out, checks the .env token and saves only the site and email', async () => {
    const { connection, keychain, settings } = setup({ envTokens: { jira: goodToken } });

    expect(await connection.read()).toEqual({ saved: null, envToken: true });
    expect(await connection.connect(saved)).toEqual({ saved, envToken: true });

    expect(await keychain.get('jira')).toBeNull();
    expect(await settings.read()).toEqual({ jira: saved });
  });
});
