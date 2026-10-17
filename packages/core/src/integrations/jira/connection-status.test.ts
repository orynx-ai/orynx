import { delay, http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerEvent } from '@devhub/contracts';
import { createEventBus } from '../../events/event-bus.ts';
import type { Keychain } from '../../secrets/keychain.ts';
import { createMemoryKeychain, createUnreachableKeychain } from '../../secrets/memory-keychain.ts';
import { createTokenStore, keychainUnavailableMessage, type EnvTokens } from '../../secrets/token-store.ts';
import { createMemorySettingsStore, type Settings } from '../../settings/settings-store.ts';
import { goodToken, jiraEmail, jiraSite, myselfUrl, useFakeJira } from '../../test/fake-jira.ts';
import { createJiraClient } from './client.ts';
import { createJiraConnection } from './connection.ts';

const jira = useFakeJira();
const saved = { site: jiraSite, email: jiraEmail };
const twoMinutes = 2 * 60_000;
const connected = { state: 'connected', detail: 'Personal API token for your-team.atlassian.net' } as const;

afterEach(() => {
  jira.events.removeAllListeners();
});

/** How many times DevHub has asked Jira so far. */
function jiraCalls(): () => number {
  let count = 0;
  jira.events.on('request:start', () => {
    count += 1;
  });
  return () => count;
}

function setup({
  keychain = createMemoryKeychain({ jira: goodToken }),
  envTokens,
  settings = { jira: saved },
}: { keychain?: Keychain; envTokens?: EnvTokens; settings?: Settings } = {}) {
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  let now = 1_000_000;
  const connection = createJiraConnection({
    settings: createMemorySettingsStore(settings),
    tokens: createTokenStore({ keychain, events, ...(envTokens === undefined ? {} : { envTokens }) }),
    jira: createJiraClient({ timeoutMs: 200 }),
    events,
    envToken: envTokens?.jira !== undefined,
    now: () => now,
  });
  return {
    connection,
    keychain,
    seen,
    later: (ms: number) => {
      now += ms;
    },
  };
}

describe("Jira's status line", () => {
  it('AC-1: says not connected, and reads no keychain, until a site and email are saved', async () => {
    const calls = jiraCalls();
    const { connection } = setup({ keychain: createUnreachableKeychain(), settings: {} });

    expect(await connection.status()).toEqual({ state: 'not_connected', detail: null });
    expect(calls()).toBe(0);
  });

  it('AC-9: after a restart, checks with Jira and says connected', async () => {
    expect(await setup().connection.status()).toEqual(connected);
  });

  it('AC-12: names .env as where the token came from', async () => {
    const { connection } = setup({ keychain: createMemoryKeychain(), envTokens: { jira: goodToken } });

    expect(await connection.status()).toEqual({
      state: 'connected',
      detail: 'API token from .env for your-team.atlassian.net',
    });
  });

  it('AC-9: says why when Jira no longer accepts the token', async () => {
    const { connection } = setup({ keychain: createMemoryKeychain({ jira: 'ATATT3xRevokedToken' }) });

    expect(await connection.status()).toEqual({
      state: 'error',
      detail: "Jira didn't accept this email and API token. Check both, or create a new token.",
    });
  });

  it('AC-9: says so when the token was deleted in Keychain Access', async () => {
    const calls = jiraCalls();
    const { connection } = setup({ keychain: createMemoryKeychain() });

    expect(await connection.status()).toEqual({
      state: 'error',
      detail: 'The saved API token is missing from your keychain. Connect again.',
    });
    expect(calls()).toBe(0);
  });

  it("AC-9: says so when the keychain can't be reached", async () => {
    const { connection } = setup({ keychain: createUnreachableKeychain() });

    expect(await connection.status()).toEqual({ state: 'error', detail: keychainUnavailableMessage });
  });

  it('asks Jira at most once every 2 minutes', async () => {
    const calls = jiraCalls();
    const { connection, later } = setup();

    await connection.status();
    later(twoMinutes - 1);
    expect(await connection.status()).toEqual(connected);

    expect(calls()).toBe(1);
  });

  it('shares one check between requests that arrive together', async () => {
    const calls = jiraCalls();
    const { connection } = setup();

    expect(await Promise.all([connection.status(), connection.status(), connection.status()])).toEqual([
      connected,
      connected,
      connected,
    ]);
    expect(calls()).toBe(1);
  });

  it('after 2 minutes, answers at once with the last result and re-checks behind it', async () => {
    const calls = jiraCalls();
    const { connection, later, seen } = setup();
    await connection.status();
    jira.use(http.get(myselfUrl(), () => HttpResponse.json({}, { status: 401 })));

    later(twoMinutes);
    expect(await connection.status()).toEqual(connected);

    await vi.waitFor(() => {
      expect(seen).toContainEqual({ type: 'status.changed' });
    });
    expect(calls()).toBe(2);
    expect((await connection.status()).state).toBe('error');
  });

  it('a re-check that finds nothing new stays quiet', async () => {
    const calls = jiraCalls();
    const { connection, later, seen } = setup();
    await connection.status();

    later(twoMinutes);
    await connection.status();
    await vi.waitFor(() => {
      expect(calls()).toBe(2);
    });
    await connection.status();

    expect(seen).toEqual([]);
  });

  it('AC-3: is connected right after Connect, without asking Jira again', async () => {
    const calls = jiraCalls();
    const { connection } = setup({ keychain: createMemoryKeychain(), settings: {} });

    await connection.connect({ ...saved, apiToken: goodToken });

    expect(await connection.status()).toEqual(connected);
    expect(calls()).toBe(1);
  });

  it('AC-12: right after connecting with the .env token, names .env', async () => {
    const { connection } = setup({ keychain: createMemoryKeychain(), envTokens: { jira: goodToken }, settings: {} });

    await connection.connect(saved);

    expect(await connection.status()).toEqual({
      state: 'connected',
      detail: 'API token from .env for your-team.atlassian.net',
    });
  });

  it('AC-11: is not connected right after Disconnect', async () => {
    const { connection } = setup();
    await connection.status();

    await connection.disconnect();

    expect(await connection.status()).toEqual({ state: 'not_connected', detail: null });
  });

  it("a check that started before Connect doesn't overwrite what Connect found", async () => {
    let answerOldCheck: () => void = () => undefined;
    const oldCheckAnswered = new Promise<void>((resolve) => {
      answerOldCheck = resolve;
    });
    jira.use(
      http.get(
        myselfUrl(),
        async () => {
          await oldCheckAnswered;
          return HttpResponse.json({}, { status: 401 });
        },
        { once: true },
      ),
    );
    const { connection } = setup({ keychain: createMemoryKeychain({ jira: 'ATATT3xOldToken' }) });

    const oldCheck = connection.status();
    await delay(20);
    await connection.connect({ ...saved, apiToken: goodToken });
    answerOldCheck();
    await oldCheck;

    expect(await connection.status()).toEqual(connected);
  });
});
