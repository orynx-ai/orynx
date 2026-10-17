import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../events/event-bus.ts';
import { createOsKeychain, keychainService } from './os-keychain.ts';
import { createTokenStore } from './token-store.ts';

// The OS keychain is an outside service, so the library that talks to it is faked here.
// `pnpm test:keychain` runs the same adapter against the real keychain.
const keyring = vi.hoisted(() => ({
  items: new Map<string, string>(),
  locked: false,
}));

vi.mock('@napi-rs/keyring', () => {
  const refuse = () => (keyring.locked ? Promise.reject(new Error('User interaction is not allowed.')) : undefined);
  return {
    AsyncEntry: class {
      readonly key: string;
      constructor(service: string, account: string) {
        this.key = `${service}/${account}`;
      }
      getPassword() {
        return refuse() ?? Promise.resolve(keyring.items.get(this.key) ?? null);
      }
      setPassword(password: string) {
        return refuse() ?? Promise.resolve(void keyring.items.set(this.key, password));
      }
      deletePassword() {
        return refuse() ?? Promise.resolve(keyring.items.delete(this.key));
      }
    },
  };
});

const token = 'jira-token-for-tests-1234';

beforeEach(() => {
  keyring.items.clear();
  keyring.locked = false;
});

describe('OS keychain', () => {
  it('AC-1: saves a token under the service "DevHub" with the tool as the account', async () => {
    const keychain = createOsKeychain();

    await keychain.set('jira', token);

    expect(keychainService).toBe('DevHub');
    expect([...keyring.items]).toEqual([['DevHub/jira', token]]);
    expect(await keychain.get('jira')).toBe(token);
  });

  it('reads null when there is no item, and deletes whether or not one is there', async () => {
    const keychain = createOsKeychain('DevHub test');
    await keychain.set('github', token);

    await keychain.delete('github');

    expect(await keychain.get('github')).toBeNull();
    await expect(keychain.delete('github')).resolves.toBeUndefined();
  });

  it('AC-6: a locked keychain reaches the token store as keychain_unavailable', async () => {
    keyring.locked = true;
    const store = createTokenStore({ keychain: createOsKeychain(), events: createEventBus() });

    await expect(store.read('jira')).rejects.toMatchObject({ code: 'keychain_unavailable' });
    await expect(store.save('jira', token)).rejects.toMatchObject({ code: 'keychain_unavailable' });
  });
});
