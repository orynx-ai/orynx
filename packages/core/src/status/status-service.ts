import type { IntegrationStatus, Status } from '@devhub/contracts';

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
}

const notConnected: IntegrationStatus = { state: 'not_connected', detail: null };

/**
 * Reports what the hub is connected to. Jira (spec 003) and GitHub (spec 004) have real checks, which
 * run side by side; Slack is not connected until spec 016 replaces its line.
 */
export function createStatusService(options: StatusServiceOptions): StatusService {
  let userName: Promise<string | null> | undefined;
  return {
    async getStatus() {
      // A failed lookup means "no name", so a broken git never turns /api/status into a 500.
      userName ??= options.userName().catch(() => null);
      const [name, jira, github] = await Promise.all([
        userName,
        options.jira?.() ?? notConnected,
        options.github?.() ?? notConnected,
      ]);
      return {
        version: options.version,
        user: { name },
        agent: { id: 'claude', connected: false },
        integrations: { jira, github, slack: notConnected },
      };
    },
  };
}
