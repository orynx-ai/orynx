import type { ApiErrorCode, JiraConnection, JiraCredentials } from '@devhub/contracts';
import type { EventBus } from '../../events/event-bus.ts';
import { TokenStoreError, type TokenStore } from '../../secrets/token-store.ts';
import type { SettingsStore } from '../../settings/settings-store.ts';
import type { JiraClient, JiraProblem } from './client.ts';
import { describeJiraProblem } from './problems.ts';

/** Why connecting or disconnecting failed. The message is safe to show and never holds a token. */
export class JiraConnectionError extends Error {
  readonly code: Extract<
    ApiErrorCode,
    'bad_request' | 'integration_rejected' | 'integration_unreachable' | 'keychain_unavailable'
  >;

  constructor(code: JiraConnectionError['code'], message: string) {
    super(message);
    this.name = 'JiraConnectionError';
    this.code = code;
  }
}

/** Jira's settings, its token and whether Jira accepts them (spec 003). */
export interface JiraConnectionService {
  /** The saved site and email. Never reads the keychain. */
  read(): Promise<JiraConnection>;
  /** Checks the credentials with Jira, then saves them. On any failure nothing changes. */
  connect(credentials: JiraCredentials): Promise<JiraConnection>;
  /** Removes the keychain token, the site and the email. */
  disconnect(): Promise<void>;
}

export interface JiraConnectionOptions {
  settings: SettingsStore;
  tokens: TokenStore;
  jira: JiraClient;
  events: EventBus;
  /** DEVHUB_TOKENS_FROM_ENV is on and `.env` has a Jira token. */
  envToken: boolean;
  /** Told about every failed check, for the terminal. A problem never holds a token. */
  onProblem?: (problem: JiraProblem) => void;
}

/** A keychain failure keeps its code and fixed message; anything else is not ours to explain. */
async function fromTokenStore<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof TokenStoreError) throw new JiraConnectionError(error.code, error.message);
    throw error;
  }
}

function codeFor(problem: JiraProblem): JiraConnectionError['code'] {
  return problem.kind === 'rejected' || problem.kind === 'sign_in_needed'
    ? 'integration_rejected'
    : 'integration_unreachable';
}

export function createJiraConnection(options: JiraConnectionOptions): JiraConnectionService {
  const { settings, tokens, jira, events, envToken } = options;

  async function read(): Promise<JiraConnection> {
    return { saved: (await settings.read()).jira ?? null, envToken };
  }

  return {
    read,

    async connect({ site, email, apiToken }) {
      // Left out: the token DevHub already has, from the keychain or else from .env.
      const token = apiToken ?? (await fromTokenStore(() => tokens.read('jira')))?.token;
      if (token === undefined) throw new JiraConnectionError('bad_request', 'Paste your Jira API token.');

      const check = await jira.check({ site, email, apiToken: token });
      if (!check.ok) {
        options.onProblem?.(check.problem);
        throw new JiraConnectionError(codeFor(check.problem), describeJiraProblem(check.problem, site));
      }

      // The token first: it is the step that fails when the keychain is locked, and then nothing has changed.
      if (apiToken !== undefined) await fromTokenStore(() => tokens.save('jira', apiToken));
      await settings.update((current) => ({ ...current, jira: { site, email } }));
      events.publish({ type: 'status.changed' });
      return read();
    },

    async disconnect() {
      await fromTokenStore(() => tokens.remove('jira'));
      await settings.update(({ jira: _, ...rest }) => rest);
      events.publish({ type: 'status.changed' });
    },
  };
}
