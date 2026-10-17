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
}

const notConnected: IntegrationStatus = { state: 'not_connected', detail: null };

/**
 * Reports what the hub is connected to. Jira has a real check (spec 003); GitHub and Slack
 * are not connected until their specs (004, 016) replace their lines.
 */
export function createStatusService(options: StatusServiceOptions): StatusService {
  let userName: Promise<string | null> | undefined;
  return {
    async getStatus() {
      // A failed lookup means "no name", so a broken git never turns /api/status into a 500.
      userName ??= options.userName().catch(() => null);
      const [name, jira] = await Promise.all([userName, options.jira?.() ?? notConnected]);
      return {
        version: options.version,
        user: { name },
        agent: { id: 'claude', connected: false },
        integrations: { jira, github: notConnected, slack: notConnected },
      };
    },
  };
}
