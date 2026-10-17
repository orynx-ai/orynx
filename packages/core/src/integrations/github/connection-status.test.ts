import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerEvent } from '@devhub/contracts';
import { createEventBus } from '../../events/event-bus.ts';
import type { Keychain } from '../../secrets/keychain.ts';
import { createMemoryKeychain, createUnreachableKeychain } from '../../secrets/memory-keychain.ts';
import { createTokenStore, keychainUnavailableMessage, type EnvTokens } from '../../secrets/token-store.ts';
import { createMemorySettingsStore, type Settings, type SettingsStore } from '../../settings/settings-store.ts';
import { useFakeGhFolder, type FakeGhBehaviour } from '../../test/fake-gh.ts';
import { acceptingUser, githubToken, useFakeGitHub } from '../../test/fake-github.ts';
import { createGhCli } from './gh.ts';
import { createGitHubClient } from './client.ts';
import { createGitHubConnection } from './connection.ts';

const github = useFakeGitHub();
const fakeGhFolder = useFakeGhFolder();
const twoMinutes = 2 * 60_000;
const viaGh = { state: 'connected', detail: 'Signed in as octocat with the gh command-line tool' } as const;
const viaToken = { state: 'connected', detail: 'Personal access token for octocat' } as const;

afterEach(() => {
  github.events.removeAllListeners();
});

/** How many times DevHub has asked GitHub so far. */
function githubCalls(): () => number {
  let count = 0;
  github.events.on('request:start', () => {
    count += 1;
  });
  return () => count;
}

async function setup({
  keychain = createMemoryKeychain(),
  envTokens,
  settings = { github: { method: 'gh' } },
  settingsStore,
  gh = { kind: 'signed_in' },
}: {
  keychain?: Keychain;
  envTokens?: EnvTokens;
  settings?: Settings;
  settingsStore?: SettingsStore;
  gh?: FakeGhBehaviour | null;
} = {}) {
  const folder = await fakeGhFolder();
  if (gh !== null) await folder.install(gh);
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  let now = 1_000_000;
  const onError = vi.fn();
  const connection = createGitHubConnection({
    settings: settingsStore ?? createMemorySettingsStore(settings),
    tokens: createTokenStore({ keychain, events, ...(envTokens === undefined ? {} : { envTokens }) }),
    github: createGitHubClient({ timeoutMs: 200 }),
    gh: createGhCli({ searchPath: folder.dir, timeoutMs: 2000 }),
    events,
    envToken: envTokens?.github !== undefined,
    onError,
    now: () => now,
  });
  return {
    connection,
    seen,
    folder,
    onError,
    later: (ms: number) => {
      now += ms;
    },
  };
}

