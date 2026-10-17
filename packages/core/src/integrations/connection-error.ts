import type { ApiErrorCode } from '@devhub/contracts';

/**
 * Why connecting or disconnecting a tool failed. The message is safe to show and never holds a token;
 * the /api error handler answers with its code (spec 003, reused by 004).
 */
export class ConnectionError extends Error {
  readonly code: Extract<
    ApiErrorCode,
    'bad_request' | 'integration_rejected' | 'integration_unreachable' | 'keychain_unavailable'
  >;

  constructor(code: ConnectionError['code'], message: string) {
    super(message);
    this.name = 'ConnectionError';
    this.code = code;
  }
}

/** The keychain couldn't be reached. `reason` is its error's name and code, safe to log (spec 002). */
export interface KeychainProblem {
  kind: 'keychain_unavailable';
  reason: string | undefined;
}
