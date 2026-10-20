/**
 * Test data builders. Each returns a value that passes its schema, so tests on both
 * sides of the wire use the same shapes. These are data, not mocks of our code.
 */
import {
  ChangedFileSchema,
  FileDiffSchema,
  SessionChangesSchema,
  type ChangedFile,
  type FileDiff,
  type SessionChanges,
} from './changes.ts';
import { ClaudeSignedInSchema, type ClaudeSignedIn } from './claude.ts';
import { GitHubConnectionSchema, type GitHubConnection } from './github.ts';
import { InboxItemSchema, InboxSchema, type Inbox, type InboxItem } from './inbox.ts';
import { JiraConnectionSchema, type JiraConnection } from './jira.ts';
import {
  NotificationListSchema,
  NotificationSchema,
  type Notification,
  type NotificationList,
} from './notifications.ts';
import {
  defaultPreferences,
  PreferencesSchema,
  type InboxRules,
  type Preferences,
  type PreferencesChange,
} from './preferences.ts';
import {
  DraftedPullRequestSchema,
  DraftedPushSchema,
  type DraftedPullRequest,
  type DraftedPush,
  type PullRequestDraft,
} from './pull-requests.ts';
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
  ComposerStartSchema,
  SessionListSchema,
  SessionApprovalSchema,
  SessionSchema,
  SessionSummarySchema,
  SessionPullRequestSchema,
  SessionTicketSchema,
  type ComposerStart,
  type Session,
  type SessionApproval,
  type SessionList,
  type SessionPullRequest,
  type SessionSummary,
  type SessionTicket,
} from './session.ts';
import { OrynxSkillListSchema, ReadySkillSchema, type OrynxSkillList, type ReadySkill } from './orynx-skills.ts';
import { OrynxTicketSchema, type OrynxTicket } from './orynx-tickets.ts';
import { StatusSchema, type AgentStatus, type Status, type User } from './status.ts';
import {
  SyncActivitySchema,
  SyncChangeSchema,
  SyncRunSchema,
  SyncToolSchema,
  type SyncActivity,
  type SyncChange,
  type SyncRun,
  type SyncTool,
} from './sync-activity.ts';
import {
  OpenSprintSchema,
  TicketDetailSchema,
  TicketSchema,
  TicketsSchema,
  type OpenSprint,
  type Ticket,
  type TicketDetail,
  type Tickets,
} from './tickets.ts';
import { ClaudeCommandListSchema, TerminalSchema, type ClaudeCommandList, type Terminal } from './terminal.ts';

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
    approvals: [],
    ...overrides,
  });
}

/** The composer's start (spec 015): a message for web-app's folder, with no chips. */
export function makeComposerStart(overrides: Partial<ComposerStart> = {}): ComposerStart {
  return ComposerStartSchema.parse({
    message: 'Add a CSV export to the reports page',
    repositoryId: '00000000000000aa',
    context: [],
    ...overrides,
  });
}

/**
 * The ticket on the Session screen's Ticket tab (spec 013): PROJ-1423 as `session.html` draws it, In progress
 * and due on Friday 16 Oct 2026.
 */
export function makeSessionTicket(overrides: Partial<SessionTicket> = {}): SessionTicket {
  return SessionTicketSchema.parse({
    type: 'Story',
    description:
      'Content managers need to archive many items at once from the content list instead of one by one.\n\n' +
      '### Acceptance criteria\n\n' +
      '- Checkbox on each row, plus select all\n' +
      '- Archive selected button in the toolbar\n' +
      '- Partial failures show which items failed\n' +
      '- Unit tests for the new API call',
    status: { name: 'In progress', column: 'in_progress' },
    dueDate: '2026-10-16',
    ...overrides,
  });
}

/** The pull request Orynx opened for PROJ-1423 (spec 014): acme/web-app#2841. */
export function makeSessionPullRequest(overrides: Partial<SessionPullRequest> = {}): SessionPullRequest {
  return SessionPullRequestSchema.parse({
    number: 2841,
    url: 'https://github.com/acme/web-app/pull/2841',
    repository: 'acme/web-app',
    openedAt: '2026-10-16T10:30:00.000Z',
    ...overrides,
  });
}

