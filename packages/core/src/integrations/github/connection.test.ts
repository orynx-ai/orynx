import { delay, http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerEvent } from '@devhub/contracts';
import { createEventBus } from '../../events/event-bus.ts';
import type { Keychain } from '../../secrets/keychain.ts';
import { createMemoryKeychain, createUnreachableKeychain } from '../../secrets/memory-keychain.ts';
import { createTokenStore, keychainUnavailableMessage, type EnvTokens } from '../../secrets/token-store.ts';
import { createMemorySettingsStore, type Settings } from '../../settings/settings-store.ts';
import { ghToken, useFakeGhFolder, type FakeGhBehaviour } from '../../test/fake-gh.ts';
import { acceptingUser, githubToken, userUrl, useFakeGitHub } from '../../test/fake-github.ts';
import { ConnectionError } from '../connection-error.ts';
import { createGhCli } from './gh.ts';
import { createGitHubClient } from './client.ts';
import { createGitHubConnection } from './connection.ts';

const github = useFakeGitHub();
const fakeGhFolder = useFakeGhFolder();

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
  settings: initial = {},
  gh = { kind: 'signed_in' },
}: { keychain?: Keychain; envTokens?: EnvTokens; settings?: Settings; gh?: FakeGhBehaviour | null } = {}) {
  const folder = await fakeGhFolder();
  if (gh !== null) await folder.install(gh);
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  const settings = createMemorySettingsStore(initial);
  const onProblem = vi.fn();
  const connection = createGitHubConnection({
    settings,
    tokens: createTokenStore({ keychain, events, ...(envTokens === undefined ? {} : { envTokens }) }),
    github: createGitHubClient({ timeoutMs: 200 }),
    gh: createGhCli({ searchPath: folder.dir, timeoutMs: 2000 }),
    events,
    envToken: envTokens?.github !== undefined,
    onProblem,
  });
  return { connection, keychain, settings, seen, onProblem, folder };
}

/** Runs `work`, which must fail with a ConnectionError, and returns that error. */
async function failure(work: Promise<unknown>): Promise<ConnectionError> {
  const error: unknown = await work.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof ConnectionError)) throw new Error(`Expected a ConnectionError, got ${String(error)}`);
  return error;
}

