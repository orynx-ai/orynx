import type {
  ConnectionCheck,
  DiscordConnection,
  DiscordSavedConnection,
  InboxProblem,
  IntegrationStatus,
} from '@devhub/contracts';
import type { EventBus } from '../../events/event-bus.ts';
import { TokenStoreError, type TokenSource, type TokenStore } from '../../secrets/token-store.ts';
import type { SettingsStore } from '../../settings/settings-store.ts';
import { createCheckedStatus } from '../checked-status.ts';
import { ConnectionError, type KeychainProblem } from '../connection-error.ts';
import type { DiscordClient, DiscordProblem } from './client.ts';
import { describeDiscordProblem } from './problems.ts';

/** What the inbox's sync reads Discord with (spec 016), or what stops it before it asks. */
export type DiscordSyncCredentials =
  | { ok: true; connection: string; token: string; saved: DiscordSavedConnection }
  | { ok: false; connection: string; problem: InboxProblem };

/** Discord's bot token, whose mentions it reads, and whether Discord accepts it (spec 016, A). */
export interface DiscordConnectionService {
  read(): Promise<DiscordConnection>;
  /** Checks the bot with Discord, then saves it. On any failure nothing changes. */
  connect(request: { token?: string | undefined; userId?: string | undefined }): Promise<DiscordConnection>;
  disconnect(): Promise<void>;
  /** Discord's line in GET /api/status: asks Discord at most once every 2 minutes. */
  status(): Promise<IntegrationStatus>;
  /** Test connection and Reconnect (spec 030). Refused with bad_request when Discord isn't connected. */
  checkNow(): Promise<ConnectionCheck>;
  /** The saved token for the inbox's sync, or null when Discord isn't connected. Doesn't ask Discord. */
  credentials(): Promise<DiscordSyncCredentials | null>;
}

export interface DiscordConnectionOptions {
  settings: SettingsStore;
  tokens: TokenStore;
  discord: DiscordClient;
  events: EventBus;
  /** DEVHUB_TOKENS_FROM_ENV is on and `.env` has a Discord token. */
  envToken: boolean;
  onProblem?: (problem: DiscordProblem | KeychainProblem) => void;
  onError?: (error: unknown) => void;
  now?: () => number;
}

const notConnected: IntegrationStatus = { state: 'not_connected', detail: null };
const missingToken = 'The saved bot token is missing from your keychain. Connect again.';

/** A check's answer, and the inbox's rows, belong to whose mentions the bot reads. */
export function discordAccount(saved: DiscordSavedConnection): string {
  return `discord ${saved.userId}`;
}

/** The row line (spec 016, AC-6): "Orynx · 2 servers". */
function connectedVia(source: TokenSource, saved: DiscordSavedConnection, servers: number): IntegrationStatus {
  const where = servers === 0 ? 'in no servers yet' : servers === 1 ? '1 server' : `${String(servers)} servers`;
  const line = `${saved.bot} · ${where}`;
  return { state: 'connected', detail: source === 'env' ? `${line}, token from .env` : line };
}

function codeFor(problem: DiscordProblem): ConnectionError['code'] {
  if (problem.kind === 'user_id_needed') return 'user_id_needed';
  return problem.kind === 'rejected' || problem.kind === 'intent_off'
    ? 'integration_rejected'
    : 'integration_unreachable';
}

export function createDiscordConnection(options: DiscordConnectionOptions): DiscordConnectionService {
  const { settings, tokens, discord, events, envToken } = options;
  const now = options.now ?? Date.now;

  async function read(): Promise<DiscordConnection> {
    return { saved: (await settings.read()).discord ?? null, envToken };
  }

  function reportKeychain(error: TokenStoreError): void {
    options.onProblem?.({ kind: 'keychain_unavailable', reason: error.reason });
  }

  async function fromTokenStore<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (!(error instanceof TokenStoreError)) throw error;
      if (error.code === 'keychain_unavailable') reportKeychain(error);
      throw new ConnectionError(error.code, error.message);
    }
  }

  async function check(saved: DiscordSavedConnection): Promise<IntegrationStatus> {
    let stored;
    try {
      stored = await tokens.read('discord');
    } catch (error) {
      if (!(error instanceof TokenStoreError)) throw error;
      reportKeychain(error);
      return { state: 'error', detail: error.message };
    }
    if (stored === null) return { state: 'error', detail: missingToken };
    // Naming you keeps a team's bot readable; for your own bot, it's its owner anyway.
    const answer = await discord.check(stored.token, saved.userId);
    if (answer.ok) return connectedVia(stored.source, saved, answer.servers.length);
    options.onProblem?.(answer.problem);
    return { state: 'error', detail: describeDiscordProblem(answer.problem) };
  }

  const checked = createCheckedStatus<DiscordSavedConnection>({
    keyOf: discordAccount,
    check,
    events,
    forgotten: notConnected,
    now,
    ...(options.onError === undefined ? {} : { onError: options.onError }),
  });

  function described(saved: DiscordSavedConnection, status: IntegrationStatus): IntegrationStatus {
    const at = checked.checkedAt(saved);
    return { ...status, account: saved.bot, ...(at === undefined ? {} : { checkedAt: new Date(at).toISOString() }) };
  }

  return {
    read,

    async connect({ token: typed, userId }) {
      const stored = typed === undefined ? await fromTokenStore(() => tokens.read('discord')) : null;
      const token = typed ?? stored?.token;
      if (token === undefined) throw new ConnectionError('bad_request', "Paste your bot's token.");

      const answer = await discord.check(token, userId);
      if (!answer.ok) {
        options.onProblem?.(answer.problem);
        throw new ConnectionError(codeFor(answer.problem), describeDiscordProblem(answer.problem));
      }

      const saved: DiscordSavedConnection = { bot: answer.bot, userId: answer.userId };
      if (typed !== undefined) await fromTokenStore(() => tokens.save('discord', typed));
      await settings.update((current) => ({ ...current, discord: saved }));
      checked.settle(saved, connectedVia(stored?.source ?? 'keychain', saved, answer.servers.length));
      events.publish({ type: 'status.changed' });
      return read();
    },

    async disconnect() {
      await fromTokenStore(() => tokens.remove('discord'));
      await settings.update(({ discord: _, ...rest }) => rest);
      checked.forget();
      events.publish({ type: 'status.changed' });
    },

    async status() {
      try {
        const saved = (await settings.read()).discord;
        if (saved === undefined) return notConnected;
        return described(saved, await checked.get(saved));
      } catch (error) {
        // One integration never breaks GET /api/status (integration-adapter skill).
        options.onError?.(error);
        return { state: 'error', detail: null };
      }
    },

    async checkNow() {
      const saved = (await settings.read()).discord;
      if (saved === undefined) throw new ConnectionError('bad_request', 'Connect Discord in Connections first.');
      const started = now();
      const status = await checked.checkNow(saved);
      return { status: described(saved, status), ms: Math.max(0, Math.round(now() - started)) };
    },

    async credentials() {
      const saved = (await settings.read()).discord;
      if (saved === undefined) return null;
      const connection = discordAccount(saved);
      let stored;
      try {
        stored = await tokens.read('discord');
      } catch (error) {
        if (!(error instanceof TokenStoreError)) throw error;
        reportKeychain(error);
        return { ok: false, connection, problem: { kind: 'other', message: error.message } };
      }
      if (stored === null) return { ok: false, connection, problem: { kind: 'rejected' } };
      return { ok: true, connection, token: stored.token, saved };
    },
  };
}
