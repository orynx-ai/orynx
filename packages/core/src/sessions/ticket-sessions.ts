import type { Session, SessionSummary, Ticket } from '@devhub/contracts';

/**
 * The newest session on each ticket that isn't Stopped (spec 008, Q4c; spec 047, AC-5: a ticket can have several).
 * Tickets and search (spec 009) both open a ticket's session by this rule. An Ask session never holds its ticket
 * (spec 026).
 */
export function sessionsByTicket(
  sessions: readonly (SessionSummary & { mode?: Session['mode'] })[],
): Map<string, Ticket['session']> {
  const newest = new Map<string, SessionSummary>();
  for (const session of sessions) {
    if (session.source?.kind !== 'jira' || session.mode === 'ask' || session.state === 'stopped') continue;
    const seen = newest.get(session.source.key);
    if (seen === undefined || Date.parse(session.updatedAt) > Date.parse(seen.updatedAt)) {
      newest.set(session.source.key, session);
    }
  }
  const joined = new Map<string, Ticket['session']>();
  for (const [key, session] of newest) {
    // Never true, as stopped sessions were skipped; it tells TypeScript the state isn't 'stopped'.
    if (session.state !== 'stopped') joined.set(key, { id: session.id, state: session.state, ready: session.ready });
  }
  return joined;
}
