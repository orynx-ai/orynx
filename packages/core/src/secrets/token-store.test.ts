import { describe, expect, it } from 'vitest';
import type { ServerEvent } from '@devhub/contracts';
import { createEventBus } from '../events/event-bus.ts';
import { createMemoryKeychain } from './memory-keychain.ts';
import { createTokenStore, TokenStoreError, type EnvTokens } from './token-store.ts';

// Made-up values that match no real token format, so the secrets gate stays quiet.
const jiraToken = 'jira-token-for-tests-1234';
const otherJiraToken = 'jira-token-from-dotenv-5678';

function setup({
  keychain = createMemoryKeychain(),
  envTokens,
}: { keychain?: ReturnType<typeof createMemoryKeychain>; envTokens?: EnvTokens } = {}) {
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