/** Claude's draft for PROJ-1423 (spec 014): 4 files to commit, feat/PROJ-1423 into acme/web-app's main. */
export function makePullRequestDraft(overrides: Partial<PullRequestDraft> = {}): DraftedPullRequest {
  return DraftedPullRequestSchema.parse({
    result: 'draft',
    title: 'PROJ-1423: Add bulk archive to the content list',
    body:
      '## What changed\n\n- A checkbox on each row of the content list, and select all\n' +
      '- Archive selected in the toolbar, which reports the items that failed\n\n' +
      '## How it was checked\n\n`npm test -- content-list` passes.\n\n' +
      'Jira: [PROJ-1423](https://your-team.atlassian.net/browse/PROJ-1423)',
    byClaude: true,
    files: 4,
    branch: 'feat/PROJ-1423',
    repository: 'acme/web-app',
    base: 'main',
    ...overrides,
  });
}

/** Claude's commit message for changes after review (spec 014, Q7): 2 files to commit, to pull request 2841. */
export function makePushDraft(overrides: Partial<Omit<DraftedPush, 'result'>> = {}): DraftedPush {
  return DraftedPushSchema.parse({
    result: 'draft',
    message: 'Use the existing useSelection hook in the content list',
    byClaude: true,
    files: 2,
    branch: 'feat/PROJ-1423',
    number: 2841,
    ...overrides,
  });
}

/** One changed file: the design's `ContentList.tsx`, +68 −9. */
export function makeChangedFile(overrides: Partial<ChangedFile> = {}): ChangedFile {
  return ChangedFileSchema.parse({
    path: 'src/content/ContentList.tsx',
    added: 68,
    removed: 9,
    binary: false,
    renamedFrom: null,
    ...overrides,
  });
}

type ReadyChanges = Extract<SessionChanges, { state: 'ready' }>;

/** The Changes tab as `session.html` draws it: 4 files, +142 −18. */
export function makeSessionChanges(overrides: Partial<Omit<ReadyChanges, 'state'>> = {}): SessionChanges {
  return SessionChangesSchema.parse({
    state: 'ready',
    files: [
      makeChangedFile(),
      makeChangedFile({ path: 'src/content/api/contentApi.ts', added: 31, removed: 2 }),
      makeChangedFile({ path: 'src/content/useSelection.ts', added: 22, removed: 7 }),
      makeChangedFile({ path: 'src/content/__tests__/bulkArchive.test.ts', added: 21, removed: 0 }),
    ],
    moreFiles: 0,
    added: 142,
    removed: 18,
    ...overrides,
  });
}

/** `ContentList.tsx`'s diff, as `session.html` draws its start, with a second hunk further down. */
export function makeFileDiff(overrides: Partial<FileDiff> = {}): FileDiff {
  return FileDiffSchema.parse({
    path: 'src/content/ContentList.tsx',
    lines: [
      { kind: 'hunk', text: '@@ -40,6 +40,8 @@ import { Table } from "../ui";' },
      { kind: 'context', number: 41, text: 'export function ContentList({ items }: Props) {' },
      { kind: 'removed', number: 42, text: '  const [rows] = useState(items);' },
      { kind: 'added', number: 42, text: '  const { selected, toggle, toggleAll } = useSelection(items);' },
      { kind: 'added', number: 43, text: '  const archive = useBulkArchive();' },
      { kind: 'context', number: 44, text: '' },
      { kind: 'hunk', text: '@@ -52,3 +54,4 @@ export function ContentList({ items }: Props) {' },
      { kind: 'removed', number: 52, text: '      <Row key={item.id} item={item} />' },
      { kind: 'added', number: 54, text: '      <Row key={item.id} item={item}' },
      { kind: 'added', number: 55, text: '        checked={selected.has(item.id)}' },
    ],
    binary: false,
    renamedFrom: null,
    cut: false,
    ...overrides,
  });
}

type CommandApproval = Extract<SessionApproval, { kind: 'command' }>;

/** A command waiting for your answer (spec 012): the design's `npm test -- content-list`, with Always allow offered. */
export function makeSessionApproval(overrides: Partial<CommandApproval> = {}): CommandApproval {
  const approval = SessionApprovalSchema.parse({
    id: 'approval-1',
    kind: 'command',
    command: 'npm test -- content-list',
    description: 'Run the content list tests',
    alwaysAsk: null,
    alwaysAllow: 'npm test',
    askedAt: '2026-10-16T10:00:00.000Z',
    ...overrides,
  });
  if (approval.kind !== 'command') throw new Error('makeSessionApproval builds a command approval');
  return approval;
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
  /** Override some rows and keep the others at their defaults, as a change sends them. */
  permissions?: PreferencesChange['permissions'];
  /** Override some rules and keep the others on. */
  inboxRules?: Partial<InboxRules>;
  allowedCommands?: string[];
  editor?: Preferences['editor'];
}

