import type {
  GitHubConnection,
  GitHubCredentials,
  GitHubMethod,
  GitHubSavedConnection,
  IntegrationStatus,
} from '@devhub/contracts';
import type { EventBus } from '../../events/event-bus.ts';
import { TokenStoreError, type TokenSource, type TokenStore } from '../../secrets/token-store.ts';
import type { SettingsStore } from '../../settings/settings-store.ts';
import { createCheckedStatus } from '../checked-status.ts';
import { ConnectionError, type KeychainProblem } from '../connection-error.ts';
import type { GitHubCheck, GitHubClient } from './client.ts';
import type { GhCli } from './gh.ts';
import { describeGitHubProblem, type GitHubConnectProblem } from './problems.ts';

/** GitHub's saved way of connecting, and whether GitHub accepts it (spec 004). */
export interface GitHubConnectionService {
  /** The saved way, and whether gh is on the path. Never runs gh or reads the keychain. */
  read(): Promise<GitHubConnection>;
  /** Gets a token the way asked, checks it with GitHub, then saves. On any failure nothing changes. */
  connect(credentials: GitHubCredentials): Promise<GitHubConnection>;
  /** Forgets the way and deletes a saved token. gh stays signed in. */
  disconnect(): Promise<void>;
  /**
   * GitHub's line in GET /api/status. Runs gh or reads the keychain only once a way is saved, and asks
   * GitHub at most once every 2 minutes.
   */
  status(): Promise<IntegrationStatus>;
}

export interface GitHubConnectionOptions {
  settings: SettingsStore;
  tokens: TokenStore;
  github: GitHubClient;
  gh: GhCli;
  events: EventBus;
  /** DEVHUB_TOKENS_FROM_ENV is on and `.env` has a GitHub token. */
  envToken: boolean;
  /** Told about every failed check and keychain failure, for the terminal. Never holds a token. */
  onProblem?: (problem: GitHubConnectProblem | KeychainProblem) => void;
  /** Told about anything unexpected while the status line is worked out, such as an unreadable settings.json. */
  onError?: (error: unknown) => void;
  /** The clock, in milliseconds. */
  now?: () => number;
}

/** A token, how it was found, and the way it belongs to. */
interface Found {
  token: string;
  method: GitHubMethod;
  source: TokenSource | 'gh';
}

const notConnected: IntegrationStatus = { state: 'not_connected', detail: null };

/** Spec 004 Q5 and Q6 (d): the row line for a working connection, naming the account. */
function connectedVia(source: Found['source'], login: string): IntegrationStatus {
  const detail = {
    gh: `Signed in as ${login} with the gh command-line tool`,
    keychain: `Personal access token for ${login}`,
    env: `Token from .env for ${login}`,
  }[source];
  return { state: 'connected', detail };
}

/** Something to wait for, or something to fix; every kind is listed, so a new one must choose. */
function codeFor(problem: GitHubConnectProblem): ConnectionError['code'] {
  switch (problem.kind) {
    case 'rate_limited':
    case 'unreachable':
    case 'timeout':
    case 'github_error':
      return 'integration_unreachable';
    case 'gh_missing':
    case 'gh_signed_out':
    case 'gh_failed':
    case 'gh_timeout':
    case 'rejected':
    case 'no_repo_scope':
      return 'integration_rejected';
  }
}

