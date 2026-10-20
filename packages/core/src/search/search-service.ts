import type {
  SearchIndex,
  SearchPullRequest,
  SearchTicket,
  SearchTicketTarget,
  SessionSummary,
  Ticket,
  Tickets,
} from '@devhub/contracts';
import type { InboxRecords } from '../inbox/inbox-service.ts';
import type { PullRequestRecord } from '../integrations/github/map.ts';
import type { JiraIssueRecord } from '../integrations/jira/map.ts';
import type { SessionStore } from '../sessions/session-store.ts';
import { sessionsByTicket } from '../sessions/ticket-sessions.ts';

/**
 * ⌘K search (spec 009): everything DevHub holds that search can find, read from the cache and the session
 * store, never from Jira or GitHub. The inbox rules don't apply (AC-17). The browser does the matching.
 */
export interface SearchService {
  read(): Promise<SearchIndex>;
}

export interface SearchServiceOptions {
  /** What the last sync kept for each connected tool: assigned issues and open pull requests. */
  inbox: { records(): Promise<InboxRecords> };
  /** The current sprint (spec 008). */
  tickets: { read(): Promise<Tickets> };
  sessions: SessionStore;
}

/** What the index is made from. */
export interface SearchSources {
  /** Issues assigned to you that aren't Done (spec 007). */
  assigned: readonly JiraIssueRecord[];
  /** The sprint's tickets in Jira's rank order (spec 008). */
  sprint: readonly Ticket[];
  pullRequests: readonly PullRequestRecord[];
  sessions: readonly SessionSummary[];
  tools: InboxRecords['tools'];
}

/** Keys in the order a person counts them: PROJ-7 before PROJ-1377. */
const byKey = new Intl.Collator('en', { numeric: true });

function ticketTarget(url: string, session: Ticket['session'] | undefined): SearchTicketTarget {
  return session === undefined || session === null
    ? { kind: 'external', url }
    : { kind: 'session', sessionId: session.id };
}

/** When a pull request opened, in milliseconds; one cached before DevHub kept it comes last. */
function opened(record: PullRequestRecord): number {
  return record.openedAt === null ? Number.NEGATIVE_INFINITY : Date.parse(record.openedAt);
}

/** Tickets (the sprint, then the other assigned issues by key), pull requests and sessions, each newest first. */
export function searchIndex(sources: SearchSources): SearchIndex {
  const joined = sessionsByTicket(sources.sessions);
  const inSprint = new Set(sources.sprint.map((ticket) => ticket.key));
  const tickets: SearchTicket[] = [
    // A row with no link is an Orynx ticket (spec 037), which has no page on a Jira site to open.
    ...sources.sprint.flatMap(({ key, title, status, url }) =>
      url === null ? [] : [{ key, title, status, target: ticketTarget(url, joined.get(key)) }],
    ),
    ...sources.assigned
      .filter((record) => !inSprint.has(record.key))
      .sort((a, b) => byKey.compare(a.key, b.key))
      .map((record) => ({
        key: record.key,
        title: record.summary,
        status: record.status,
        target: ticketTarget(record.url, joined.get(record.key)),
      })),
  ];
  const pullRequests: SearchPullRequest[] = [...sources.pullRequests]
    .sort((a, b) => opened(b) - opened(a) || a.id.localeCompare(b.id))
    .map(({ id, repository, number, title, author, url }) => ({ id, repository, number, title, author, url }));
  const sessions = [...sources.sessions].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return { tickets, pullRequests, sessions, tools: sources.tools };
}

export function createSearchService(options: SearchServiceOptions): SearchService {
  return {
    async read() {
      const [records, sprint, sessions] = await Promise.all([
        options.inbox.records(),
        options.tickets.read(),
        options.sessions.list(),
      ]);
      return searchIndex({
        assigned: records.jira,
        sprint: sprint.tickets,
        pullRequests: records.github,
        sessions,
        tools: records.tools,
      });
    },
  };
}
