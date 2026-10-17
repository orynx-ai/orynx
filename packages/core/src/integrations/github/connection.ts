import type { GitHubConnection, GitHubCredentials, GitHubMethod } from '@devhub/contracts';
import type { EventBus } from '../../events/event-bus.ts';
import { TokenStoreError, type TokenSource, type TokenStore } from '../../secrets/token-store.ts';
import type { SettingsStore } from '../../settings/settings-store.ts';
import { ConnectionError, type KeychainProblem } from '../connection-error.ts';
import type { GitHubClient } from './client.ts';
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
}

/** A token, how it was found, and the way it belongs to. */
interface Found {
  token: string;
  method: GitHubMethod;
  source: TokenSource | 'gh';
}

function codeFor(problem: GitHubConnectProblem): ConnectionError['code'] {
  switch (problem.kind) {
    case 'rate_limited':
    case 'unreachable':
    case 'timeout':
    case 'github_error':
      return 'integration_unreachable';
    default:
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

  return {
    read,

    async connect(credentials) {
      const found = await tokenFor(credentials);
      const check = await github.check(found.token);
      if (!check.ok) refuse(check.problem, found.method);
      // Spec 004 Q3: a classic token or gh login must be able to read private repos. A fine-grained
      // token names no scopes, so it can't be checked here.
      if (check.scopes !== null && !check.scopes.includes('repo')) refuse({ kind: 'no_repo_scope' }, found.method);

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
      events.publish({ type: 'status.changed' });
      return read();
    },

    async disconnect() {
      // The gh way never saved a token, so it never touches the keychain.
      if ((await settings.read()).github?.method === 'token') await fromTokenStore(() => tokens.remove('github'));
      await settings.update(({ github: _, ...rest }) => rest);
      events.publish({ type: 'status.changed' });
    },
  };
}
