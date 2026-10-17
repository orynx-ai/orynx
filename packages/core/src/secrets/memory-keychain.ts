import type { IntegrationId } from '@devhub/contracts';
import type { Keychain } from './keychain.ts';

/**
 * A keychain that lives only in memory. Tests use it in place of the OS keychain (an outside
 * service), and `createServer` falls back to it when the host passes no keychain.
 */
export function createMemoryKeychain(initial: Partial<Record<IntegrationId, string>> = {}): Keychain {
  const tokens = new Map<IntegrationId, string>(Object.entries(initial) as [IntegrationId, string][]);
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
