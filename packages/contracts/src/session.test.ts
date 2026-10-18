import { describe, expect, it } from 'vitest';
import {
  apiRoutes,
  RespondToApprovalRequestSchema,
  ServerEventSchema,
  SessionApprovalSchema,
  SessionIdSchema,
  SessionListQuerySchema,
  SessionListSchema,
  SessionSchema,
  StartSessionAnswerSchema,
  StartSessionRequestSchema,
  type SessionActivity,
} from './index.ts';
import { makeSession, makeSessionApproval, makeSessionList, makeSessionSummary } from './testing.ts';

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

describe('SessionListQuerySchema', () => {
  it('AC-15: reads the limit from a query string', () => {
    expect(SessionListQuerySchema.parse({ limit: '5' })).toEqual({ limit: 5 });
    expect(SessionListQuerySchema.parse({})).toEqual({});
  });

  it('AC-15: rejects a limit below 1', () => {
    expect(SessionListQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
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
        { id: 'a2', state: 'done', kind: 'brief', key: 'PROJ-1423' },
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
      { id: 'a1', state: 'done', kind: 'discarded', branch: 'feat/PROJ-1423' },
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
