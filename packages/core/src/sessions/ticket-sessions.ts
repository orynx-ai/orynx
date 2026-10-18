import type { SessionSummary, Ticket } from '@devhub/contracts';

/**
 * The newest session on each ticket, unless that one was stopped (spec 008, Q4c). Tickets and search
 * (spec 009) both open a ticket's session by this rule.
 */
export function sessionsByTicket(sessions: readonly SessionSummary[]): Map<string, Ticket['session']> {
  const newest = new Map<string, SessionSummary>();
  for (const session of sessions) {
    if (session.source?.kind !== 'jira') continue;
    const seen = newest.get(session.source.key);
    if (seen === undefined || Date.parse(session.updatedAt) > Date.parse(seen.updatedAt)) {
      newest.set(session.source.key, session);
    }
  }
  const joined = new Map<string, Ticket['session']>();
  for (const [key, session] of newest) {
    if (session.state !== 'stopped') joined.set(key, { id: session.id, state: session.state });
  }
  return joined;
}
