import type { IntegrationId } from '@devhub/contracts';

/**
 * A keychain account: a tool's id for its token, `slack_bot` for Slack's bot token (spec 057), or `agents` for the token
 * agents outside Orynx use (spec 037).
 */
export type KeychainAccount = IntegrationId | 'slack_bot' | 'agents';

/**
 * Where tokens are kept: the OS keychain in the app (`createOsKeychain`), memory in tests
 * (`createMemoryKeychain`). One token per account.
 */
export interface Keychain {
  /** The saved token, or null when there is none. */
  get(account: KeychainAccount): Promise<string | null>;
  set(account: KeychainAccount, token: string): Promise<void>;
  /** Resolves whether or not a token was there. */
  delete(account: KeychainAccount): Promise<void>;
}
