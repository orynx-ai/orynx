import type { Keychain, KeychainAccount } from './keychain.ts';

/**
 * A keychain that lives only in memory. Tests use it in place of the OS keychain (an outside
 * service), and `createServer` falls back to it when the host passes no keychain.
 */
export function createMemoryKeychain(initial: Partial<Record<KeychainAccount, string>> = {}): Keychain {
  const tokens = new Map<KeychainAccount, string>(Object.entries(initial) as [KeychainAccount, string][]);
  return {
    get: (account) => Promise.resolve(tokens.get(account) ?? null),
    set(account, token) {
      tokens.set(account, token);
      return Promise.resolve();
    },
    delete(account) {
      tokens.delete(account);
      return Promise.resolve();
    },
  };
}

/**
 * A keychain that is locked, refuses access or does not exist: every call rejects. `failureMessage`
 * builds the failure's message from the token being saved, so a test can make it echo the token.
 */
export function createUnreachableKeychain(
  failureMessage: (token?: string) => string = () => 'The keychain is locked.',
): Keychain {
  const fail = (token?: string) => Promise.reject(new Error(failureMessage(token)));
  return { get: () => fail(), set: (_account, token) => fail(token), delete: () => fail() };
}
