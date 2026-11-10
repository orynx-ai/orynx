import type { ClaudeLimit, IntegrationStatus, Status } from '@devhub/contracts';

export interface StatusService {
  getStatus(): Promise<Status>;
}

export interface StatusServiceOptions {
  version: string;
  /** Who is using DevHub. Asked once, on the first status request. */
  userName: () => Promise<string | null>;
  /** Jira's line (spec 003). Not connected when left out. */
  jira?: () => Promise<IntegrationStatus>;
  /** GitHub's line (spec 004). Not connected when left out. */
  github?: () => Promise<IntegrationStatus>;
  /** Slack's line (spec 016). Not connected when left out. */
  slack?: () => Promise<IntegrationStatus>;
  /** Discord's line (spec 016). Not connected when left out. */
  discord?: () => Promise<IntegrationStatus>;
  /** Whether Claude Code is signed in (spec 010). Not connected when left out. */
  claude?: () => Promise<boolean>;
  /** Whether Codex is signed in (spec 052). Not connected when left out. */
  codex?: () => Promise<boolean>;
  /** The hub shows Claude's questions in the desktop app itself (spec 057, AC-15). */
  desktopReplies?: boolean;
  /** How close you are to Claude's limit, as a session last heard (spec 057, AC-45); none when left out. */
  claudeLimit?: () => ClaudeLimit | null;
}

const notConnected: IntegrationStatus = { state: 'not_connected', detail: null };

/**
 * Reports what the hub is connected to. Jira (spec 003), GitHub (spec 004) and Claude (spec 010) have
 * real checks, which run side by side, as do Slack and Discord (spec 016).
 */
export function createStatusService(options: StatusServiceOptions): StatusService {
  let userName: Promise<string | null> | undefined;
  return {
    async getStatus() {
      // A failed lookup means "no name", so a broken git never turns /api/status into a 500.
      userName ??= options.userName().catch(() => null);
      const [name, jira, github, slack, discord, claude, codex] = await Promise.all([
        userName,
        options.jira?.() ?? notConnected,
        options.github?.() ?? notConnected,
        options.slack?.() ?? notConnected,
        options.discord?.() ?? notConnected,
        options.claude?.() ?? false,
        options.codex?.() ?? false,
      ]);
      return {
        version: options.version,
        user: { name },
        agents: { claude: { connected: claude }, codex: { connected: codex } },
        integrations: { jira, github, slack, discord },
        desktopReplies: options.desktopReplies ?? false,
        claudeLimit: options.claudeLimit?.() ?? null,
      };
    },
  };
}