describe.skipIf(process.platform === 'win32')('GitHub connection', () => {
  it('AC-1, AC-2: reads as not connected and says gh is there, without running gh or touching the keychain', async () => {
    const { connection, folder } = await setup({ keychain: createUnreachableKeychain() });

    expect(await connection.read()).toEqual({ saved: null, envToken: false, ghFound: true });
    expect(await folder.runs()).toEqual([]);
  });

  it('AC-2: says when gh is not on the path', async () => {
    const { connection } = await setup({ gh: null });

    expect((await connection.read()).ghFound).toBe(false);
  });

  it('AC-3: the gh way asks gh, checks with GitHub, and saves only the way, never a token', async () => {
    const { connection, keychain, settings, seen, folder } = await setup();

    expect(await connection.connect({ method: 'gh' })).toEqual({
      saved: { method: 'gh' },
      envToken: false,
      ghFound: true,
    });

    expect(await settings.read()).toEqual({ github: { method: 'gh' } });
    expect(await keychain.get('github')).toBeNull();
    expect(await folder.runs()).toEqual([['auth', 'token', '--hostname', 'github.com']]);
    expect(seen).toContainEqual({ type: 'status.changed' });
  });

  it('AC-3, AC-10: the gh way never touches the keychain', async () => {
    const { connection, settings } = await setup({ keychain: createUnreachableKeychain() });

    await connection.connect({ method: 'gh' });

    expect(await settings.read()).toEqual({ github: { method: 'gh' } });
  });

  it.each([
    [
      null,
      "DevHub can't find the gh command. Install it from cli.github.com, or use a personal access token.",
      { kind: 'gh_missing' },
    ],
    [
      { kind: 'signed_out' },
      "gh isn't signed in to github.com. Run gh auth login in a terminal, then try again.",
      { kind: 'gh_signed_out' },
    ],
    [
      { kind: 'fails', exitCode: 2, stderr: 'oops' },
      "The gh command didn't give a token. Run gh auth status in a terminal to see why.",
      { kind: 'gh_failed', exitCode: 2 },
    ],
  ] satisfies [FakeGhBehaviour | null, string, object][])(
    'AC-4: saves nothing when gh can not give a token (%j)',
    async (gh, message, problem) => {
      const calls = githubCalls();
      const { connection, settings, seen, onProblem } = await setup({ gh });

      const error = await failure(connection.connect({ method: 'gh' }));

      expect(error.code).toBe('integration_rejected');
      expect(error.message).toBe(message);
      expect(await settings.read()).toEqual({});
      expect(seen).toEqual([]);
      expect(calls()).toBe(0);
      expect(onProblem).toHaveBeenCalledWith(problem);
    },
  );

  it('AC-5: the token way checks with GitHub, keeps the token in the keychain and the way in settings', async () => {
    const { connection, keychain, settings, folder } = await setup();

    expect(await connection.connect({ method: 'token', token: githubToken })).toEqual({
      saved: { method: 'token' },
      envToken: false,
      ghFound: true,
    });

    expect(await keychain.get('github')).toBe(githubToken);
    expect(await settings.read()).toEqual({ github: { method: 'token' } });
    expect(await folder.runs()).toEqual([]);
  });

  it('AC-6: saves nothing when GitHub refuses the token', async () => {
    const { connection, keychain, settings, seen } = await setup();

    const error = await failure(connection.connect({ method: 'token', token: 'fake-wrong-token' }));

    expect(error.code).toBe('integration_rejected');
    expect(error.message).toBe("GitHub didn't accept this token. Check it, or create a new one.");
    expect(await keychain.get('github')).toBeNull();
    expect(await settings.read()).toEqual({});
    expect(seen).toEqual([]);
  });

  it("AC-6: says to sign in to gh again when GitHub refuses gh's token", async () => {
    const { connection } = await setup({ gh: { kind: 'signed_in', token: 'fake-stale-gh-token' } });

    const error = await failure(connection.connect({ method: 'gh' }));

    expect(error.code).toBe('integration_rejected');
    expect(error.message).toBe("GitHub didn't accept your gh login. Run gh auth login in a terminal, then try again.");
  });

  it('AC-6: keeps an existing connection exactly as it was when a change is refused', async () => {
    const { connection, keychain, settings } = await setup({
      keychain: createMemoryKeychain({ github: githubToken }),
      settings: { github: { method: 'token' } },
    });

    await failure(connection.connect({ method: 'token', token: 'fake-wrong-token' }));

    expect(await keychain.get('github')).toBe(githubToken);
    expect(await settings.read()).toEqual({ github: { method: 'token' } });
  });

  it('AC-7: refuses a classic token without the repo scope, in words for the way used', async () => {
    github.use(acceptingUser({ scopes: 'read:org, gist' }));
    const { connection, keychain, settings } = await setup();

    const token = await failure(connection.connect({ method: 'token', token: githubToken }));
    const gh = await failure(connection.connect({ method: 'gh' }));

    expect(token.code).toBe('integration_rejected');
    expect(token.message).toBe("This token can't read private repositories. Create one with the repo scope.");
    expect(gh.message).toBe(
      "Your gh login can't read private repositories. Run gh auth refresh --scopes repo, then try again.",
    );
    expect(await keychain.get('github')).toBeNull();
    expect(await settings.read()).toEqual({});
  });

  it('AC-7: accepts a fine-grained token, which names no scopes', async () => {
    github.use(acceptingUser({ scopes: null }));
    const { connection, settings } = await setup();

    await connection.connect({ method: 'token', token: githubToken });

    expect(await settings.read()).toEqual({ github: { method: 'token' } });
  });

  it("AC-8: saves nothing when github.com can't be reached", async () => {
    github.use(http.get(userUrl, () => HttpResponse.error()));
    const { connection, settings, onProblem } = await setup();

    const error = await failure(connection.connect({ method: 'gh' }));

    expect(error.code).toBe('integration_unreachable');
    expect(error.message).toBe("Can't reach github.com. Check your network or VPN, then try again.");
    expect(await settings.read()).toEqual({});
    expect(onProblem).toHaveBeenCalledWith({ kind: 'unreachable', code: undefined });
  });

  it('AC-8: a used-up rate limit is something to wait for, not a refused token', async () => {
    github.use(
      http.get(userUrl, () =>
        HttpResponse.json({}, { status: 403, headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '0' } }),
      ),
    );
    const { connection } = await setup();

    const error = await failure(connection.connect({ method: 'token', token: githubToken }));

    expect(error.code).toBe('integration_unreachable');
    expect(error.message).toBe("GitHub's rate limit for this account is used up. Try again in a minute.");
  });

  it.each([
    ['takes more than the time allowed', "github.com didn't answer in 10 seconds. Try again."],
    ['answers 503', 'GitHub answered with an error (503). Try again in a minute.'],
  ])('AC-8: saves nothing when github.com %s, and says to wait, not that the token was refused', async (_, message) => {
    github.use(
      http.get(userUrl, async () => {
        if (message.startsWith('github.com')) await delay('infinite');
        return HttpResponse.json({ message: 'Unicorn' }, { status: 503 });
      }),
    );
    const { connection, settings } = await setup();

    const error = await failure(connection.connect({ method: 'token', token: githubToken }));

    expect(error.code).toBe('integration_unreachable');
    expect(error.message).toBe(message);
    expect(await settings.read()).toEqual({});
  });

  it('AC-9: with no token typed, none saved and none in .env, refuses before asking GitHub', async () => {
    const calls = githubCalls();
    const { connection } = await setup();

    const error = await failure(connection.connect({ method: 'token' }));

    expect(error.code).toBe('bad_request');
    expect(error.message).toBe('Paste your GitHub token.');
    expect(calls()).toBe(0);
  });

  it("AC-10: saves nothing and says so when the keychain can't be reached", async () => {
    const { connection, settings, onProblem } = await setup({ keychain: createUnreachableKeychain() });

    const error = await failure(connection.connect({ method: 'token', token: githubToken }));

    expect(error.code).toBe('keychain_unavailable');
    expect(error.message).toBe(keychainUnavailableMessage);
    expect(await settings.read()).toEqual({});
    expect(onProblem).toHaveBeenCalledWith(expect.objectContaining({ kind: 'keychain_unavailable' }));
  });

  it('AC-12: an empty token keeps the saved one, checked again with GitHub', async () => {
    const calls = githubCalls();
    const { connection, keychain } = await setup({
      keychain: createMemoryKeychain({ github: githubToken }),
      settings: { github: { method: 'token' } },
    });

    await connection.connect({ method: 'token' });

    expect(calls()).toBe(1);
    expect(await keychain.get('github')).toBe(githubToken);
  });

  it('AC-12: picking the gh way deletes the saved token, so DevHub keeps one way at a time', async () => {
    const { connection, keychain, settings } = await setup({
      keychain: createMemoryKeychain({ github: githubToken }),
      settings: { github: { method: 'token' } },
    });

    await connection.connect({ method: 'gh' });

    expect(await keychain.get('github')).toBeNull();
    expect(await settings.read()).toEqual({ github: { method: 'gh' } });
  });

  it("AC-12: stays on the token way when the saved token can't be deleted", async () => {
    const keychain = createUnreachableKeychain();
    const { connection, settings } = await setup({ keychain, settings: { github: { method: 'token' } } });

    const error = await failure(connection.connect({ method: 'gh' }));

    expect(error.code).toBe('keychain_unavailable');
    expect(await settings.read()).toEqual({ github: { method: 'token' } });
  });

  it('AC-13: Disconnect removes the token and the way, and leaves gh alone', async () => {
    const { connection, keychain, settings, seen, folder } = await setup({
      keychain: createMemoryKeychain({ github: githubToken }),
      settings: { github: { method: 'token' } },
    });

    await connection.disconnect();

    expect(await keychain.get('github')).toBeNull();
    expect(await settings.read()).toEqual({});
    expect(seen).toContainEqual({ type: 'status.changed' });
    expect(await folder.runs()).toEqual([]);
  });

  it('AC-13: Disconnect from the gh way never touches the keychain', async () => {
    const { connection, settings } = await setup({
      keychain: createUnreachableKeychain(),
      settings: { github: { method: 'gh' } },
    });

    await connection.disconnect();

    expect(await settings.read()).toEqual({});
  });

  it('AC-14: an empty token uses the .env one and saves only the way', async () => {
    const { connection, keychain, settings } = await setup({ envTokens: { github: githubToken } });

    expect(await connection.connect({ method: 'token' })).toEqual({
      saved: { method: 'token' },
      envToken: true,
      ghFound: true,
    });

    expect(await keychain.get('github')).toBeNull();
    expect(await settings.read()).toEqual({ github: { method: 'token' } });
  });

  it('AC-17: tells the terminal what failed without the token', async () => {
    const { connection, onProblem } = await setup({ gh: { kind: 'signed_in', token: 'fake-stale-gh-token' } });

    await failure(connection.connect({ method: 'gh' }));
    await failure(connection.connect({ method: 'token', token: 'fake-wrong-token' }));

    const told = JSON.stringify(onProblem.mock.calls);
    expect(told).not.toContain('fake-stale-gh-token');
    expect(told).not.toContain('fake-wrong-token');
    expect(told).not.toContain(ghToken);
  });
});

