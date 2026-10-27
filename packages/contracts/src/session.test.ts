import { describe, expect, it } from 'vitest';
import {
  apiRoutes,
  RespondToApprovalRequestSchema,
  SendMessageAnswerSchema,
  SendMessageRequestSchema,
  ServerEventSchema,
  SessionChangeRequestSchema,
  SessionDeleteQuerySchema,
  ApiErrorSchema,
  sessionTitleLimit,
  SessionActivitySchema,
  SessionApprovalSchema,
  SessionIdSchema,
  SessionListQuerySchema,
  SessionListSchema,
  SessionSchema,
  SessionStepsSchema,
  StepLabelSchema,
  stepsOf,
  ComposerStartSchema,
  composerLimits,
  StartSessionAnswerSchema,
  StartSessionRequestSchema,
  type SessionActivity,
} from './index.ts';
import {
  makeComposerStart,
  makeSession,
  makeSessionApproval,
  makeSessionList,
  makeSessionSummary,
  makeSessionTicket,
} from './testing.ts';

describe('SessionListSchema', () => {
  it('AC-8: accepts sessions from a Jira ticket, a pull request and no source', () => {
    const list = makeSessionList([
      { source: { kind: 'jira', key: 'PROJ-1423' } },
      { source: { kind: 'pull_request', number: 2836 } },
      { source: null },
    ]);
    expect(SessionListSchema.safeParse(list).success).toBe(true);
    expect(list.sessions.map((session) => session.id)).toEqual(['session-1', 'session-2', 'session-3']);
  });

  it('rejects a state the sidebar cannot show', () => {
    const result = SessionListSchema.safeParse({ sessions: [{ ...makeSessionSummary(), state: 'thinking' }] });
    expect(result.success).toBe(false);
  });

  it('rejects a pull request number that is not a positive whole number', () => {
    const session = { ...makeSessionSummary(), source: { kind: 'pull_request', number: 0 } };
    expect(SessionListSchema.safeParse({ sessions: [session] }).success).toBe(false);
  });
});

describe('a Jira step (spec 044)', () => {
  it('AC-1: keeps what Claude did in Jira, with only the fields its action needs', () => {
    expect(
      SessionActivitySchema.parse({ id: 'step-1', state: 'done', kind: 'jira', action: 'searched', found: 12 }),
    ).toEqual({
      id: 'step-1',
      state: 'done',
      kind: 'jira',
      action: 'searched',
      key: null,
      summary: null,
      found: 12,
      more: false,
      to: null,
    });
    expect(
      SessionActivitySchema.safeParse({ id: 'step-1', state: 'done', kind: 'jira', action: 'searched', found: -1 })
        .success,
    ).toBe(false);
  });
});

