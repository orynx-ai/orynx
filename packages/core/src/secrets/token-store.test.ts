import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { ServerEvent } from '@devhub/contracts';
import { createEventBus } from '../events/event-bus.ts';
import type { Keychain } from './keychain.ts';
import { createMemoryKeychain, createUnreachableKeychain } from './memory-keychain.ts';
import { createTokenStore, TokenStoreError, type EnvTokens } from './token-store.ts';

// Made-up values that match no real token format, so the secrets gate stays quiet.
const jiraToken = 'jira-token-for-tests-1234';
const otherJiraToken = 'jira-token-from-dotenv-5678';

function setup({ keychain = createMemoryKeychain(), envTokens }: { keychain?: Keychain; envTokens?: EnvTokens } = {}) {
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  const store = createTokenStore({ keychain, events, ...(envTokens === undefined ? {} : { envTokens }) });
  return { store, keychain, seen };
}

describe('token store', () => {
  it('AC-2: reads back a saved token, marked as coming from the keychain', async () => {
    const { store, keychain } = setup();

    await store.save('jira', jiraToken);

    expect(await store.read('jira')).toEqual({ token: jiraToken, source: 'keychain' });
    expect(await keychain.get('jira')).toBe(jiraToken);
    expect(await store.read('github')).toBeNull();
  });

  it('AC-3: finds no token after deleting it, and deleting it again is not an error', async () => {
    const { store } = setup({ keychain: createMemoryKeychain({ jira: jiraToken }) });

    await store.remove('jira');
    expect(await store.read('jira')).toBeNull();
    await expect(store.remove('jira')).resolves.toBeUndefined();
  });

  it('AC-4: publishes status.changed after a save and after a delete', async () => {
    const { store, seen } = setup();

    await store.save('slack', 'slack-token-for-tests');
    await store.remove('slack');

    expect(seen).toEqual([{ type: 'status.changed' }, { type: 'status.changed' }]);
  });

  it.each([
    ['empty', ''],
    ['with a space', 'two words'],
    ['with a line break', 'pasted-token\n'],
    ['longer than 4096 characters', 'x'.repeat(4097)],
  ])('AC-5: refuses a token that is %s and leaves the keychain unchanged', async (_name, token) => {
    const { store, keychain, seen } = setup({ keychain: createMemoryKeychain({ jira: jiraToken }) });

    const error = await store.save('jira', token).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TokenStoreError);
    expect(error).toMatchObject({ code: 'bad_request' });
    expect(await keychain.get('jira')).toBe(jiraToken);
    expect(seen).toEqual([]);
  });

  it('AC-5: accepts a token of exactly 4096 characters', async () => {
    const { store } = setup();
    const longest = 'x'.repeat(4096);

    await store.save('github', longest);

    expect(await store.read('github')).toEqual({ token: longest, source: 'keychain' });
  });

  it('AC-7: finds no token when the host passes no .env tokens (the switch is off)', async () => {
    const { store } = setup();

    expect(await store.read('github')).toBeNull();
  });

  it('AC-8: reads a .env token when the keychain has none, marked as coming from .env', async () => {
    const { store } = setup({ envTokens: { jira: otherJiraToken } });

    expect(await store.read('jira')).toEqual({ token: otherJiraToken, source: 'env' });
    expect(await store.read('slack')).toBeNull();
  });

  it("AC-9: prefers the keychain's token over the .env one", async () => {
    const { store } = setup({
      keychain: createMemoryKeychain({ jira: jiraToken }),
      envTokens: { jira: otherJiraToken },
    });

    expect(await store.read('jira')).toEqual({ token: jiraToken, source: 'keychain' });
  });

  it('saves to the keychain even when .env has a token, and never changes the .env tokens', async () => {
    const envTokens: EnvTokens = { jira: otherJiraToken };
    const { store, keychain } = setup({ envTokens });

    await store.save('jira', jiraToken);
    await store.remove('jira');

    expect(await keychain.get('jira')).toBeNull();
    expect(envTokens).toEqual({ jira: otherJiraToken });
    expect(await store.read('jira')).toEqual({ token: otherJiraToken, source: 'env' });
  });
});

describe("token store when the keychain can't be reached", () => {
  const message = "DevHub can't reach your OS keychain. Unlock it, or turn on the .env fallback (see .env.example).";

  it('AC-6: reading, saving and deleting fail with keychain_unavailable and publish nothing', async () => {
    const { store, seen } = setup({ keychain: createUnreachableKeychain() });

    for (const attempt of [store.read('jira'), store.save('jira', jiraToken), store.remove('jira')]) {
      const error = await attempt.catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(TokenStoreError);
      expect(error).toMatchObject({ code: 'keychain_unavailable', message });
    }
    expect(seen).toEqual([]);
  });

  it('AC-10: reads the .env token with no error, but a save still fails', async () => {
    const { store } = setup({ keychain: createUnreachableKeychain(), envTokens: { jira: otherJiraToken } });

    expect(await store.read('jira')).toEqual({ token: otherJiraToken, source: 'env' });
    await expect(store.save('jira', jiraToken)).rejects.toMatchObject({ code: 'keychain_unavailable' });
    await expect(store.read('github')).rejects.toMatchObject({ code: 'keychain_unavailable' });
  });

  it("keeps the keychain error's name and code as a reason that is safe to log", async () => {
    const missingModule = Object.assign(new Error(`Cannot find package '@napi-rs/keyring' (${jiraToken})`), {
      code: 'ERR_MODULE_NOT_FOUND',
    });
    const keychain: Keychain = {
      get: () => Promise.reject(missingModule),
      set: () => Promise.reject(new TypeError('entry is not a constructor')),
      delete: () => Promise.reject(new Error('locked')),
    };
    const { store } = setup({ keychain });

    await expect(store.read('jira')).rejects.toMatchObject({ reason: 'Error (ERR_MODULE_NOT_FOUND)' });
    await expect(store.save('jira', jiraToken)).rejects.toMatchObject({ reason: 'TypeError' });
    await expect(store.remove('jira')).rejects.toMatchObject({ reason: 'Error' });
  });

  it("AC-14: no error contains a token, even when the keychain's own error would", async () => {
    // A keychain whose own failure echoes what it was given is the worst case for a leak.
    const echoing = createUnreachableKeychain((token) => `could not store ${token ?? 'nothing'}`);
    const { store } = setup({ keychain: echoing, envTokens: { github: otherJiraToken } });

    const errors = await Promise.all(
      [store.save('jira', jiraToken), store.read('jira'), store.remove('jira')].map((attempt) =>
        attempt.catch((caught: unknown) => caught),
      ),
    );

    for (const error of errors) {
      const everything = inspect(error, { depth: Infinity, showHidden: true });
      expect(everything).not.toContain(jiraToken);
      expect(everything).not.toContain(otherJiraToken);
    }
  });
});
