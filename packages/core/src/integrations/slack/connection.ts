import type {
  ConnectionCheck,
  InboxProblem,
  IntegrationStatus,
  SlackConnection,
  SlackSavedConnection,
} from '@devhub/contracts';
import type { EventBus } from '../../events/event-bus.ts';
import { TokenStoreError, type TokenSource, type TokenStore } from '../../secrets/token-store.ts';
import type { SettingsStore } from '../../settings/settings-store.ts';
import { createCheckedStatus } from '../checked-status.ts';
import { ConnectionError, type KeychainProblem } from '../connection-error.ts';
import type { SlackClient, SlackProblem } from './client.ts';
import { describeSlackProblem } from './problems.ts';

/**
 * What the inbox's sync reads Slack with (spec 016), or what stops it before it asks. `connection` names the saved
 * account, so rows from another workspace or person are never kept.
 */
export type SlackSyncCredentials =
  | { ok: true; connection: string; token: string; saved: SlackSavedConnection }
  | { ok: false; connection: string; problem: InboxProblem };

/** Slack's token, who it belongs to, and whether Slack accepts it (spec 016, A). */
export interface SlackConnectionService {
  /** Who the saved token belongs to. Never reads the keychain. */
  read(): Promise<SlackConnection>;
  /** Checks the token with Slack, then saves it. On any failure nothing changes. */
  connect(request: { token?: string | undefined }): Promise<SlackConnection>;
  /** Removes the keychain token and the saved connection. */
  disconnect(): Promise<void>;
  /** Slack's line in GET /api/status: asks Slack at most once every 2 minutes. */
  status(): Promise<IntegrationStatus>;
  /** Test connection and Reconnect (spec 030): asks Slack now. Refused with bad_request when Slack isn't connected. */
  checkNow(): Promise<ConnectionCheck>;
  /** The saved token for the inbox's sync, or null when Slack isn't connected. Doesn't ask Slack. */
  credentials(): Promise<SlackSyncCredentials | null>;
  /**
   * Checks a bot token with Slack, then saves it (spec 057, AC-14): a bot's, with its scopes, in your workspace. On any
   * failure nothing changes.
   */
  connectBot(token: string): Promise<SlackConnection>;
  /** Removes the bot token. */
  disconnectBot(): Promise<void>;
  /** The bot's token and whom it DMs, or null without both. Doesn't ask Slack. */
  botCredentials(): Promise<{ token: string; userId: string } | null>;
}

export interface SlackConnectionOptions {
  settings: SettingsStore;
  tokens: TokenStore;
  slack: SlackClient;
  events: EventBus;
  /** DEVHUB_TOKENS_FROM_ENV is on and `.env` has a Slack token. */
  envToken: boolean;
  /** Told about every failed check and keychain failure, for the terminal. Never holds a token. */
  onProblem?: (problem: SlackProblem | KeychainProblem) => void;
  onError?: (error: unknown) => void;
  now?: () => number;
}

const notConnected: IntegrationStatus = { state: 'not_connected', detail: null };
const missingToken = 'The saved Slack token is missing from your keychain. Connect again.';
const botRefused = "That token didn't work with Slack.";

/** A check's answer, and the inbox's rows, belong to one workspace and person. */
export function slackAccount(saved: SlackSavedConnection): string {
  return `${saved.url} ${saved.userId}`;
}

/** The row line for a working connection (spec 016, AC-2): "Neha K. in Acme". */
function connectedVia(source: TokenSource, saved: SlackSavedConnection): IntegrationStatus {
  const who = `${saved.name} in ${saved.workspace}`;
  return { state: 'connected', detail: source === 'env' ? `${who}, token from .env` : who };
}

function codeFor(problem: SlackProblem): ConnectionError['code'] {
  return problem.kind === 'rejected' || problem.kind === 'missing_scopes'
    ? 'integration_rejected'
    : 'integration_unreachable';
}