/** Preferences as a fresh DevHub reports them, unless the override says otherwise. */
export function makePreferences(overrides: PreferencesOverrides = {}): Preferences {
  return PreferencesSchema.parse({
    permissions: {
      ...defaultPreferences.permissions,
      ...Object.fromEntries(Object.entries(overrides.permissions ?? {}).filter(([, set]) => set !== undefined)),
    },
    inboxRules: { ...defaultPreferences.inboxRules, ...overrides.inboxRules },
    allowedCommands: overrides.allowedCommands ?? [],
    editor: overrides.editor ?? defaultPreferences.editor,
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

/** Your skill "Bug bash", with the design's words, unless the override says otherwise (spec 023). */
export function makeOrynxSkill(overrides: Partial<Omit<ReadySkill, 'state'>> = {}): ReadySkill {
  return ReadySkillSchema.parse({
    state: 'ready',
    folder: 'bug-bash',
    title: 'Bug bash',
    description: 'Hunt for bugs in the code a ticket touches and list each one with steps to reproduce.',
    uses: 0,
    instructions:
      '# Bug bash\n\n1. Read the ticket and its acceptance criteria.\n2. Run the existing tests.\n\nDo not change any code. Report only.\n',
    ...overrides,
  });
}

/** Settings › Skills with Bug bash in ~/.devhub/plugin, unless the override says otherwise. */
export function makeOrynxSkillList(overrides: Partial<OrynxSkillList> = {}): OrynxSkillList {
  return OrynxSkillListSchema.parse({ pluginFolder: '~/.devhub/plugin', skills: [makeOrynxSkill()], ...overrides });
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
    priority: { name: 'High', level: 'high', rank: 1 },
    dueDate: '2026-10-23',
    assignee: { name: 'Rakesh Dhariwal', mine: true },
    session: null,
    ...overrides,
  });
}

/**
 * One of Orynx's own tickets (spec 037): ORX-3 "Add bulk archive", a Task of yours in To do made on 20 Oct 2026,
 * unless the override says otherwise.
 */
export function makeOrynxTicket(overrides: Partial<OrynxTicket> = {}): OrynxTicket {
  return OrynxTicketSchema.parse({
    key: 'ORX-3',
    title: 'Add bulk archive',
    description: 'Archive several items at once from the content list.',
    type: 'Task',
    priority: 'Medium',
    status: 'to_do',
    dueDate: null,
    version: 1,
    createdBy: { kind: 'you' },
    createdAt: '2026-10-20T09:00:00.000Z',
    updatedAt: '2026-10-20T09:00:00.000Z',
    doneAt: null,
    session: null,
    ...overrides,
  });
}

/** PROJ-1423 in full, as the ticket dialog reads it (spec 022), unless the override says otherwise. */
export function makeTicketDetail(overrides: Partial<TicketDetail> = {}): TicketDetail {
  const key = overrides.key ?? 'PROJ-1423';
  return TicketDetailSchema.parse({
    key,
    url: `https://your-team.atlassian.net/browse/${key}`,
    title: 'Add bulk archive to the content list',
    type: 'Story',
    status: { name: 'In Progress', column: 'in_progress' },
    priority: 'High',
    assignee: 'Rakesh Dhariwal',
    reporter: 'Neha K.',
    dueDate: '2026-10-23',
    labels: [],
    created: '2026-10-01T08:00:00.000Z',
    updated: '2026-10-18T09:30:00.000Z',
    description: 'Archive several items at once from the content list.',
    links: [],
    comments: [],
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

/** One of a project's open sprints, as Tickets' Sprint menu lists it: WEB's active Sprint 43 (spec 020). */
export function makeOpenSprint(overrides: Partial<OpenSprint> = {}): OpenSprint {
  return OpenSprintSchema.parse({
    id: 43,
    name: 'Sprint 43',
    state: 'active',
    startsAt: '2026-10-13T09:00:00.000Z',
    endsAt: '2026-10-24T17:00:00.000Z',
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

/**
 * The design's "Session finished, ready for a pull request" for PROJ-1398, unread, at 10:00 on 19 Oct 2026,
 * unless the override says otherwise (spec 029).
 */
export function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return NotificationSchema.parse({
    id: 'n-1',
    at: '2026-10-19T10:00:00.000Z',
    read: false,
    what: {
      kind: 'session_finished',
      session: {
        id: '00000000000000bb',
        title: 'Read receipts on analytics',
        source: { kind: 'jira', key: 'PROJ-1398' },
      },
    },
    ...overrides,
  });
}

/** The list with its counts worked out from the notifications, as the server sends it. */
export function makeNotificationList(notifications: readonly Notification[] = []): NotificationList {
  return NotificationListSchema.parse({
    notifications,
    unread: notifications.filter((notification) => !notification.read).length,
    waiting: notifications.filter(({ what }) => what.kind === 'approval' && what.waiting).length,
  });
}

/** The design's new PROJ-1431, "assigned to you", unless the override says otherwise (spec 035). */
export function makeSyncChange(overrides: Partial<SyncChange> = {}): SyncChange {
  return SyncChangeSchema.parse({
    kind: 'new',
    ref: 'PROJ-1431',
    title: 'Add bulk archive to the content list',
    url: 'https://acme.atlassian.net/browse/PROJ-1431',
    ...overrides,
  });
}

/** Jira's sync at 10:41 on 20 Oct 2026 that worked in 1.2 s and found nothing, unless the override says otherwise. */
export function makeSyncRun(overrides: Partial<SyncRun> = {}): SyncRun {
  return SyncRunSchema.parse({
    id: '1',
    tool: 'jira',
    startedAt: '2026-10-20T10:41:00.000Z',
    tookMs: 1200,
    problem: null,
    changes: [],
    moreChanges: 0,
    ...overrides,
  });
}

/** Jira syncing fine, last synced at 10:41 on 20 Oct 2026, unless the override says otherwise. */
export function makeSyncTool(overrides: Partial<SyncTool> = {}): SyncTool {
  return SyncToolSchema.parse({
    tool: 'jira',
    state: { state: 'synced', at: '2026-10-20T10:41:00.000Z' },
    lastSyncAt: '2026-10-20T10:41:00.000Z',
    lastGoodSyncAt: '2026-10-20T10:41:00.000Z',
    failingSince: null,
    failedInARow: 0,
    changesToday: 14,
    lastTwoHours: { worked: 60, total: 60 },
    ...overrides,
  });
}

/** Jira and GitHub syncing fine, with no runs, unless the override says otherwise. */
export function makeSyncActivity(overrides: Partial<SyncActivity> = {}): SyncActivity {
  return SyncActivitySchema.parse({
    tools: [makeSyncTool(), makeSyncTool({ tool: 'github', changesToday: 21 })],
    runs: [],
    ...overrides,
  });
}

/** The session's shell tabs (spec 036): zsh, and its first tab. */
export function makeTerminal(overrides: Partial<Terminal> = {}): Terminal {
  return TerminalSchema.parse({
    shell: 'zsh',
    worktree: '~/.devhub/worktrees/0123456789abcdef',
    tabs: [{ id: 'tab-1', number: 1 }],
    ...overrides,
  });
}

/** The design's Claude tab (spec 036): five commands, oldest first, the last still running. */
export function makeClaudeCommands(): ClaudeCommandList {
  return ClaudeCommandListSchema.parse({
    commands: [
      {
        id: 'toolu_1',
        state: 'done',
        command: 'git status',
        output: ['On branch feat/PROJ-1423'],
        cut: false,
        ms: 100,
      },
      {
        id: 'toolu_2',
        state: 'failed',
        command: 'npm test -- content-list',
        output: [' FAIL  src/content/__tests__/bulkArchive.test.ts', 'Tests: 1 failed, 23 passed, 24 total'],
        cut: false,
        ms: 3000,
      },
      { id: 'toolu_3', state: 'denied', command: 'npm install date-fns@3.6.0' },
      { id: 'toolu_4', state: 'refused', command: 'git push --force', reason: 'push' },
      { id: 'toolu_5', state: 'running', command: 'npm run lint' },
    ],
  });
}
