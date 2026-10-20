import { describe, expect, it } from 'vitest';
import { makeSessionSummary } from '@devhub/contracts/testing';
import { sessionsByTicket } from './ticket-sessions.ts';

describe('sessionsByTicket', () => {
  it('joins each ticket to its newest session, never to an Ask session (spec 026)', () => {
    const build = makeSessionSummary({
      id: '0000000000000001',
      state: 'done',
      ready: 'push',
      source: { kind: 'jira', key: 'PROJ-1423' },
      updatedAt: '2026-10-19T09:00:00.000Z',
    });
    const ask = {
      ...makeSessionSummary({
        id: '0000000000000002',
        state: 'done',
        source: { kind: 'jira', key: 'PROJ-1423' },
        updatedAt: '2026-10-19T10:00:00.000Z',
      }),
      mode: 'ask' as const,
    };

    // With what it's ready for, so the ticket's chip says it as the sidebar does (spec 031).
    expect(sessionsByTicket([build, ask]).get('PROJ-1423')).toEqual({
      id: '0000000000000001',
      state: 'done',
      ready: 'push',
    });
    expect(sessionsByTicket([ask]).has('PROJ-1423')).toBe(false);
  });
});
