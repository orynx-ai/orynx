import type { IntegrationId } from '@devhub/contracts';

/**
 * Where tokens are kept: the OS keychain in the app (`createOsKeychain`), memory in tests
 * (`createMemoryKeychain`). One token per tool; the tool id is the keychain account.
 */
export interface Keychain {
  /** The saved token, or null when there is none. */
  get(account: IntegrationId): Promise<string | null>;
  set(account: IntegrationId, token: string): Promise<void>;
  /** Resolves whether or not a token was there. */
  delete(account: IntegrationId): Promise<void>;
}
