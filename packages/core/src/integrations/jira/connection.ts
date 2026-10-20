import type {
  ConnectionCheck,
  InboxProblem,
  IntegrationStatus,
  JiraConnection,
  JiraCredentials,
  JiraProject,
  JiraSavedConnection,
  OpenSprint,
} from '@devhub/contracts';
import type { EventBus } from '../../events/event-bus.ts';
import { TokenStoreError, type TokenSource, type TokenStore } from '../../secrets/token-store.ts';
import type { SettingsStore } from '../../settings/settings-store.ts';
import { createCheckedStatus } from '../checked-status.ts';
import { ConnectionError, type KeychainProblem } from '../connection-error.ts';
import type { JiraCheckRequest, JiraClient, JiraProblem } from './client.ts';
import { describeJiraProblem } from './problems.ts';
import { openSprintOf } from './sprint-map.ts';

/** Why connecting or disconnecting Jira failed. The message is safe to show and never holds a token. */
export class JiraConnectionError extends ConnectionError {
  constructor(code: ConnectionError['code'], message: string) {
    super(code, message);
    this.name = 'JiraConnectionError';
  }
}

/**
 * What the inbox's sync reads Jira with (spec 007), or what stops it before it asks. `connection` names
 * the saved account, so rows from another account are never kept.
 */
export type JiraSyncCredentials =
  | { ok: true; connection: string; site: string; request: JiraCheckRequest }
  | { ok: false; connection: string; site: string; problem: InboxProblem };

