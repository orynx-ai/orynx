import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { EventBus } from '../events/event-bus.ts';
import type { Keychain } from '../secrets/keychain.ts';
import { currentProgram, mcpConfig, removeBridges, writeBridge, type BridgeProgram } from './bridge.ts';

/**
 * Whether agents outside Orynx may use its tickets (spec 037, Q14): Claude Code in a terminal, Cursor, Codex or any
 * MCP client, through Orynx's MCP server. The door is open while its token is in the keychain, under `agents`, and
 * never the page's session token. Off by default. Turning it off deletes the token, so every config copied before
 * stops working; turning it on again makes a new one (AC-42).
 */
export interface AgentAccess {
  enabled(): Promise<boolean>;
  set(enabled: boolean): Promise<void>;
  /** Whether `given` is the token, compared in constant time; false while the door is shut or can't be read. */
  accepts(given: string | undefined): Promise<boolean>;
  /** The token, for the bridge that Copy MCP config writes; null while the door is shut. */
  token(): Promise<string | null>;
  /** Writes the bridge for the token and answers the MCP config that runs it (AC-40); null while the door is shut. */
  config(): Promise<string | null>;
}

export interface AgentAccessOptions {
  keychain: Keychain;
  events: EventBus;
  /** DEVHUB_HOME, where the bridges go and whose `runtime.json` they read. */
  devhubHome: string;
  /** What runs a bridge; the program running Orynx by default. */
  program?: BridgeProgram;
}

export function createAgentAccess({
  keychain,
  events,
  devhubHome,
  program = currentProgram(),
}: AgentAccessOptions): AgentAccess {
  // The keychain is read once, then kept: every MCP request checks the token.
  let held: Promise<string | null> | null = null;

  function current(): Promise<string | null> {
    held ??= keychain.get('agents').catch((error: unknown) => {
      held = null;
      throw error;
    });
    return held;
  }

  return {
    async enabled() {
      return (await current()) !== null;
    },

    async set(enabled) {
      if (enabled) {
        // A new token every time it's turned on, so a config copied before it was turned off stays dead.
        const token = randomBytes(32).toString('base64url');
        await keychain.set('agents', token);
        held = Promise.resolve(token);
      } else {
        await keychain.delete('agents');
        held = Promise.resolve(null);
        await removeBridges(devhubHome);
      }
      events.publish({ type: 'settings.changed' });
    },

    async accepts(given) {
      if (given === undefined || given === '') return false;
      const token = await current().catch(() => null);
      if (token === null) return false;
      const expected = Buffer.from(token);
      const offered = Buffer.from(given);
      return offered.length === expected.length && timingSafeEqual(offered, expected);
    },

    token: () => current(),

    async config() {
      const token = await current();
      return token === null ? null : mcpConfig(await writeBridge(devhubHome, token), program);
    },
  };
}