export function createGitHubConnection(options: GitHubConnectionOptions): GitHubConnectionService {
  const { settings, tokens, github, gh, events, envToken } = options;

  async function read(): Promise<GitHubConnection> {
    return { saved: (await settings.read()).github ?? null, envToken, ghFound: (await gh.find()) !== null };
  }

  /** A keychain failure keeps its code and fixed message, and its reason goes to the terminal. */
  async function fromTokenStore<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (!(error instanceof TokenStoreError)) throw error;
      if (error.code === 'keychain_unavailable') {
        options.onProblem?.({ kind: 'keychain_unavailable', reason: error.reason });
      }
      throw new ConnectionError(error.code, error.message);
    }
  }

  function refuse(problem: GitHubConnectProblem, method: GitHubMethod): never {
    options.onProblem?.(problem);
    throw new ConnectionError(codeFor(problem), describeGitHubProblem(problem, method));
  }

  /** The token to check: from gh, the one typed, the saved one, or the `.env` one. */
  async function tokenFor(credentials: GitHubCredentials): Promise<Found> {
    if (credentials.method === 'gh') {
      const answer = await gh.token();
      if (!answer.ok) refuse(answer.problem, 'gh');
      return { token: answer.token, method: 'gh', source: 'gh' };
    }
    if (credentials.token !== undefined) return { token: credentials.token, method: 'token', source: 'keychain' };
    // Left out: the token DevHub already has, from the keychain or else from .env.
    const stored = await fromTokenStore(() => tokens.read('github'));
    if (stored === null) throw new ConnectionError('bad_request', 'Paste your GitHub token.');
    return { token: stored.token, method: 'token', source: stored.source };
  }

  /**
   * The account GitHub names for a token, or what stops DevHub from using it. Spec 004 Q3: a classic
   * token or gh login must be able to read private repos; a fine-grained token names no scopes.
   */
  function verdict(check: GitHubCheck): { ok: true; login: string } | { ok: false; problem: GitHubConnectProblem } {
    if (!check.ok) return check;
    if (check.scopes !== null && !check.scopes.includes('repo'))
      return { ok: false, problem: { kind: 'no_repo_scope' } };
    return { ok: true, login: check.login };
  }

  async function checkNow(saved: GitHubSavedConnection): Promise<IntegrationStatus> {
    let found: Found;
    if (saved.method === 'gh') {
      const answer = await gh.token();
      if (!answer.ok) {
        options.onProblem?.(answer.problem);
        return { state: 'error', detail: describeGitHubProblem(answer.problem, 'gh') };
      }
      found = { token: answer.token, method: 'gh', source: 'gh' };
    } else {
      let stored;
      try {
        stored = await tokens.read('github');
      } catch (error) {
        if (!(error instanceof TokenStoreError)) throw error;
        options.onProblem?.({ kind: 'keychain_unavailable', reason: error.reason });
        return { state: 'error', detail: error.message };
      }
      if (stored === null) {
        return { state: 'error', detail: 'The saved token is missing from your keychain. Connect again.' };
      }
      found = { token: stored.token, method: 'token', source: stored.source };
    }
    const result = verdict(await github.check(found.token));
    if (!result.ok) {
      options.onProblem?.(result.problem);
      return { state: 'error', detail: describeGitHubProblem(result.problem, found.method) };
    }
    return connectedVia(found.source, result.login);
  }

  // One way at a time is saved, so the way is the key: a gh account switch shows up at the next check.
  const checked = createCheckedStatus<GitHubSavedConnection>({
    keyOf: (saved) => saved.method,
    check: checkNow,
    events,
    now: options.now ?? Date.now,
    ...(options.onError === undefined ? {} : { onError: options.onError }),
  });

  return {
    read,

    async connect(credentials) {
      const found = await tokenFor(credentials);
      const result = verdict(await github.check(found.token));
      if (!result.ok) refuse(result.problem, found.method);

      const before = (await settings.read()).github;
      // The keychain first: it is the step that fails when the keychain is locked, and then nothing has changed.
      if (credentials.method === 'token' && credentials.token !== undefined) {
        const typed = credentials.token;
        await fromTokenStore(() => tokens.save('github', typed));
      }
      // One way at a time: picking gh deletes a token saved for the token way.
      if (credentials.method === 'gh' && before?.method === 'token') {
        await fromTokenStore(() => tokens.remove('github'));
      }
      await settings.update((current) => ({ ...current, github: { method: found.method } }));
      checked.settle({ method: found.method }, connectedVia(found.source, result.login));
      events.publish({ type: 'status.changed' });
      return read();
    },

    async disconnect() {
      // The gh way never saved a token, so it never touches the keychain.
      if ((await settings.read()).github?.method === 'token') await fromTokenStore(() => tokens.remove('github'));
      await settings.update(({ github: _, ...rest }) => rest);
      checked.forget();
      events.publish({ type: 'status.changed' });
    },

    async status() {
      try {
        const saved = (await settings.read()).github;
        if (saved === undefined) return notConnected;
        return await checked.get(saved);
      } catch (error) {
        // One integration never breaks GET /api/status (integration-adapter skill).
        options.onError?.(error);
        return { state: 'error', detail: null };
      }
    },
  };
}