describe.skipIf(process.platform === 'win32')('GitHub connection: credentials for the inbox (spec 007)', () => {
  it('has none until GitHub is connected, and never runs gh or touches the keychain to say so', async () => {
    const { connection, folder } = await setup({ keychain: createUnreachableKeychain() });

    expect(await connection.credentials()).toBeNull();
    expect(await folder.runs()).toEqual([]);
  });

  it('hands out gh’s token for the gh way', async () => {
    const { connection } = await setup({ settings: { github: { method: 'gh' } } });

    expect(await connection.credentials()).toEqual({ ok: true, connection: 'gh', token: ghToken });
  });

  it('hands out the saved token for the token way', async () => {
    const { connection } = await setup({
      keychain: createMemoryKeychain({ github: githubToken }),
      settings: { github: { method: 'token' } },
    });

    expect(await connection.credentials()).toEqual({ ok: true, connection: 'token', token: githubToken });
  });

  it('AC-25: a token missing from the keychain reads as refused', async () => {
    const { connection } = await setup({ settings: { github: { method: 'token' } } });

    expect(await connection.credentials()).toEqual({ ok: false, connection: 'token', problem: { kind: 'rejected' } });
  });

  it('AC-25: a signed-out gh says so in spec 004’s words', async () => {
    const { connection } = await setup({ gh: { kind: 'signed_out' }, settings: { github: { method: 'gh' } } });

    expect(await connection.credentials()).toEqual({
      ok: false,
      connection: 'gh',
      problem: {
        kind: 'other',
        message: "gh isn't signed in to github.com. Run gh auth login in a terminal, then try again.",
      },
    });
  });

  it('AC-25: a keychain DevHub can’t reach says so in spec 002’s words', async () => {
    const { connection } = await setup({
      keychain: createUnreachableKeychain(),
      settings: { github: { method: 'token' } },
    });

    expect(await connection.credentials()).toMatchObject({
      ok: false,
      problem: { kind: 'other', message: keychainUnavailableMessage },
    });
  });
});