describe.skipIf(process.platform === 'win32')("GitHub's status line", () => {
  it('AC-1: says not connected, and runs no gh and reads no keychain, until a way is saved', async () => {
    const calls = githubCalls();
    const { connection, folder } = await setup({ keychain: createUnreachableKeychain(), settings: {} });

    expect(await connection.status()).toEqual({ state: 'not_connected', detail: null });
    expect(await folder.runs()).toEqual([]);
    expect(calls()).toBe(0);
  });

  it('AC-11: after a restart, asks gh again, checks with GitHub, and names the account', async () => {
    const { connection, folder } = await setup({ keychain: createUnreachableKeychain() });

    expect(await connection.status()).toEqual(viaGh);
    expect(await folder.runs()).toHaveLength(1);
  });

  it('AC-11: names the account for a saved token', async () => {
    const { connection, folder } = await setup({
      keychain: createMemoryKeychain({ github: githubToken }),
      settings: { github: { method: 'token' } },
    });

    expect(await connection.status()).toEqual(viaToken);
    expect(await folder.runs()).toEqual([]);
  });

  it('AC-14: names .env as where the token came from', async () => {
    const { connection } = await setup({
      envTokens: { github: githubToken },
      settings: { github: { method: 'token' } },
    });

    expect(await connection.status()).toEqual({ state: 'connected', detail: 'Token from .env for octocat' });
  });

  it('AC-11: says so when gh has signed out since', async () => {
    const calls = githubCalls();
    const { connection } = await setup({ gh: { kind: 'signed_out' } });

    expect(await connection.status()).toEqual({
      state: 'error',
      detail: "gh isn't signed in to github.com. Run gh auth login in a terminal, then try again.",
    });
    expect(calls()).toBe(0);
  });

  it('AC-11: says why when GitHub no longer accepts the saved token', async () => {
    const { connection } = await setup({
      keychain: createMemoryKeychain({ github: 'fake-revoked-token' }),
      settings: { github: { method: 'token' } },
    });

    expect(await connection.status()).toEqual({
      state: 'error',
      detail: "GitHub didn't accept this token. Check it, or create a new one.",
    });
  });

  it('AC-11: says so when the token lost the repo scope', async () => {
    github.use(acceptingUser({ scopes: 'gist' }));
    const { connection } = await setup();

    expect(await connection.status()).toEqual({
      state: 'error',
      detail: "Your gh login can't read private repositories. Run gh auth refresh --scopes repo, then try again.",
    });
  });

  it('AC-11: says so when the token was deleted in Keychain Access', async () => {
    const calls = githubCalls();
    const { connection } = await setup({ settings: { github: { method: 'token' } } });

    expect(await connection.status()).toEqual({
      state: 'error',
      detail: 'The saved token is missing from your keychain. Connect again.',
    });
    expect(calls()).toBe(0);
  });

  it("AC-11: says so when the keychain can't be reached", async () => {
    const { connection } = await setup({
      keychain: createUnreachableKeychain(),
      settings: { github: { method: 'token' } },
    });

    expect(await connection.status()).toEqual({ state: 'error', detail: keychainUnavailableMessage });
  });

  it('asks gh and GitHub at most once every 2 minutes', async () => {
    const calls = githubCalls();
    const { connection, folder, later } = await setup();

    await connection.status();
    later(twoMinutes - 1);
    expect(await connection.status()).toEqual(viaGh);

    expect(calls()).toBe(1);
    expect(await folder.runs()).toHaveLength(1);
  });

  it('AC-11: follows a switch of gh account at the next check, and says the line changed', async () => {
    const { connection, seen, later } = await setup();
    await connection.status();
    github.use(acceptingUser({ login: 'hubot' }));

    later(twoMinutes);
    expect(await connection.status()).toEqual(viaGh);

    await vi.waitFor(() => {
      expect(seen).toContainEqual({ type: 'status.changed' });
    });
    expect(await connection.status()).toEqual({
      state: 'connected',
      detail: 'Signed in as hubot with the gh command-line tool',
    });
  });

  it('AC-3: is connected right after Connect, without asking gh or GitHub again', async () => {
    const calls = githubCalls();
    const { connection, folder } = await setup({ settings: {} });

    await connection.connect({ method: 'gh' });

    expect(await connection.status()).toEqual(viaGh);
    expect(calls()).toBe(1);
    expect(await folder.runs()).toHaveLength(1);
  });

  it('AC-5, AC-14: right after Connect, names where the token came from', async () => {
    const typed = await setup({ settings: {} });
    await typed.connection.connect({ method: 'token', token: githubToken });
    expect(await typed.connection.status()).toEqual(viaToken);

    const fromEnv = await setup({ envTokens: { github: githubToken }, settings: {} });
    await fromEnv.connection.connect({ method: 'token' });
    expect(await fromEnv.connection.status()).toEqual({ state: 'connected', detail: 'Token from .env for octocat' });
  });

  it('AC-13: is not connected right after Disconnect', async () => {
    const { connection } = await setup();
    await connection.status();

    await connection.disconnect();

    expect(await connection.status()).toEqual({ state: 'not_connected', detail: null });
  });

  it("never breaks GET /api/status: a settings file that can't be read makes GitHub's line an error", async () => {
    const failure = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    const { connection, onError } = await setup({
      settingsStore: { read: () => Promise.reject(failure), update: () => Promise.reject(failure) },
    });

    expect(await connection.status()).toEqual({ state: 'error', detail: null });
    expect(onError).toHaveBeenCalledWith(failure);
  });
});
