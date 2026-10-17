import type {
  ApiErrorCode,
  IntegrationStatus,
  JiraConnection,
  JiraCredentials,
  JiraSavedConnection,
} from '@devhub/contracts';
import type { EventBus } from '../../events/event-bus.ts';
import { TokenStoreError, type TokenSource, type TokenStore } from '../../secrets/token-store.ts';
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
  /**
   * Jira's line in GET /api/status. Reads the keychain only once a site and email are saved, and
   * asks Jira at most once every 2 minutes.
   */
  status(): Promise<IntegrationStatus>;
}

export interface JiraConnectionOptions {
  settings: SettingsStore;
  tokens: TokenStore;
  jira: JiraClient;
  events: EventBus;
  /** DEVHUB_TOKENS_FROM_ENV is on and `.env` has a Jira token. */
  envToken: boolean;
  /** Told about every failed check and keychain failure, for the terminal. Never holds a token. */
  onProblem?: (problem: JiraProblem | KeychainProblem) => void;
  /** Told about anything unexpected while the status line is worked out, such as an unreadable settings.json. */
  onError?: (error: unknown) => void;
  /** The clock, in milliseconds. */
  now?: () => number;
}

/** The keychain couldn't be reached. `reason` is its error's name and code, safe to log (spec 002). */
export interface KeychainProblem {
  kind: 'keychain_unavailable';
  reason: string | undefined;
}

/** How long a check's answer stands before status asks Jira again. */
const recheckAfterMs = 2 * 60_000;

const notConnected: IntegrationStatus = { state: 'not_connected', detail: null };

/** Spec 003 Q5(d): the row line for a working connection, by where the token came from. */
function connectedVia(source: TokenSource, site: string): IntegrationStatus {
  return {
    state: 'connected',
    detail: source === 'env' ? `API token from .env for ${site}` : `Personal API token for ${site}`,
  };
}

/** A check's answer belongs to one site and email. */
function keyOf(saved: JiraSavedConnection): string {
  return `${saved.site} ${saved.email}`;
}

function sameStatus(a: IntegrationStatus, b: IntegrationStatus): boolean {
  return a.state === b.state && a.detail === b.detail;
}

function codeFor(problem: JiraProblem): JiraConnectionError['code'] {
  return problem.kind === 'rejected' || problem.kind === 'sign_in_needed'
    ? 'integration_rejected'
    : 'integration_unreachable';
}

export function createJiraConnection(options: JiraConnectionOptions): JiraConnectionService {
  const { settings, tokens, jira, events, envToken } = options;
  const now = options.now ?? Date.now;

  /** The last answer, for the saved site and email it was for. */
  let last: { key: string; at: number; status: IntegrationStatus } | undefined;
  let running: { key: string; answer: Promise<IntegrationStatus> } | undefined;
  /** Goes up on every Connect and Disconnect, so a check that started before one can't overwrite it. */
  let generation = 0;

  async function read(): Promise<JiraConnection> {
    return { saved: (await settings.read()).jira ?? null, envToken };
  }

  function reportKeychain(error: TokenStoreError): void {
    options.onProblem?.({ kind: 'keychain_unavailable', reason: error.reason });
  }

  /** A keychain failure keeps its code and fixed message, and its reason goes to the terminal. */
  async function fromTokenStore<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (!(error instanceof TokenStoreError)) throw error;
      if (error.code === 'keychain_unavailable') reportKeychain(error);
      throw new JiraConnectionError(error.code, error.message);
    }
  }

  function remember(key: string, status: IntegrationStatus): void {
    last = { key, at: now(), status };
  }

  async function checkNow(saved: JiraSavedConnection): Promise<IntegrationStatus> {
    let stored;
    try {
      stored = await tokens.read('jira');
    } catch (error) {
      if (!(error instanceof TokenStoreError)) throw error;
      reportKeychain(error);
      return { state: 'error', detail: error.message };
    }
    if (stored === null) {
      return { state: 'error', detail: 'The saved API token is missing from your keychain. Connect again.' };
    }
    const check = await jira.check({ ...saved, apiToken: stored.token });
    if (check.ok) return connectedVia(stored.source, saved.site);
    options.onProblem?.(check.problem);
    return { state: 'error', detail: describeJiraProblem(check.problem, saved.site) };
  }

  /** One check per site and email at a time; everyone asking meanwhile shares it. */
  function startCheck(saved: JiraSavedConnection, key: string): Promise<IntegrationStatus> {
    if (running?.key === key) return running.answer;
    const startedIn = generation;
    const answer = checkNow(saved)
      .then((status) => {
        // Connect or Disconnect came first: their answer stands, for everyone still waiting too.
        if (generation !== startedIn) return last?.status ?? notConnected;
        const changed = last?.key === key && !sameStatus(last.status, status);
        remember(key, status);
        if (changed) events.publish({ type: 'status.changed' });
        return status;
      })
      .finally(() => {
        if (running?.answer === answer) running = undefined;
      });
    running = { key, answer };
    return answer;
  }

  return {
    read,

    async connect({ site, email, apiToken }) {
      // Left out: the token DevHub already has, from the keychain or else from .env.
      const stored = apiToken === undefined ? await fromTokenStore(() => tokens.read('jira')) : null;
      const token = apiToken ?? stored?.token;
      if (token === undefined) throw new JiraConnectionError('bad_request', 'Paste your Jira API token.');

      const check = await jira.check({ site, email, apiToken: token });
      if (!check.ok) {
        options.onProblem?.(check.problem);
        throw new JiraConnectionError(codeFor(check.problem), describeJiraProblem(check.problem, site));
      }

      // The token first: it is the step that fails when the keychain is locked, and then nothing has changed.
      if (apiToken !== undefined) await fromTokenStore(() => tokens.save('jira', apiToken));
      await settings.update((current) => ({ ...current, jira: { site, email } }));
      generation += 1;
      remember(keyOf({ site, email }), connectedVia(stored?.source ?? 'keychain', site));
      events.publish({ type: 'status.changed' });
      return read();
    },

    async disconnect() {
      await fromTokenStore(() => tokens.remove('jira'));
      await settings.update(({ jira: _, ...rest }) => rest);
      generation += 1;
      last = undefined;
      events.publish({ type: 'status.changed' });
    },

    async status() {
      try {
        const saved = (await settings.read()).jira;
        if (saved === undefined) return notConnected;
        const key = keyOf(saved);
        if (last?.key !== key) return await startCheck(saved, key);
        if (now() - last.at >= recheckAfterMs) {
          // Answer at once with what is known; a change arrives as status.changed.
          startCheck(saved, key).catch((error: unknown) => options.onError?.(error));
        }
        return last.status;
      } catch (error) {
        // One integration never breaks GET /api/status (integration-adapter skill).
        options.onError?.(error);
        return { state: 'error', detail: null };
      }
    },
  };
}
