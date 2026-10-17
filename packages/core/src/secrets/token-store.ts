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
  /** For logs: the keychain error's name and code, such as "Error (ERR_MODULE_NOT_FOUND)", never its message. */
  readonly reason: string | undefined;

  constructor(code: TokenStoreError['code'], message: string, reason?: string) {
    super(message);
    this.name = 'TokenStoreError';
    this.code = code;
    this.reason = reason;
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

/** Spec 002, Q4(d). Spec 003 shows it where a token is saved. */
export const keychainUnavailableMessage =
  "DevHub can't reach your OS keychain. Unlock it, or turn on the .env fallback (see .env.example).";

/**
 * Runs a keychain call, turning any failure into `keychain_unavailable`. Only the keychain error's
 * name and code are kept, never its message or the error itself as `cause`: it could echo what it
 * was given, and an error can end up in a log line or a response.
 */
async function fromKeychain<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw new TokenStoreError('keychain_unavailable', keychainUnavailableMessage, safeReason(error));
  }
}

function safeReason(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  return 'code' in error && typeof error.code === 'string' ? `${error.name} (${error.code})` : error.name;
}

export function createTokenStore({ keychain, events, envTokens = {} }: TokenStoreOptions): TokenStore {
  return {
    async read(tool) {
      const fromEnv = envTokens[tool];
      let saved: string | null;
      try {
        saved = await fromKeychain(() => keychain.get(tool));
      } catch (error) {
        // An unreachable keychain may still hold a token, so only a .env token can stand in for it.
        if (fromEnv === undefined) throw error;
        return { token: fromEnv, source: 'env' };
      }
      if (saved !== null) return { token: saved, source: 'keychain' };
      return fromEnv === undefined ? null : { token: fromEnv, source: 'env' };
    },

    async save(tool, token) {
      if (!validToken.test(token)) {
        throw new TokenStoreError(
          'bad_request',
          `A token has no spaces or line breaks and is at most ${String(MAX_TOKEN_LENGTH)} characters.`,
        );
      }
      await fromKeychain(() => keychain.set(tool, token));
      events.publish({ type: 'status.changed' });
    },

    async remove(tool) {
      await fromKeychain(() => keychain.delete(tool));
      events.publish({ type: 'status.changed' });
    },
  };
}
