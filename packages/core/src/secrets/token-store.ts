import type { ApiErrorCode, IntegrationId } from '@devhub/contracts';
import type { EventBus } from '../events/event-bus.ts';
import type { Keychain } from './keychain.ts';

/** Where a token was found: the OS keychain, or the `.env` file the user opted into. */
export type TokenSource = 'keychain' | 'env';

export interface StoredToken {
  token: string;
  source: TokenSource;
}

/** Tokens from `.env`. The host passes them only when DEVHUB_TOKENS_FROM_ENV is on. */
export type EnvTokens = Partial<Record<IntegrationId, string>>;

/** Why a token could not be read or saved. The message never contains the token. */
export class TokenStoreError extends Error {
  readonly code: Extract<ApiErrorCode, 'bad_request' | 'keychain_unavailable'>;

  constructor(code: TokenStoreError['code'], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TokenStoreError';
    this.code = code;
  }
}

/** The tokens DevHub uses to call Jira, GitHub and Slack. Only `@devhub/core` ever holds one. */
export interface TokenStore {
  /** The keychain's token, else the `.env` one, else null. */
  read(tool: IntegrationId): Promise<StoredToken | null>;
  /** Always saves to the keychain; `.env` is never written. */
  save(tool: IntegrationId, token: string): Promise<void>;
  /** Removes the keychain's token. A `.env` token stays until the user edits the file. */
  remove(tool: IntegrationId): Promise<void>;
}

export interface TokenStoreOptions {
  keychain: Keychain;
  events: EventBus;
  envTokens?: EnvTokens;
}

const MAX_TOKEN_LENGTH = 4096;
const validToken = new RegExp(`^\\S{1,${String(MAX_TOKEN_LENGTH)}}$`);

export function createTokenStore({ keychain, events, envTokens = {} }: TokenStoreOptions): TokenStore {
  return {
    async read(tool) {
      const saved = await keychain.get(tool);
      if (saved !== null) return { token: saved, source: 'keychain' };
      const fromEnv = envTokens[tool];
      return fromEnv === undefined ? null : { token: fromEnv, source: 'env' };
    },

    async save(tool, token) {
      if (!validToken.test(token)) {
        throw new TokenStoreError(
          'bad_request',
          `A token has no spaces or line breaks and is at most ${String(MAX_TOKEN_LENGTH)} characters.`,
        );
      }
      await keychain.set(tool, token);
      events.publish({ type: 'status.changed' });
    },

    async remove(tool) {
      await keychain.delete(tool);
      events.publish({ type: 'status.changed' });
    },
  };
}
