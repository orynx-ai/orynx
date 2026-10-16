import { describe, expect, it } from 'vitest';
import { apiRoutes, ServerEventSchema, SessionListQuerySchema, SessionListSchema, StatusSchema } from './index.ts';
import { makeSessionList, makeSessionSummary, makeStatus } from './testing.ts';

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

describe('StatusSchema user', () => {
  it('AC-16: carries the name DevHub knows, or null', () => {
    expect(StatusSchema.parse(makeStatus({ user: { name: 'Rakesh Dhariwal' } })).user.name).toBe('Rakesh Dhariwal');
    expect(makeStatus().user.name).toBeNull();
  });
});
