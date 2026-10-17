import type * as JiraCore from 'jira.js/core';
import { z } from 'zod';

/**
 * The only file in DevHub that talks to Jira (integration-adapter skill). The token goes into the
 * Authorization header and nowhere else: a failure comes back as a {@link JiraProblem}, never as the
 * library's error, so nothing that held the request can travel on into a log or a response.
 */

/** What to check. `site` is a bare host that the contract has already limited to atlassian.net. */
export interface JiraCredentials {
  site: string;
  email: string;
  apiToken: string;
}

export type JiraProblem =
  /** Jira refused the email and token. */
  | { kind: 'rejected' }
  /** The credentials may be right, but Jira wants a sign-in on the web first (a CAPTCHA). */
  | { kind: 'sign_in_needed' }
  /** Nothing at that address answers the way Jira does. */
  | { kind: 'not_found' }
  /** The request never got an answer. `code` is safe to log, such as ENOTFOUND or a certificate error. */
  | { kind: 'unreachable'; code: string | undefined }
  | { kind: 'timeout' }
  /** Jira answered with an error that says nothing about the credentials. */
  | { kind: 'jira_error'; status: number };

export type JiraCheck = { ok: true } | { ok: false; problem: JiraProblem };

export interface JiraClient {
  readonly timeoutMs: number;
  /** Asks Jira who these credentials belong to (`GET /rest/api/3/myself`). */
  check(credentials: JiraCredentials): Promise<JiraCheck>;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface JiraClientOptions {
  /** How long to wait for Jira; 10 seconds by default (spec 003). */
  timeoutMs?: number;
  /** The network. Only a test that needs a failure MSW can't make passes one. */
  fetch?: FetchLike;
}

const MyselfSchema = z.object({ accountId: z.string().min(1) });

// Codes such as "ENOTFOUND" or "UNABLE_TO_GET_ISSUER_CERT_LOCALLY". Anything else is dropped.
const errorCode = /^[A-Z][A-Z0-9_]{0,63}$/;

export function createJiraClient({ timeoutMs = 10_000, fetch }: JiraClientOptions = {}): JiraClient {
  return {
    timeoutMs,
    async check({ site, email, apiToken }) {
      // Loaded on the first call, so starting DevHub never pays for it.
      const sdk = await import('jira.js/core');
      const client = sdk.createClient({
        host: `https://${site}`,
        auth: { type: 'basic', email, apiToken },
        // A page that isn't Jira's answer is an error, and the library writes nothing to the terminal.
        onSchemaMismatch: 'throw',
        ...(fetch ? { fetch } : {}),
      });
      try {
        await client.sendRequest({
          url: '/rest/api/3/myself',
          method: 'GET',
          schema: MyselfSchema,
          signal: AbortSignal.timeout(timeoutMs),
        });
        return { ok: true };
      } catch (error) {
        return { ok: false, problem: problemOf(sdk, error) };
      }
    },
  };
}

function problemOf(sdk: typeof JiraCore, error: unknown): JiraProblem {
  if (error instanceof Error && error.name === 'TimeoutError') return { kind: 'timeout' };
  // jira.js reads X-Seraph-LoginReason: a refusal can arrive as 401, as 200 (answered anonymously),
  // or as 403 when Jira wants the CAPTCHA answered on the web.
  if (sdk.isAuthError(error)) return error.status === 403 ? { kind: 'sign_in_needed' } : { kind: 'rejected' };
  if (sdk.isNotFoundError(error) || sdk.isSchemaMismatchError(error)) return { kind: 'not_found' };
  if (sdk.isApiError(error)) return { kind: 'jira_error', status: error.status };
  const code = sdk.isNetworkError(error) ? error.code : undefined;
  return { kind: 'unreachable', code: code !== undefined && errorCode.test(code) ? code : undefined };
}
