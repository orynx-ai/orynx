import type { Status } from '@devhub/contracts';

export interface StatusService {
  getStatus(): Promise<Status>;
}

export interface StatusServiceOptions {
  version: string;
  /** Who is using DevHub. Asked once, on the first status request. */
  userName: () => Promise<string | null>;
}

/**
 * Reports what the hub is connected to. Until the connection specs land (roadmap 002–004),
 * nothing is connected; each integration spec replaces its line with a real check.
 */
export function createStatusService(options: StatusServiceOptions): StatusService {
  let userName: Promise<string | null> | undefined;
  return {
    async getStatus() {
      userName ??= options.userName();
      return {
        version: options.version,
        user: { name: await userName },
        agent: { id: 'claude', connected: false },
        integrations: {
          jira: { state: 'not_connected', detail: null },
          github: { state: 'not_connected', detail: null },
          slack: { state: 'not_connected', detail: null },
        },
      };
    },
  };
}
