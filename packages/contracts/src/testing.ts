/**
 * Test data builders. Each returns a value that passes its schema, so tests on both
 * sides of the wire use the same shapes. These are data, not mocks of our code.
 */
import { ClaudeSignedInSchema, type ClaudeSignedIn } from './claude.ts';
import { GitHubConnectionSchema, type GitHubConnection } from './github.ts';
import { InboxItemSchema, InboxSchema, type Inbox, type InboxItem } from './inbox.ts';
import { JiraConnectionSchema, type JiraConnection } from './jira.ts';
import { defaultPreferences, PreferencesSchema, type InboxRules, type Preferences } from './preferences.ts';
import { RepositorySchema, type Repository } from './repositories.ts';
import {
  SearchIndexSchema,
  SearchPullRequestSchema,
  SearchTicketSchema,
  type SearchIndex,
  type SearchPullRequest,
  type SearchTicket,
} from './search.ts';
import {
  SessionListSchema,
  SessionSchema,
  SessionSummarySchema,
  type Session,
  type SessionList,
  type SessionSummary,
} from './session.ts';
import { StatusSchema, type AgentStatus, type Status, type User } from './status.ts';
import { TicketSchema, TicketsSchema, type Ticket, type Tickets } from './tickets.ts';

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

/** Claude Code signed in with a claude.ai company login, unless the override says otherwise. */
export function makeClaudeSignedIn(overrides: Partial<Omit<ClaudeSignedIn, 'state'>> = {}): ClaudeSignedIn {
  return ClaudeSignedInSchema.parse({
    state: 'signed_in',
    method: 'claude_ai',
    email: 'you@company.com',
    organisation: 'Company',
    ...overrides,
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

/** A session Claude is working on, as GET /api/sessions/:id sends it: started from PROJ-1423 in web-app. */
export function makeSession(overrides: Partial<Session> = {}): Session {
  return SessionSchema.parse({
    ...makeSessionSummary({ id: '0123456789abcdef' }),
    folder: { name: 'web-app', displayPath: '~/code/web-app' },
    branch: 'feat/PROJ-1423',
    step: 'plan',
    activities: [],
    problem: null,
    startedAt: '2026-10-16T09:56:00.000Z',
    endedAt: null,
    discardedAt: null,
    jiraUrl: 'https://your-team.atlassian.net/browse/PROJ-1423',
    sprint: 'Sprint 42',
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
  allowedCommands?: string[];
}

/** Preferences as a fresh DevHub reports them, unless the override says otherwise. */
export function makePreferences(overrides: PreferencesOverrides = {}): Preferences {
  return PreferencesSchema.parse({
    permissionMode: overrides.permissionMode ?? defaultPreferences.permissionMode,
    inboxRules: { ...defaultPreferences.inboxRules, ...overrides.inboxRules },
    allowedCommands: overrides.allowedCommands ?? [],
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

/**
 * One row: the design's GitHub review request "Lazy-load the people directory", unless the override says
 * otherwise.
 */
export function makeInboxItem(overrides: Partial<InboxItem> = {}): InboxItem {
  return InboxItemSchema.parse({
    id: 'github:acme/web-app#2841',
    source: 'github',
    tab: 'pull_requests',
    title: 'Lazy-load the people directory',
    subject: { kind: 'pull_request', repository: 'web-app', number: 2841, author: 'Priya Sharma', mine: false },
    reason: { kind: 'review_requested' },
    waitingSince: '2026-10-15T10:00:00.000Z',
    target: { kind: 'external', url: 'https://github.com/acme/web-app/pull/2841/files' },
    ...overrides,
  });
}

/** The list with no rows, both tools synced at 10:00 on 17 Oct 2026, unless the override says otherwise. */
export function makeInbox(overrides: Partial<Inbox> = {}): Inbox {
  const synced = { state: 'synced', at: '2026-10-17T10:00:00.000Z' } as const;
  return InboxSchema.parse({
    items: [],
    tools: { jira: synced, github: synced },
    syncedAt: '2026-10-17T10:00:00.000Z',
    ...overrides,
  });
}

/**
 * One ticket: the design's "Add bulk archive to the content list", a Story of yours in progress, unless the
 * override says otherwise. The link follows the key.
 */
export function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  const key = overrides.key ?? 'PROJ-1423';
  return TicketSchema.parse({
    key,
    title: 'Add bulk archive to the content list',
    url: `https://your-team.atlassian.net/browse/${key}`,
    status: 'In Progress',
    column: 'in_progress',
    type: 'Story',
    bug: false,
    priority: { name: 'High', level: 'high' },
    dueDate: '2026-10-23',
    assignee: { name: 'Rakesh Dhariwal', mine: true },
    session: null,
    ...overrides,
  });
}

/** Sprint 42 of PROJ, ending on 24 Oct 2026, with no tickets, synced at 10:00 on 17 Oct, unless the override says otherwise. */
export function makeTickets(overrides: Partial<Tickets> = {}): Tickets {
  return TicketsSchema.parse({
    jira: { state: 'synced', at: '2026-10-17T10:00:00.000Z' },
    sprint: { id: 42, name: 'Sprint 42', endsAt: '2026-10-24T17:00:00.000Z', projectKey: 'PROJ' },
    tickets: [],
    truncated: false,
    ...overrides,
  });
}

/** A ticket search finds: the design's PROJ-1423 "Add bulk archive", opening in Jira, unless the override says otherwise. */
export function makeSearchTicket(overrides: Partial<SearchTicket> = {}): SearchTicket {
  return SearchTicketSchema.parse({
    key: 'PROJ-1423',
    title: 'Add bulk archive',
    status: 'In Progress',
    target: { kind: 'external', url: 'https://your-team.atlassian.net/browse/PROJ-1423' },
    ...overrides,
  });
}

/** A pull request search finds: web-app #2841 "Lazy-load the people directory", unless the override says otherwise. */
export function makeSearchPullRequest(overrides: Partial<SearchPullRequest> = {}): SearchPullRequest {
  return SearchPullRequestSchema.parse({
    id: 'acme/web-app#2841',
    repository: 'web-app',
    number: 2841,
    title: 'Lazy-load the people directory',
    author: 'Priya Shah',
    url: 'https://github.com/acme/web-app/pull/2841',
    ...overrides,
  });
}

/** Nothing to find, with both tools synced at 09:00 on 18 Oct 2026, unless the override says otherwise. */
export function makeSearchIndex(overrides: Partial<SearchIndex> = {}): SearchIndex {
  const synced = { state: 'synced', at: '2026-10-18T09:00:00.000Z' } as const;
  return SearchIndexSchema.parse({
    tickets: [],
    pullRequests: [],
    sessions: [],
    tools: { jira: synced, github: synced },
    ...overrides,
  });
}
