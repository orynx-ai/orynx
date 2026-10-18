import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { ServerEvent } from '@devhub/contracts';
import { createEventBus } from '../../events/event-bus.ts';
import type { Keychain } from '../../secrets/keychain.ts';
import { createMemoryKeychain, createUnreachableKeychain } from '../../secrets/memory-keychain.ts';
import { createTokenStore, keychainUnavailableMessage, type EnvTokens } from '../../secrets/token-store.ts';
import { createMemorySettingsStore, type Settings } from '../../settings/settings-store.ts';
import {
  acceptingProjectSearch,
  goodToken,
  jiraEmail,
  jiraSite,
  myselfUrl,
  projectSearchUrl,
  useFakeJira,
} from '../../test/fake-jira.ts';
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

    const error = await failure(connection.connect({ ...saved, apiToken: 'fake-wrong-token' }));

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

    await failure(connection.connect({ ...saved, email: 'other@example.com', apiToken: 'fake-wrong-token' }));

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

  it("AC-8: tells the terminal why the keychain can't be reached", async () => {
    const { connection, onProblem } = setup({ keychain: createUnreachableKeychain() });

    await failure(connection.connect({ ...saved, apiToken: goodToken }));

    expect(onProblem).toHaveBeenCalledWith({ kind: 'keychain_unavailable', reason: 'Error' });
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

  it('spec 020: a new site drops the Tickets choice, whose project and sprint were the old site’s; the same site keeps it', async () => {
    jira.use(http.get(myselfUrl('other.atlassian.net'), () => HttpResponse.json({ accountId: 'abc' })));
    const choice = { projectKey: 'WEB', sprintId: 43 };
    const { connection, settings } = setup({
      keychain: createMemoryKeychain({ jira: goodToken }),
      settings: { jira: saved, tickets: choice },
    });

    await connection.connect({ ...saved, apiToken: goodToken });
    expect((await settings.read()).tickets).toEqual(choice);

    await connection.connect({ site: 'other.atlassian.net', email: jiraEmail, apiToken: goodToken });
    expect(await settings.read()).toEqual({ jira: { site: 'other.atlassian.net', email: jiraEmail } });
  });

  it('asks for a token when none is saved and none was given', async () => {
    const { connection } = setup();

    const error = await failure(connection.connect(saved));

    expect(error.code).toBe('bad_request');
    expect(error.message).toBe('Paste your Jira API token.');
  });

  it('AC-11: disconnecting removes the token, the site, the email and the Tickets choice (spec 020), and says so', async () => {
    const { connection, keychain, settings, seen } = setup({
      keychain: createMemoryKeychain({ jira: goodToken }),
      settings: { jira: saved, tickets: { projectKey: 'WEB', sprintId: null } },
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

describe('Jira connection: projects', () => {
  const projects = [
    { key: 'MOB', name: 'Mobile' },
    { key: 'PROJ', name: 'Intranet' },
  ];

  async function connected(options: Parameters<typeof setup>[0] = {}) {
    const keychain = options.keychain ?? createMemoryKeychain();
    await keychain.set('jira', goodToken);
    return setup({ ...options, keychain, settings: { jira: saved, ...options.settings } });
  }

  it('AC-5: lists the projects the saved connection can see', async () => {
    jira.use(acceptingProjectSearch(projects));
    const { connection } = await connected();

    expect(await connection.projects()).toEqual(projects);
  });

  it('AC-8: asks for a connection first when Jira is not connected', async () => {
    const { connection } = setup();

    const error = await failure(connection.projects());

    expect(error.code).toBe('bad_request');
    expect(error.message).toBe('Connect Jira in Connections to pick a project.');
  });

  it("AC-9: says Jira refused, in spec 003's words, and tells the terminal", async () => {
    jira.use(acceptingProjectSearch(projects));
    const keychain = createMemoryKeychain();
    await keychain.set('jira', 'fake-old-token');
    const { connection, onProblem } = setup({ keychain, settings: { jira: saved } });

    const error = await failure(connection.projects());

    expect(error.code).toBe('integration_rejected');
    expect(error.message).toBe("Jira didn't accept this email and API token. Check both, or create a new token.");
    expect(onProblem).toHaveBeenCalledWith({ kind: 'rejected' });
  });

  it("AC-9: says Jira can't be reached", async () => {
    jira.use(http.get(projectSearchUrl(), () => HttpResponse.error()));
    const { connection } = await connected();

    const error = await failure(connection.projects());

    expect(error.code).toBe('integration_unreachable');
    expect(error.message).toBe(`Can't reach ${jiraSite}. Check your network or VPN, then try again.`);
  });

  it('AC-9: says the saved token is gone from the keychain', async () => {
    const { connection } = setup({ settings: { jira: saved } });

    const error = await failure(connection.projects());

    expect(error.code).toBe('integration_rejected');
    expect(error.message).toBe('The saved API token is missing from your keychain. Connect again.');
  });

  it("AC-9: says the keychain can't be reached", async () => {
    const { connection } = setup({ keychain: createUnreachableKeychain(), settings: { jira: saved } });

    const error = await failure(connection.projects());

    expect(error.code).toBe('keychain_unavailable');
    expect(error.message).toBe(keychainUnavailableMessage);
  });
});

describe('Jira connection: credentials for the inbox (spec 007)', () => {
  it('has none until Jira is connected, and never touches the keychain to say so', async () => {
    const { connection } = setup({ keychain: createUnreachableKeychain() });

    expect(await connection.credentials()).toBeNull();
  });

  it('hands out the saved site, email and token, under the account they belong to', async () => {
    const { connection } = setup({ keychain: createMemoryKeychain({ jira: goodToken }), settings: { jira: saved } });

    expect(await connection.credentials()).toEqual({
      ok: true,
      connection: `${jiraSite} ${jiraEmail}`,
      site: jiraSite,
      request: { site: jiraSite, email: jiraEmail, apiToken: goodToken },
    });
  });

  it('AC-25: a token missing from the keychain reads as refused, so the line says to reconnect', async () => {
    const { connection } = setup({ settings: { jira: saved } });

    expect(await connection.credentials()).toEqual({
      ok: false,
      connection: `${jiraSite} ${jiraEmail}`,
      site: jiraSite,
      problem: { kind: 'rejected' },
    });
  });

  it('AC-25: a keychain DevHub can’t reach says so in spec 002’s words', async () => {
    const { connection, onProblem } = setup({ keychain: createUnreachableKeychain(), settings: { jira: saved } });

    expect(await connection.credentials()).toMatchObject({
      ok: false,
      problem: { kind: 'other', message: keychainUnavailableMessage },
    });
    expect(onProblem).toHaveBeenCalledWith({ kind: 'keychain_unavailable', reason: 'Error' });
  });
});