export function createSlackConnection(options: SlackConnectionOptions): SlackConnectionService {
  const { settings, tokens, slack, events, envToken } = options;
  const now = options.now ?? Date.now;

  async function read(): Promise<SlackConnection> {
    const { slack: saved, slackBot } = await settings.read();
    return { saved: saved ?? null, envToken, bot: saved !== undefined && slackBot?.url === saved.url };
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
      throw new ConnectionError(error.code, error.message);
    }
  }

  async function check(saved: SlackSavedConnection): Promise<IntegrationStatus> {
    let stored;
    try {
      stored = await tokens.read('slack');
    } catch (error) {
      if (!(error instanceof TokenStoreError)) throw error;
      reportKeychain(error);
      return { state: 'error', detail: error.message };
    }
    if (stored === null) return { state: 'error', detail: missingToken };
    const answer = await slack.check(stored.token);
    if (answer.ok) return connectedVia(stored.source, saved);
    options.onProblem?.(answer.problem);
    return { state: 'error', detail: describeSlackProblem(answer.problem) };
  }

  const checked = createCheckedStatus<SlackSavedConnection>({
    keyOf: slackAccount,
    check,
    events,
    forgotten: notConnected,
    now,
    ...(options.onError === undefined ? {} : { onError: options.onError }),
  });

  /** Slack's line with who Orynx reads as and when Slack was last asked (spec 030). */
  function described(saved: SlackSavedConnection, status: IntegrationStatus): IntegrationStatus {
    const at = checked.checkedAt(saved);
    return { ...status, account: saved.name, ...(at === undefined ? {} : { checkedAt: new Date(at).toISOString() }) };
  }

  return {
    read,

    async connect({ token: typed }) {
      // Left out: the token Orynx already has, from the keychain or else from .env.
      const stored = typed === undefined ? await fromTokenStore(() => tokens.read('slack')) : null;
      const token = typed ?? stored?.token;
      if (token === undefined) throw new ConnectionError('bad_request', 'Paste your Slack token.');

      const answer = await slack.check(token);
      if (!answer.ok) {
        options.onProblem?.(answer.problem);
        throw new ConnectionError(codeFor(answer.problem), describeSlackProblem(answer.problem));
      }

      const saved: SlackSavedConnection = {
        workspace: answer.workspace,
        url: answer.url,
        userId: answer.userId,
        name: answer.name,
      };
      // The token first: it is the step that fails when the keychain is locked, and then nothing has changed.
      if (typed !== undefined) await fromTokenStore(() => tokens.save('slack', typed));
      await settings.update((current) => ({ ...current, slack: saved }));
      checked.settle(saved, connectedVia(stored?.source ?? 'keychain', saved));
      events.publish({ type: 'status.changed' });
      return read();
    },

    async disconnect() {
      await fromTokenStore(() => tokens.remove('slack'));
      await fromTokenStore(() => tokens.remove('slack_bot'));
      await settings.update(({ slack: _, slackBot: __, ...rest }) => rest);
      checked.forget();
      events.publish({ type: 'status.changed' });
    },

    async status() {
      try {
        const saved = (await settings.read()).slack;
        if (saved === undefined) return notConnected;
        return described(saved, await checked.get(saved));
      } catch (error) {
        // One integration never breaks GET /api/status (integration-adapter skill).
        options.onError?.(error);
        return { state: 'error', detail: null };
      }
    },

    async checkNow() {
      const saved = (await settings.read()).slack;
      if (saved === undefined) throw new ConnectionError('bad_request', 'Connect Slack in Connections first.');
      const started = now();
      const status = await checked.checkNow(saved);
      return { status: described(saved, status), ms: Math.max(0, Math.round(now() - started)) };
    },

    async connectBot(token) {
      const saved = (await settings.read()).slack;
      if (saved === undefined) throw new ConnectionError('bad_request', 'Connect Slack in Connections first.');
      const answer = await slack.checkBot(token);
      if (!answer.ok) options.onProblem?.(answer.problem);
      const refused = answer.ok ? answer.url !== saved.url : codeFor(answer.problem) === 'integration_rejected';
      if (refused) throw new ConnectionError('integration_rejected', botRefused);
      if (!answer.ok) throw new ConnectionError('integration_unreachable', describeSlackProblem(answer.problem));
      // The token first, as for yours: a locked keychain then changes nothing.
      await fromTokenStore(() => tokens.save('slack_bot', token));
      await settings.update((current) => ({ ...current, slackBot: { url: answer.url } }));
      events.publish({ type: 'status.changed' });
      return read();
    },

    async disconnectBot() {
      await fromTokenStore(() => tokens.remove('slack_bot'));
      await settings.update(({ slackBot: _, ...rest }) => rest);
      events.publish({ type: 'status.changed' });
    },

    async botCredentials() {
      const connection = await read();
      if (!connection.bot || connection.saved === null) return null;
      const stored = await fromTokenStore(() => tokens.read('slack_bot'));
      return stored === null ? null : { token: stored.token, userId: connection.saved.userId };
    },

    async credentials() {
      const saved = (await settings.read()).slack;
      if (saved === undefined) return null;
      const connection = slackAccount(saved);
      let stored;
      try {
        stored = await tokens.read('slack');
      } catch (error) {
        if (!(error instanceof TokenStoreError)) throw error;
        reportKeychain(error);
        return { ok: false, connection, problem: { kind: 'other', message: error.message } };
      }
      // Connecting again is the fix, as it is for a refused token.
      if (stored === null) return { ok: false, connection, problem: { kind: 'rejected' } };
      return { ok: true, connection, token: stored.token, saved };
    },
  };
}
