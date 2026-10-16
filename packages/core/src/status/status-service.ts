import type { Status } from '@devhub/contracts';

export interface StatusService {
  getStatus(): Promise<Status>;
}

/**
 * Reports what the hub is connected to. Until the connection specs land (roadmap 002–004),
 * nothing is connected; each integration spec replaces its line with a real check.
 */
export function createStatusService(options: { version: string }): StatusService {
  return {
    getStatus() {
      return Promise.resolve({
        version: options.version,
        user: { name: null },
        agent: { id: 'claude', connected: false },
        integrations: {
          jira: { state: 'not_connected', detail: null },
          github: { state: 'not_connected', detail: null },
          slack: { state: 'not_connected', detail: null },
        },
      });
    },
  };
}