/** Jira's settings, its token and whether Jira accepts them (spec 003). */
export interface JiraConnectionService {
  /** The saved site and email. Never reads the keychain. */
  read(): Promise<JiraConnection>;
  /** Checks the credentials with Jira, then saves them. On any failure nothing changes. */
  connect(credentials: JiraCredentials): Promise<JiraConnection>;
  /** Removes the keychain token, the site and the email. */
  disconnect(): Promise<void>;
  /**
   * The projects the saved connection can see, for Settings › Repositories (spec 005). Asks Jira each
   * time; a failure is a {@link JiraConnectionError} in spec 003's words.
   */
  projects(): Promise<JiraProject[]>;
  /** A project's open sprints for Tickets' Sprint menu (spec 020), asked of Jira now; problems as `projects`. */
  openSprints(projectKey: string): Promise<OpenSprint[]>;
  /**
   * Jira's line in GET /api/status. Reads the keychain only once a site and email are saved, and
   * asks Jira at most once every 2 minutes.
   */
  status(): Promise<IntegrationStatus>;
  /**
   * Test connection and Reconnect (spec 030): asks Jira now, even within the 2 minutes, and says how long it
   * took. Refused with bad_request when Jira isn't connected.
   */
  checkNow(): Promise<ConnectionCheck>;
  /** The saved credentials for the inbox's sync, or null when Jira isn't connected. Doesn't ask Jira. */
  credentials(): Promise<JiraSyncCredentials | null>;
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

const notConnected: IntegrationStatus = { state: 'not_connected', detail: null };
const missingToken = 'The saved API token is missing from your keychain. Connect again.';

/** Spec 003 Q5(d): the row line for a working connection, by where the token came from. */
function connectedVia(source: TokenSource, site: string): IntegrationStatus {
  return {
    state: 'connected',
    detail: source === 'env' ? `API token from .env for ${site}` : `Personal API token for ${site}`,
  };
}

/** A check's answer, and the inbox's rows, belong to one site and email. */
export function jiraAccount(saved: JiraSavedConnection): string {
  return `${saved.site} ${saved.email}`;
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

  async function checkNow(saved: JiraSavedConnection): Promise<IntegrationStatus> {
    let stored;
    try {
      stored = await tokens.read('jira');
    } catch (error) {
      if (!(error instanceof TokenStoreError)) throw error;
      reportKeychain(error);
      return { state: 'error', detail: error.message };
    }
    if (stored === null) return { state: 'error', detail: missingToken };
    const check = await jira.check({ ...saved, apiToken: stored.token });
    if (check.ok) return connectedVia(stored.source, saved.site);
    options.onProblem?.(check.problem);
    return { state: 'error', detail: describeJiraProblem(check.problem, saved.site) };
  }

  const checked = createCheckedStatus<JiraSavedConnection>({
    keyOf: jiraAccount,
    check: checkNow,
    events,
    forgotten: notConnected,
    now: options.now ?? Date.now,
    ...(options.onError === undefined ? {} : { onError: options.onError }),
  });

  const now = options.now ?? Date.now;

  /** Jira's line with the account and when Jira was last asked (spec 030). */
  function described(saved: JiraSavedConnection, status: IntegrationStatus): IntegrationStatus {
    const at = checked.checkedAt(saved);
    return { ...status, account: saved.email, ...(at === undefined ? {} : { checkedAt: new Date(at).toISOString() }) };
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
      await settings.update(({ tickets, ...rest }) =>
        // The Tickets choice names the old site's project and sprint, so another site starts on Your sprint (spec 020).
        rest.jira?.site === site && tickets !== undefined
          ? { ...rest, tickets, jira: { site, email } }
          : { ...rest, jira: { site, email } },
      );
      checked.settle({ site, email }, connectedVia(stored?.source ?? 'keychain', site));
      events.publish({ type: 'status.changed' });
      return read();
    },

    async disconnect() {
      await fromTokenStore(() => tokens.remove('jira'));
      // The Tickets choice names this site's projects and sprints, so it goes too (spec 020).
      await settings.update(({ jira: _, tickets: __, ...rest }) => rest);
      checked.forget();
      events.publish({ type: 'status.changed' });
    },

    async projects() {
      const saved = (await settings.read()).jira;
      if (saved === undefined) {
        throw new JiraConnectionError('bad_request', 'Connect Jira in Connections to pick a project.');
      }
      const stored = await fromTokenStore(() => tokens.read('jira'));
      if (stored === null) throw new JiraConnectionError('integration_rejected', missingToken);
      const answer = await jira.projects({ ...saved, apiToken: stored.token });
      if (answer.ok) return answer.projects;
      options.onProblem?.(answer.problem);
      throw new JiraConnectionError(codeFor(answer.problem), describeJiraProblem(answer.problem, saved.site));
    },

    async openSprints(projectKey) {
      const saved = (await settings.read()).jira;
      if (saved === undefined) throw new JiraConnectionError('bad_request', 'Connect Jira in Connections first.');
      const stored = await fromTokenStore(() => tokens.read('jira'));
      if (stored === null) throw new JiraConnectionError('integration_rejected', missingToken);
      const answer = await jira.projectSprints({ ...saved, apiToken: stored.token }, projectKey);
      if (answer.ok) return answer.sprints.flatMap((sprint) => openSprintOf(sprint) ?? []);
      options.onProblem?.(answer.problem);
      throw new JiraConnectionError(codeFor(answer.problem), describeJiraProblem(answer.problem, saved.site));
    },

    async status() {
      try {
        const saved = (await settings.read()).jira;
        if (saved === undefined) return notConnected;
        return described(saved, await checked.get(saved));
      } catch (error) {
        // One integration never breaks GET /api/status (integration-adapter skill).
        options.onError?.(error);
        return { state: 'error', detail: null };
      }
    },

    async checkNow() {
      const saved = (await settings.read()).jira;
      if (saved === undefined) throw new JiraConnectionError('bad_request', 'Connect Jira in Connections first.');
      const started = now();
      const status = await checked.checkNow(saved);
      return { status: described(saved, status), ms: Math.max(0, Math.round(now() - started)) };
    },

    async credentials() {
      const saved = (await settings.read()).jira;
      if (saved === undefined) return null;
      const account = { connection: jiraAccount(saved), site: saved.site };
      let stored;
      try {
        stored = await tokens.read('jira');
      } catch (error) {
        if (!(error instanceof TokenStoreError)) throw error;
        reportKeychain(error);
        return { ok: false, ...account, problem: { kind: 'other', message: error.message } };
      }
      // Connecting again is the fix, as it is for a refused token.
      if (stored === null) return { ok: false, ...account, problem: { kind: 'rejected' } };
      return { ok: true, ...account, request: { ...saved, apiToken: stored.token } };
    },
  };
}
