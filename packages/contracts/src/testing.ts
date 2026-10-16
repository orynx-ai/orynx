/**
 * Test data builders. Each returns a value that passes its schema, so tests on both
 * sides of the wire use the same shapes. These are data, not mocks of our code.
 */
import { SessionListSchema, SessionSummarySchema, type SessionList, type SessionSummary } from './session.ts';
import { StatusSchema, type AgentStatus, type Status, type User } from './status.ts';

export interface StatusOverrides {
  version?: string;
  user?: Partial<User>;
  agent?: Partial<AgentStatus>;
  /** Override one integration and keep the others "not connected". */
  integrations?: Partial<Status['integrations']>;
}

export function makeStatus(overrides: StatusOverrides = {}): Status {
  const notConnected = { state: 'not_connected', detail: null } as const;
  return StatusSchema.parse({
    version: overrides.version ?? '0.0.0-test',
    user: { name: null, ...overrides.user },
    agent: { id: 'claude', connected: false, ...overrides.agent },
    integrations: { jira: notConnected, github: notConnected, slack: notConnected, ...overrides.integrations },
  });
}

export function makeSessionSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return SessionSummarySchema.parse({
    id: 'session-1',
    title: 'Add bulk archive',
    state: 'working',
    source: { kind: 'jira', key: 'PROJ-1423' },
    updatedAt: '2026-10-16T10:00:00.000Z',
    ...overrides,
  });
}

/**
 * A list in the order the server sends it. Each item gets id `session-<n>` and an
 * `updatedAt` one minute older than the one before, unless the override says otherwise.
 */
export function makeSessionList(items: readonly Partial<SessionSummary>[]): SessionList {
  const newest = Date.parse('2026-10-16T10:00:00.000Z');
  return SessionListSchema.parse({
    sessions: items.map((item, index) =>
      makeSessionSummary({
        id: `session-${String(index + 1)}`,
        updatedAt: new Date(newest - index * 60_000).toISOString(),
        ...item,
      }),
    ),
  });
}
