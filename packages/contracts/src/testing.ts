/**
 * Test data builders. Each returns a value that passes its schema, so tests on both
 * sides of the wire use the same shapes. These are data, not mocks of our code.
 */
import { GitHubConnectionSchema, type GitHubConnection } from './github.ts';
import { JiraConnectionSchema, type JiraConnection } from './jira.ts';
import { defaultPreferences, PreferencesSchema, type InboxRules, type Preferences } from './preferences.ts';
import { RepositorySchema, type Repository } from './repositories.ts';
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

/** Jira as the server reports it: not connected and no `.env` token, unless the override says otherwise. */
export function makeJiraConnection(overrides: Partial<JiraConnection> = {}): JiraConnection {
  return JiraConnectionSchema.parse({ saved: null, envToken: false, ...overrides });
}

/** GitHub as the server reports it: not connected, no `.env` token and no gh, unless the override says otherwise. */
export function makeGitHubConnection(overrides: Partial<GitHubConnection> = {}): GitHubConnection {
  return GitHubConnectionSchema.parse({ saved: null, envToken: false, ghFound: false, ...overrides });
}

export interface PreferencesOverrides {
  permissionMode?: Preferences['permissionMode'];
  /** Override some rules and keep the others on. */
  inboxRules?: Partial<InboxRules>;
}

/** Preferences as a fresh DevHub reports them, unless the override says otherwise. */
export function makePreferences(overrides: PreferencesOverrides = {}): Preferences {
  return PreferencesSchema.parse({
    permissionMode: overrides.permissionMode ?? defaultPreferences.permissionMode,
    inboxRules: { ...defaultPreferences.inboxRules, ...overrides.inboxRules },
  });
}

/** A folder in Settings › Repositories, under a home folder of /Users/dev, unless the override says otherwise. */
export function makeRepository(overrides: Partial<Repository> = {}): Repository {
  return RepositorySchema.parse({
    id: '0123456789abcdef',
    path: '/Users/dev/code/intranet-web',
    name: 'intranet-web',
    displayPath: '~/code/intranet-web',
    jiraProject: 'PROJ',
    ...overrides,
  });
}