describe('SessionListQuerySchema', () => {
  it('AC-15: reads the limit from a query string', () => {
    expect(SessionListQuerySchema.parse({ limit: '5' })).toEqual({ limit: 5 });
    expect(SessionListQuerySchema.parse({})).toEqual({});
  });

  it('AC-15: rejects a limit below 1', () => {
    expect(SessionListQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('AC-6 (spec 020): reads a cursor of the last row’s time and id, and refuses one it can’t read', () => {
    expect(SessionListQuerySchema.parse({ limit: '16', cursor: '1760608800000.0123456789abcdef' })).toEqual({
      limit: 16,
      cursor: '1760608800000.0123456789abcdef',
    });
    expect(SessionListQuerySchema.safeParse({ cursor: 'yesterday' }).success).toBe(false);
    expect(SessionListQuerySchema.safeParse({ cursor: '1760608800000.' }).success).toBe(false);
  });
});

describe('SessionListSchema paging', () => {
  it('AC-6 (spec 020): a page names where the next one starts, or null on the last; an older answer reads as the last', () => {
    expect(SessionListSchema.parse({ sessions: [], nextCursor: '1760608800000.session-16' }).nextCursor).toBe(
      '1760608800000.session-16',
    );
    expect(SessionListSchema.parse({ sessions: [] })).toEqual({ sessions: [], nextCursor: null });
  });
});

describe('sessions on the wire', () => {
  it('AC-15: has a path under /api', () => {
    expect(apiRoutes.sessions).toBe('/api/sessions');
  });

  it('AC-13: accepts the sessions.changed event', () => {
    expect(ServerEventSchema.parse({ type: 'sessions.changed' })).toEqual({ type: 'sessions.changed' });
  });
});

describe('SessionSchema', () => {
  it("AC-2: holds the folder, the branch, the step and each kind of activity Claude's progress shows", () => {
    const session = makeSession({
      branch: 'feat/PROJ-1423',
      step: 'build',
      activities: [
        { id: 'a1', state: 'done', kind: 'worktree', branch: 'feat/PROJ-1423', base: 'origin/main', fetched: true },
        {
          id: 'a2',
          state: 'done',
          kind: 'brief',
          key: 'PROJ-1423',
          tickets: [],
          message: false,
          pullRequests: [],
          files: [],
          skills: [],
        },
        { id: 'a3', state: 'done', kind: 'explore', files: ['src/content/ContentList.tsx', 'src/api/contentApi.ts'] },
        { id: 'a4', state: 'done', kind: 'plan', items: ['Row selection', 'A bulkArchive API call'] },
        { id: 'a5', state: 'done', kind: 'refused', access: 'edit', reason: 'outside_worktree', path: '/etc/hosts' },
        { id: 'a6', state: 'running', kind: 'edit', files: ['src/content/ContentList.tsx'] },
      ],
    });
    expect(SessionSchema.parse(session)).toEqual(session);
  });

  it('AC-8, AC-9, AC-10, AC-14: holds how a session ended', () => {
    for (const activity of [
      { id: 'a1', state: 'done', kind: 'finished', summary: 'Added row selection and a toolbar button.' },
      { id: 'a1', state: 'done', kind: 'stopped' },
      { id: 'a1', state: 'done', kind: 'interrupted' },
      { id: 'a1', state: 'done', kind: 'discarded', branch: 'feat/PROJ-1423', kept: false },
    ] as const) {
      expect(SessionSchema.safeParse(makeSession({ state: 'stopped', activities: [activity] })).success).toBe(true);
    }
  });

  it("AC-13: holds why a session couldn't start or stopped with an error", () => {
    for (const kind of ['jira', 'folder', 'git', 'login', 'limit', 'other'] as const) {
      const session = makeSession({ state: 'stopped', problem: { kind, stage: 'starting' } });
      expect(SessionSchema.parse(session).problem).toEqual({ kind, stage: 'starting' });
    }
    expect(SessionSchema.safeParse({ ...makeSession(), problem: { kind: 'disk', stage: 'working' } }).success).toBe(
      false,
    );
  });

  it('AC-6: refuses a refusal without its reason', () => {
    const activity = { id: 'a1', state: 'done', kind: 'refused', access: 'edit', path: 'src/a.ts' };
    expect(SessionSchema.safeParse({ ...makeSession(), activities: [activity] }).success).toBe(false);
  });

  it('opens Jira only on a Jira Cloud site over https', () => {
    expect(
      SessionSchema.safeParse({ ...makeSession(), jiraUrl: 'http://your-team.atlassian.net/browse/PROJ-1423' }).success,
    ).toBe(false);
    expect(SessionSchema.safeParse({ ...makeSession(), jiraUrl: 'https://example.com/browse/PROJ-1423' }).success).toBe(
      false,
    );
  });

  it('AC-10: a discarded session says when', () => {
    const session = makeSession({ state: 'stopped', discardedAt: '2026-10-16T10:05:00.000Z' });
    expect(SessionSchema.parse(session).discardedAt).toBe('2026-10-16T10:05:00.000Z');
  });
});

describe('session approvals (spec 012)', () => {
  it('AC-1, AC-10: holds the calls waiting for an answer, in order', () => {
    const session = makeSession({
      state: 'needs_you',
      approvals: [makeSessionApproval(), makeSessionApproval({ id: 'approval-2', command: 'npm run lint' })],
    });
    expect(SessionSchema.parse(session).approvals.map((approval) => approval.id)).toEqual(['approval-1', 'approval-2']);
  });

  it('AC-1, AC-5, AC-6: a command approval carries the command, its description, why it always asks and the Always allow entry', () => {
    expect(makeSessionApproval()).toEqual({
      id: 'approval-1',
      kind: 'command',
      command: 'npm test -- content-list',
      description: 'Run the content list tests',
      alwaysAsk: null,
      alwaysAllow: 'npm test',
      askedAt: '2026-10-16T10:00:00.000Z',
    });
    const network = makeSessionApproval({ command: 'curl https://x.test', alwaysAsk: 'network', alwaysAllow: null });
    expect(SessionApprovalSchema.parse(network)).toMatchObject({ alwaysAsk: 'network', alwaysAllow: null });
    for (const reason of ['network', 'delete_outside', 'unsandboxed'] as const) {
      expect(SessionApprovalSchema.safeParse(makeSessionApproval({ alwaysAsk: reason })).success).toBe(true);
    }
    expect(SessionApprovalSchema.safeParse({ ...makeSessionApproval(), alwaysAsk: 'scary' }).success).toBe(false);
  });

  it('AC-8, Q9: an edit approval carries the path, whether it creates the file, the change as lines and how many more', () => {
    const edit = {
      id: 'approval-3',
      kind: 'edit',
      path: 'src/content/ContentList.tsx',
      creates: false,
      lines: [
        { kind: 'context', number: 41, text: 'export function ContentList({ items }: Props) {' },
        { kind: 'removed', number: 42, text: '  const [rows] = useState(items);' },
        { kind: 'added', number: 42, text: '  const { selected } = useSelection(items);' },
      ],
      moreLines: 12,
      askedAt: '2026-10-16T10:00:00.000Z',
    };
    expect(SessionApprovalSchema.parse(edit)).toEqual(edit);
    const unnumbered = { ...edit, lines: [{ kind: 'added', text: 'x' }] };
    expect(SessionApprovalSchema.safeParse(unnumbered).success).toBe(false);
  });

  it('AC-1, AC-2, AC-3, AC-7, AC-17, AC-20: holds the steps approvals add', () => {
    const activities: SessionActivity[] = [
      {
        id: 'a1',
        state: 'running',
        kind: 'waiting',
        approvalId: 'approval-1',
        about: 'command',
        text: 'Run the tests',
      },
      { id: 'a2', state: 'running', kind: 'waiting', approvalId: 'approval-2', about: 'edit', text: 'src/a.ts' },
      { id: 'a3', state: 'done', kind: 'command', commands: ['npm test', 'npm run lint'] },
      { id: 'a4', state: 'done', kind: 'denied', about: 'command', text: 'rm -rf dist' },
      { id: 'a5', state: 'done', kind: 'denied', about: 'edit', text: 'src/a.ts' },
      { id: 'a6', state: 'done', kind: 'no_commands', reason: 'no_sandbox' },
      { id: 'a7', state: 'done', kind: 'refused', access: 'run', reason: 'push', path: 'git push origin main' },
      { id: 'a8', state: 'done', kind: 'refused', access: 'run', reason: 'background', path: 'npm start' },
    ];
    const session = makeSession({ activities });
    expect(SessionSchema.parse(session).activities).toEqual(activities);
  });

  it('a session saved before spec 012 has no approvals, and reads as having none', () => {
    const { approvals: _none, ...older } = makeSession();
    expect(SessionSchema.parse(older).approvals).toEqual([]);
  });
});

describe('a session in spec 013', () => {
  it('AC-11, AC-12: holds the step with your message, never an empty one', () => {
    const activities: SessionActivity[] = [
      { id: 'a1', state: 'done', kind: 'message', text: 'Use the existing useSelection hook instead' },
    ];
    expect(SessionSchema.parse(makeSession({ activities })).activities).toEqual(activities);
    const withEmpty = { ...makeSession(), activities: [{ id: 'a1', state: 'done', kind: 'message', text: '' }] };
    expect(SessionSchema.safeParse(withEmpty).success).toBe(false);
  });

  it("AC-16: can stop because Claude Code couldn't carry on the earlier conversation", () => {
    const session = makeSession({ problem: { kind: 'resume', stage: 'working' } });
    expect(SessionSchema.parse(session).problem).toEqual({ kind: 'resume', stage: 'working' });
  });

  it('AC-9: carries the ticket as Claude got it, with its status and due date from the cache', () => {
    const ticket = makeSessionTicket();
    expect(SessionSchema.parse(makeSession({ ticket })).ticket).toEqual(ticket);
    const bare = { type: null, description: null, status: null, dueDate: null, deleted: false };
    expect(SessionSchema.parse(makeSession({ ticket: bare })).ticket).toEqual(bare);
    const badColumn = { ...ticket, status: { name: 'Doing', column: 'doing' } };
    expect(SessionSchema.safeParse({ ...makeSession(), ticket: badColumn }).success).toBe(false);
  });

  it('AC-14: says whether the follow-up box is open, or why not, with the newer session when there is one', () => {
    for (const followUp of [{ kind: 'open' }, { kind: 'discarded' }, { kind: 'never_started' }] as const) {
      expect(SessionSchema.parse(makeSession({ followUp })).followUp).toEqual(followUp);
    }
    // Every session on a ticket carries on, so none says a newer one took over (spec 047, AC-5).
    const newer = { ...makeSession(), followUp: { kind: 'newer_session', sessionId: 'fedcba9876543210' } };
    expect(SessionSchema.safeParse(newer).success).toBe(false);
  });

  it("AC-20: carries the worktree's path for Open in", () => {
    const worktreePath = '/Users/you/.devhub/worktrees/0123456789abcdef';
    expect(SessionSchema.parse(makeSession({ worktreePath })).worktreePath).toBe(worktreePath);
  });

  it("Q3: carries Claude's working time so far and when the current run started", () => {
    const session = makeSession({ workedMs: 252_000, runStartedAt: '2026-10-16T10:20:00.000Z' });
    expect(SessionSchema.parse(session)).toMatchObject({ workedMs: 252_000, runStartedAt: '2026-10-16T10:20:00.000Z' });
    expect(SessionSchema.safeParse({ ...makeSession(), workedMs: -1 }).success).toBe(false);
  });

  it("047 AC-22, AC-24: carries Claude's turns and their cost, and a session saved before spec 047 reads with none", () => {
    expect(SessionSchema.parse(makeSession({ turns: 38, costUsd: 1.42 }))).toMatchObject({ turns: 38, costUsd: 1.42 });
    expect(SessionSchema.safeParse({ ...makeSession(), turns: -1 }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...makeSession(), costUsd: -0.5 }).success).toBe(false);
    const { turns: _turns, costUsd: _cost, ...older } = makeSession();
    expect(SessionSchema.parse(older)).toMatchObject({ turns: 0, costUsd: null });
  });

  it('a session saved before spec 013 reads with no ticket, the box open, no path and no time worked', () => {
    const {
      ticket: _ticket,
      followUp: _followUp,
      worktreePath: _path,
      workedMs: _worked,
      runStartedAt: _run,
      ...older
    } = makeSession();
    expect(SessionSchema.parse(older)).toMatchObject({
      ticket: null,
      followUp: { kind: 'open' },
      worktreePath: null,
      workedMs: 0,
      runStartedAt: null,
    });
  });
});

describe('a session in spec 014', () => {
  const pullRequest = {
    number: 2841,
    url: 'https://github.com/acme/web-app/pull/2841',
    repository: 'acme/web-app',
    openedAt: '2026-10-16T10:30:00.000Z',
  };

  it('AC-4, AC-20: carries its pull request once one is open', () => {
    const session = makeSession({ state: 'pr_open', step: 'pull_request', pullRequest });
    expect(SessionSchema.parse(session).pullRequest).toEqual(pullRequest);
  });

  it("AC-16: keeps only a pull request's link that is https on github.com", () => {
    for (const url of [
      'http://github.com/acme/web-app/pull/2841',
      'https://github.com.evil.example/acme/web-app/pull/2841',
      'https://gist.github.com/acme/2841',
      'javascript:alert(1)',
    ]) {
      const session = { ...makeSession(), pullRequest: { ...pullRequest, url } };
      expect(SessionSchema.safeParse(session).success, url).toBe(false);
    }
  });

  it('names the repository as owner/name, and the number as a positive whole number', () => {
    for (const repository of ['acme', 'acme/web-app/extra', '-acme/web-app', 'acme/', 'acme/web app']) {
      const session = { ...makeSession(), pullRequest: { ...pullRequest, repository } };
      expect(SessionSchema.safeParse(session).success, repository).toBe(false);
    }
    expect(SessionSchema.safeParse({ ...makeSession(), pullRequest: { ...pullRequest, number: 0 } }).success).toBe(
      false,
    );
  });

  it('AC-4, AC-11, AC-17: holds the steps for a pull request opened or linked, and changes pushed to it', () => {
    const activities: SessionActivity[] = [
      {
        id: 'a1',
        state: 'done',
        kind: 'pull_request',
        number: 2841,
        url: pullRequest.url,
        files: 4,
        branch: 'feat/PROJ-1423',
        linked: false,
      },
      { id: 'a2', state: 'done', kind: 'pushed', number: 2841, url: pullRequest.url, files: 2 },
    ];
    expect(SessionSchema.parse(makeSession({ activities })).activities).toEqual(activities);
    const badLink = { ...makeSession(), activities: [{ ...activities[1], url: 'https://example.com/pull/2841' }] };
    expect(SessionSchema.safeParse(badLink).success).toBe(false);
  });

  it('a session saved before spec 014 reads with no pull request', () => {
    const { pullRequest: _pullRequest, ...older } = makeSession();
    expect(SessionSchema.parse(older).pullRequest).toBeNull();
  });
});

describe('answering an approval', () => {
  it('AC-2, AC-3, AC-5: takes Allow once, Always allow or Deny', () => {
    for (const decision of ['allow_once', 'always_allow', 'deny'] as const) {
      expect(RespondToApprovalRequestSchema.parse({ decision })).toEqual({ decision });
    }
    expect(RespondToApprovalRequestSchema.safeParse({ decision: 'allow' }).success).toBe(false);
  });

  it('has its path under the session', () => {
    expect(apiRoutes.sessionApproval).toBe('/api/sessions/:id/approvals/:approvalId');
  });
});

describe('SessionIdSchema', () => {
  it('accepts only the 16 hex characters a new session gets, so an id is always a safe folder name', () => {
    expect(SessionIdSchema.safeParse('0123456789abcdef').success).toBe(true);
    for (const id of ['../../etc', '0123456789ABCDEF', '0123456789abcde', 'session-1']) {
      expect(SessionIdSchema.safeParse(id).success).toBe(false);
    }
  });
});

describe('StartSessionRequestSchema', () => {
  it('AC-1, AC-11: takes a ticket key, and the folder when its project has several', () => {
    expect(StartSessionRequestSchema.parse({ ticketKey: 'PROJ-1423' })).toEqual({ ticketKey: 'PROJ-1423' });
    expect(StartSessionRequestSchema.parse({ ticketKey: 'PROJ-1423', repositoryId: '00000000000000aa' })).toEqual({
      ticketKey: 'PROJ-1423',
      repositoryId: '00000000000000aa',
    });
  });

  it("refuses something that isn't a Jira issue key", () => {
    for (const ticketKey of ['proj-1423', 'PROJ', 'PROJ-0', '../PROJ-1']) {
      expect(StartSessionRequestSchema.safeParse({ ticketKey }).success).toBe(false);
    }
  });
});

describe('StartSessionAnswerSchema', () => {
  it("AC-1, AC-12: answers started, existing, or why it can't start", () => {
    expect(StartSessionAnswerSchema.parse({ result: 'started', sessionId: '0123456789abcdef' }).result).toBe('started');
    expect(StartSessionAnswerSchema.parse({ result: 'existing', sessionId: '0123456789abcdef' }).result).toBe(
      'existing',
    );
    for (const reason of ['no_folder', 'choose_folder', 'signed_out', 'too_many'] as const) {
      expect(StartSessionAnswerSchema.parse({ result: 'cannot_start', reason })).toEqual({
        result: 'cannot_start',
        reason,
      });
    }
  });
});

describe('the session list query', () => {
  it('AC-10: reads recent from a query string', () => {
    expect(SessionListQuerySchema.parse({ limit: '5', recent: 'true' })).toEqual({ limit: 5, recent: true });
  });
});

describe('one session on the wire', () => {
  it('AC-1, AC-9, AC-10, AC-17: has its paths under /api', () => {
    expect(apiRoutes.session).toBe('/api/sessions/:id');
    expect(apiRoutes.sessionStop).toBe('/api/sessions/:id/stop');
    expect(apiRoutes.sessionDiscard).toBe('/api/sessions/:id/discard');
  });

  it("AC-4: accepts session.changed with the session's id", () => {
    const event = { type: 'session.changed', sessionId: '0123456789abcdef' };
    expect(ServerEventSchema.parse(event)).toEqual(event);
    expect(ServerEventSchema.safeParse({ type: 'session.changed' }).success).toBe(false);
  });
});

describe('a follow-up (spec 013)', () => {
  it('AC-11: takes your text, trimmed', () => {
    expect(SendMessageRequestSchema.parse({ text: '  Use the existing useSelection hook instead\n' })).toEqual({
      text: 'Use the existing useSelection hook instead',
      context: [],
    });
  });

  it('spec 025: takes chips as the composer’s start does, within the same limits and never the same one twice', () => {
    const chip = { kind: 'jira', key: 'PROJ-1423' } as const;
    expect(SendMessageRequestSchema.parse({ text: 'And this', context: [chip] })).toEqual({
      text: 'And this',
      context: [chip],
    });
    expect(SendMessageRequestSchema.safeParse({ text: 'And this', context: [chip, chip] }).success).toBe(false);
    const files = Array.from({ length: 101 }, (_, n) => ({ kind: 'file', path: `~/${String(n)}.md` }));
    expect(SendMessageRequestSchema.safeParse({ text: 'And this', context: files }).success).toBe(false);
    expect(
      SendMessageRequestSchema.safeParse({ text: 'And this', context: [{ kind: 'file', path: '~/.env' }] }).success,
    ).toBe(false);
  });

  it('AC-15, AC-21: refuses an empty message and one longer than 10,000 characters', () => {
    for (const text of ['', '   \n  ', 'x'.repeat(10_001)]) {
      expect(SendMessageRequestSchema.safeParse({ text }).success).toBe(false);
    }
    expect(SendMessageRequestSchema.safeParse({ text: 'x'.repeat(10_000) }).success).toBe(true);
  });

  it("AC-14, AC-15: answers sent, or why it can't send", () => {
    expect(SendMessageAnswerSchema.parse({ result: 'sent' })).toEqual({ result: 'sent' });
    for (const reason of ['too_many', 'discarded', 'never_started'] as const) {
      expect(SendMessageAnswerSchema.parse({ result: 'cannot_send', reason })).toEqual({
        result: 'cannot_send',
        reason,
      });
    }
    expect(SendMessageAnswerSchema.safeParse({ result: 'cannot_send', reason: 'busy' }).success).toBe(false);
  });

  it('AC-11: has its path under the session', () => {
    expect(apiRoutes.sessionMessages).toBe('/api/sessions/:id/messages');
  });
});

describe("the composer's start (spec 015)", () => {
  const ticket = { kind: 'jira', key: 'PROJ-1423' } as const;
  const pull = (number: number) => ({ kind: 'pull_request', owner: 'acme', name: 'web-app', number }) as const;
  const file = (name: string) => ({ kind: 'file', path: `~/notes/${name}` }) as const;
  // A body as the page would send it, changed only where a test says, so a refused one can be built too.
  const body = (change: object) => ({ ...makeComposerStart(), ...change });

  it('AC-4: takes your message, trimmed, with the folder and no chips', () => {
    expect(
      StartSessionRequestSchema.parse({
        message: '  Add a CSV export to the reports page\n',
        repositoryId: '00000000000000aa',
        context: [],
      }),
    ).toEqual({ message: 'Add a CSV export to the reports page', repositoryId: '00000000000000aa', context: [] });
  });

  it('spec 026: takes Ask or Build, left out for Build, and a session saved before it is a Build', () => {
    expect(ComposerStartSchema.parse(body({ mode: 'ask' })).mode).toBe('ask');
    expect(ComposerStartSchema.parse(body({})).mode).toBeUndefined();
    expect(ComposerStartSchema.safeParse(body({ mode: 'chat' })).success).toBe(false);
    const { mode: _mode, ...saved } = makeSession();
    expect(SessionSchema.parse(saved).mode).toBe('build');
  });

  it('spec 047, AC-2: takes `another` to start beside a live session, left out otherwise', () => {
    expect(ComposerStartSchema.parse(body({ another: true })).another).toBe(true);
    expect(ComposerStartSchema.parse(body({})).another).toBeUndefined();
    expect(ComposerStartSchema.safeParse(body({ another: 'yes' })).success).toBe(false);
  });

  it('AC-20: keeps a ticket, pull requests and files in the order you added them', () => {
    const context = [file('notes.md'), ticket, pull(2836), pull(2841)];
    expect(ComposerStartSchema.parse(body({ message: 'Use the notes', context })).context).toEqual(context);
  });

  it('AC-8: takes an empty message only when a ticket is the brief', () => {
    expect(ComposerStartSchema.safeParse(body({ message: '  ', context: [ticket] })).success).toBe(true);
    for (const context of [[], [pull(2836)], [file('notes.md')]]) {
      expect(ComposerStartSchema.safeParse(body({ message: ' \n ', context })).success).toBe(false);
    }
  });

  it('AC-3, AC-6 (spec 022, Q5): takes up to 100 tickets, 100 pull requests and 100 files, never the same one twice', () => {
    const key = (n: number) => ({ kind: 'jira', key: `PROJ-${String(n)}` }) as const;
    const upTo = (count: number) => Array.from({ length: count }, (_, n) => n + 1);
    const tooMany = [
      upTo(101).map(key),
      upTo(101).map(pull),
      upTo(101).map((n) => file(`notes-${String(n)}.md`)),
      [pull(2836), pull(2836)],
      [ticket, pull(1), ticket],
    ];
    for (const context of tooMany) {
      expect(ComposerStartSchema.safeParse(body({ context })).success).toBe(false);
    }
    const most = [
      ...upTo(100).map(key),
      ...upTo(100).map(pull),
      ...upTo(100).map((n) => file(`notes-${String(n)}.md`)),
    ];
    expect(ComposerStartSchema.safeParse(body({ context: most })).success).toBe(true);
    expect(composerLimits).toEqual({ tickets: 100, pullRequests: 100, files: 100, skills: 5 });
  });

  it('022 AC-10, AC-13, AC-14: a file is its path, of any kind; never one that looks like a secret, or the same twice', () => {
    for (const path of ['~/Movies/demo.mov', '/Users/dev/notes/plan.pdf', '~/shot.png']) {
      expect(ComposerStartSchema.safeParse(body({ context: [{ kind: 'file', path }] })).success).toBe(true);
    }
    for (const path of ['~/.ssh/id_rsa', '/Users/dev/web-app/.env', '~/certs/server.pem']) {
      expect(ComposerStartSchema.safeParse(body({ context: [{ kind: 'file', path }] })).success).toBe(false);
    }
    expect(ComposerStartSchema.safeParse(body({ context: [file('a.md'), file('a.md')] })).success).toBe(false);
  });

  it('refuses a message over 10,000 characters, and names that could be read as paths', () => {
    expect(ComposerStartSchema.safeParse(body({ message: 'x'.repeat(10_001) })).success).toBe(false);
    for (const chip of [
      { ...pull(2836), owner: '../acme' },
      { ...pull(2836), name: '..' },
      { ...pull(2836), name: 'web app' },
      { ...pull(2836), number: 0 },
      { kind: 'file', path: '' },
      { kind: 'file', path: 'notes/plan.md' },
      { kind: 'file', path: '/two\nlines.md' },
      { kind: 'file', name: 'notes.md', text: 'The shape before spec 022' },
      { kind: 'jira', key: 'proj-1423' },
      { kind: 'slack_thread', ts: '1' },
    ]) {
      expect(ComposerStartSchema.safeParse(body({ context: [chip] })).success).toBe(false);
    }
  });

  it("still takes Ship's ticket, and never reads one start as the other", () => {
    expect(StartSessionRequestSchema.parse({ ticketKey: 'PROJ-1423' })).toEqual({ ticketKey: 'PROJ-1423' });
    expect('ticketKey' in StartSessionRequestSchema.parse(makeComposerStart())).toBe(false);
    expect(StartSessionRequestSchema.safeParse({ message: 'Fix it' }).success).toBe(false);
  });

  it('AC-24: a brief step names what Claude got: the ticket or none, your message, pull requests and files', () => {
    const step = {
      id: 'step-2',
      state: 'done',
      kind: 'brief',
      key: null,
      tickets: [],
      message: true,
      pullRequests: ['web-app #2836'],
      files: ['~/notes/plan.pdf'],
      skills: [],
    };
    expect(
      SessionSchema.parse(makeSession({ source: null, activities: [step] as SessionActivity[] })).activities,
    ).toEqual([step]);
    expect(
      SessionSchema.parse(
        makeSession({
          activities: [{ id: 'step-2', state: 'done', kind: 'brief', key: 'PROJ-1423' }] as SessionActivity[],
        }),
      ).activities,
    ).toEqual([
      {
        id: 'step-2',
        state: 'done',
        kind: 'brief',
        key: 'PROJ-1423',
        tickets: [],
        message: false,
        pullRequests: [],
        files: [],
        skills: [],
      },
    ]);
  });

  it('AC-4 (spec 022): a brief step names the other tickets Claude got, after the session’s own', () => {
    const step = { id: 'step-2', state: 'done', kind: 'brief', key: 'PROJ-1423', tickets: ['PROJ-1424'] };
    expect(SessionSchema.parse(makeSession({ activities: [step] as SessionActivity[] })).activities).toEqual([
      { ...step, message: false, pullRequests: [], files: [], skills: [] },
    ]);
  });

  it('AC-21: answers which chip failed and how', () => {
    for (const problem of ['not_connected', 'not_found', 'unreachable', 'other'] as const) {
      expect(StartSessionAnswerSchema.parse({ result: 'context_failed', chip: 2, problem })).toEqual({
        result: 'context_failed',
        chip: 2,
        problem,
      });
    }
    expect(StartSessionAnswerSchema.safeParse({ result: 'context_failed', chip: -1, problem: 'other' }).success).toBe(
      false,
    );
    expect(StartSessionAnswerSchema.safeParse({ result: 'context_failed', chip: 0, problem: 'busy' }).success).toBe(
      false,
    );
  });
});

describe('a session in spec 031', () => {
  it('AC-23: a session saved before spec 031 is a Build on a new branch, in its folder, with no step skipped', () => {
    const saved = makeSession({
      activities: [{ id: 'step-9', state: 'done', kind: 'discarded', branch: 'feat/PROJ-1423' }] as SessionActivity[],
    });
    const { workOn: _workOn, skipped: _skipped, ...before } = saved;
    const read = SessionSchema.parse(before);
    expect(read.workOn).toBe('new_branch');
    expect(read.skipped).toEqual([]);
    expect(read.folder).toEqual({ name: 'web-app', displayPath: '~/code/web-app' });
    expect(read.activities).toEqual([
      { id: 'step-9', state: 'done', kind: 'discarded', branch: 'feat/PROJ-1423', kept: false },
    ]);
  });

  it("AC-3, AC-11, AC-14: holds an Ask with no folder, the steps passed over, and a PR's branch kept at Discard", () => {
    const session = makeSession({
      folder: null,
      workOn: 'pull_request',
      skipped: ['build', 'test'],
      activities: [
        { id: 'step-9', state: 'done', kind: 'discarded', branch: 'fix/content-list', kept: true },
      ] as SessionActivity[],
    });
    expect(SessionSchema.parse(session)).toMatchObject({
      folder: null,
      workOn: 'pull_request',
      skipped: ['build', 'test'],
      activities: [{ kind: 'discarded', branch: 'fix/content-list', kept: true }],
    });
  });

  it('refuses a kind of work or a skipped step it doesn’t know', () => {
    expect(SessionSchema.safeParse({ ...makeSession(), workOn: 'fork' }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...makeSession(), skipped: ['deploy'] }).success).toBe(false);
  });
});

describe('renaming, pinning and deleting a session (spec 039)', () => {
  it('AC-26: a summary carries when it was pinned, null by default, and its kind', () => {
    expect(makeSessionSummary().pinnedAt).toBeNull();
    expect(makeSessionSummary().mode).toBe('build');
    const pinned = makeSessionSummary({ pinnedAt: '2026-10-20T09:00:00.000Z', mode: 'ask' });
    expect(pinned.pinnedAt).toBe('2026-10-20T09:00:00.000Z');
    expect(pinned.mode).toBe('ask');
  });

  it('AC-28: a change takes a new title, trimmed, or a pin', () => {
    expect(SessionChangeRequestSchema.parse({ title: '  Fix the login page \n' })).toEqual({
      title: 'Fix the login page',
    });
    expect(SessionChangeRequestSchema.parse({ pinned: true })).toEqual({ pinned: true });
    expect(SessionChangeRequestSchema.parse({ title: 'x'.repeat(sessionTitleLimit) }).title).toHaveLength(200);
  });

  it('AC-29: refuses a title of only spaces, one too long, and a change of nothing', () => {
    expect(SessionChangeRequestSchema.safeParse({ title: '' }).success).toBe(false);
    expect(SessionChangeRequestSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(SessionChangeRequestSchema.safeParse({ title: 'x'.repeat(sessionTitleLimit + 1) }).success).toBe(false);
    expect(SessionChangeRequestSchema.safeParse({}).success).toBe(false);
  });

  it('AC-26, AC-27: the list query asks for the pinned sessions, or the rest', () => {
    expect(SessionListQuerySchema.parse({ pinned: 'true' })).toEqual({ pinned: true });
    expect(SessionListQuerySchema.parse({ pinned: 'false', limit: '16' })).toEqual({ pinned: false, limit: 16 });
  });

  it('AC-32: a delete takes the branch too only when asked', () => {
    expect(SessionDeleteQuerySchema.parse({})).toEqual({});
    expect(SessionDeleteQuerySchema.parse({ branch: 'true' })).toEqual({ branch: true });
  });

  it('AC-33: a delete while Claude works is refused with its own code', () => {
    expect(ApiErrorSchema.parse({ code: 'session_working', message: 'Stop the session first.' }).code).toBe(
      'session_working',
    );
  });
});

describe('a session in spec 042', () => {
  const steps = (...list: [string, string][]) => list.map(([kind, label]) => ({ kind, label }));

  it("AC-1, AC-24: holds Claude's own steps, its intent and where its branch name came from", () => {
    const session = makeSession({
      intent: 'run',
      branchFrom: 'repo_rules',
      steps: SessionStepsSchema.parse(steps(['setup', 'Set up'], ['run', 'Start server'])),
      step: 'run',
    });
    expect(session.steps.map((step) => step.label)).toEqual(['Set up', 'Start server']);
    expect(session.intent).toBe('run');
    expect(session.branchFrom).toBe('repo_rules');
  });

  it('AC-28, AC-32: a session saved before spec 042 reads with no steps of its own and no intent', () => {
    const { steps: _steps, intent: _intent, branchFrom: _from, ...saved } = makeSession();
    expect(SessionSchema.parse(saved)).toMatchObject({ steps: [], intent: null, branchFrom: null });
  });

  it('AC-28, AC-32: an older session shows the five steps it always had, the last Push on your pull request', () => {
    expect(stepsOf(makeSession()).map((step) => step.label)).toEqual([
      'Plan',
      'Build',
      'Test',
      'Review',
      'Pull request',
    ]);
    expect(stepsOf(makeSession({ workOn: 'pull_request' })).at(-1)).toEqual({ kind: 'pull_request', label: 'Push' });
    const own = SessionStepsSchema.parse(steps(['answer', 'Answer']));
    expect(stepsOf(makeSession({ steps: own }))).toEqual(own);
  });

  it('AC-25: a label is 1 to 3 words, at most 16 characters, starts with a capital, letters and digits only', () => {
    for (const good of ['Set up', 'Start server', 'Fix env key', 'Test', 'Run e2e', 'Prüfen'])
      expect(StepLabelSchema.safeParse(good).success, good).toBe(true);
    for (const bad of ['', 'set up', 'Fix the env key', 'Start the servers', 'Ship it!', 'Set  up', ' Plan', 'Plan '])
      expect(StepLabelSchema.safeParse(bad).success, bad).toBe(false);
  });

  it('AC-25: a list has 1 to 5 steps, no two labels or kinds alike, and a pull request only last', () => {
    expect(SessionStepsSchema.safeParse(steps(['answer', 'Answer'])).success).toBe(true);
    const five = steps(
      ['setup', 'Set up'],
      ['run', 'Start server'],
      ['build', 'Fix env'],
      ['test', 'Test'],
      ['pull_request', 'Pull request'],
    );
    expect(SessionStepsSchema.safeParse(five).success).toBe(true);
    const refused = [
      [],
      [...five, { kind: 'review', label: 'Review' }],
      steps(['build', 'Fix'], ['test', 'Fix']),
      steps(['build', 'Fix env'], ['build', 'Fix tests']),
      steps(['pull_request', 'Pull request'], ['review', 'Review']),
    ];
    for (const list of refused) expect(SessionStepsSchema.safeParse(list).success, JSON.stringify(list)).toBe(false);
  });

  it('AC-25: says which rule a list broke, in words Claude can act on', () => {
    const result = SessionStepsSchema.safeParse(steps(['build', 'Fix'], ['test', 'Fix']));
    expect(result.error?.issues.map((issue) => issue.message)).toContain('Two steps are both called "Fix".');
  });

  it('AC-1, AC-15, AC-22, AC-24: holds the quick read, changed steps, a branch made late, a server, and a worktree with no branch', () => {
    const activities: SessionActivity[] = [
      {
        id: 'step-1',
        state: 'done',
        kind: 'reading',
        intent: 'run',
        base: 'develop',
        missingBase: null,
        branch: null,
        branchFrom: null,
        suggested: null,
        branchNote: null,
      },
      {
        id: 'step-2',
        state: 'done',
        kind: 'reading',
        intent: null,
        base: null,
        missingBase: null,
        branch: null,
        branchFrom: null,
        suggested: null,
        branchNote: null,
      },
      { id: 'step-3', state: 'done', kind: 'worktree', branch: null, base: 'origin/develop', fetched: true },
      {
        id: 'step-4',
        state: 'done',
        kind: 'steps_changed',
        from: [{ kind: 'setup', label: 'Set up' }],
        to: [
          { kind: 'setup', label: 'Set up' },
          { kind: 'build', label: 'Fix env' },
        ],
        reason: 'The server fails on a missing env key.',
      },
      { id: 'step-5', state: 'done', kind: 'branch_made', branch: 'fix/env-key', from: 'repo_rules' },
      { id: 'step-6', state: 'done', kind: 'server', event: 'started', port: 3005, command: 'next dev --port 3005' },
      { id: 'step-7', state: 'done', kind: 'server', event: 'exited', port: null, command: 'next dev' },
    ];
    expect(makeSession({ activities }).activities).toEqual(activities);
  });

  it('AC-2: a server approval carries the command, its folder and the Always allow entry', () => {
    const approval = SessionApprovalSchema.parse({
      id: 'approval-9',
      askedAt: '2026-10-20T10:15:00.000Z',
      kind: 'server',
      command: 'next dev --port 3005',
      folder: 'apps/web',
      alwaysAllow: 'server:2e44184c6076885d',
    });
    expect(approval).toMatchObject({ kind: 'server', folder: 'apps/web' });
    const waiting = {
      id: 's',
      state: 'running',
      kind: 'waiting',
      approvalId: 'approval-9',
      about: 'server',
      text: null,
    };
    expect(makeSession({ activities: [waiting as SessionActivity] }).activities[0]).toMatchObject({ about: 'server' });
  });
});

describe('a session after its pull request (spec 047)', () => {
  const pullRequest = {
    number: 2841,
    url: 'https://github.com/acme/web-app/pull/2841',
    repository: 'acme/web-app',
    openedAt: '2026-10-16T10:30:00.000Z',
  };

  it('AC-11, AC-14: is PR merged or PR closed, keeping its pull request', () => {
    for (const state of ['pr_merged', 'pr_closed'] as const) {
      const session = SessionSchema.parse(makeSession({ state, step: 'pull_request', pullRequest }));
      expect(session).toMatchObject({ state, pullRequest });
      expect(makeSessionList([{ state }]).sessions[0]?.state).toBe(state);
    }
  });
});
