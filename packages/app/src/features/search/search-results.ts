import type { SearchIndex, SearchPullRequest, SearchTicket, SessionSummary } from '@devhub/contracts';
import { sessionStateLabels } from '@devhub/ui';
import { plural } from '../../words/calendar.ts';
import { matchesWords } from '../../words/match-words.ts';

/**
 * What ⌘K search shows for what was typed (spec 009): the matches in each group, in the order the server
 * sent them, with an exact key or number first, at most 6 a group. All in the browser: typing never asks
 * the server.
 */

/** At most this many results a group (Q2b); typing more narrows it. */
export const perGroup = 6;

export type SearchHit =
  | { kind: 'ticket'; id: string; ticket: SearchTicket }
  | { kind: 'pull_request'; id: string; pullRequest: SearchPullRequest }
  | { kind: 'session'; id: string; session: SessionSummary };

export type SearchGroupKind = 'tickets' | 'pull_requests' | 'sessions';

export interface SearchGroupResult {
  kind: SearchGroupKind;
  /** "Tickets", or "Tickets · 6 of 23" when more match than it shows. */
  label: string;
  hits: SearchHit[];
  /** Every match in the group, shown or not. */
  total: number;
}

const groupNames: Record<SearchGroupKind, string> = {
  tickets: 'Tickets',
  pull_requests: 'Pull requests',
  sessions: 'Sessions',
};

const hash = (number: number) => `#${String(number)}`;

/** A session's ticket key or pull request, as the sidebar writes it: "PROJ-1423" or "PR #2836". */
function sessionSource(session: SessionSummary): string | null {
  if (session.source === null) return null;
  return session.source.kind === 'jira' ? session.source.key : `PR ${hash(session.source.number)}`;
}

/** Everything a hit is matched on (spec 009's assumptions). */
function searchText(hit: SearchHit): string {
  switch (hit.kind) {
    case 'ticket':
      return [hit.ticket.key, hit.ticket.title, hit.ticket.status].join(' ');
    case 'pull_request': {
      const { title, repository, number, author } = hit.pullRequest;
      return [title, repository, hash(number), author ?? ''].join(' ');
    }
    case 'session':
      return [hit.session.title, sessionSource(hit.session) ?? '', sessionStateLabels[hit.session.state]].join(' ');
  }
}

/** What was typed is exactly this hit's key or number, so it goes first in its group (AC-7). */
function isExact(hit: SearchHit, query: string): boolean {
  const typed = query.trim().toLowerCase();
  const number = typed.startsWith('#') ? typed.slice(1) : typed;
  switch (hit.kind) {
    case 'ticket':
      return hit.ticket.key.toLowerCase() === typed;
    case 'pull_request':
      return String(hit.pullRequest.number) === number;
    case 'session': {
      const source = hit.session.source;
      if (source === null) return false;
      return source.kind === 'jira' ? source.key.toLowerCase() === typed : String(source.number) === number;
    }
  }
}

function group(kind: SearchGroupKind, hits: SearchHit[], query: string): SearchGroupResult {
  const found = hits.filter((hit) => matchesWords(searchText(hit), query));
  const ordered = [...found.filter((hit) => isExact(hit, query)), ...found.filter((hit) => !isExact(hit, query))];
  const shown = ordered.slice(0, perGroup);
  const name = groupNames[kind];
  return {
    kind,
    label: found.length > shown.length ? `${name} · ${String(shown.length)} of ${String(found.length)}` : name,
    hits: shown,
    total: found.length,
  };
}

/** The groups with matches, always in the order Tickets, Pull requests, Sessions (Q2a). Nothing typed finds nothing. */
export function searchResults(index: SearchIndex, query: string): SearchGroupResult[] {
  if (query.trim() === '') return [];
  return [
    group(
      'tickets',
      index.tickets.map((ticket) => ({ kind: 'ticket', id: `ticket:${ticket.key}`, ticket })),
      query,
    ),
    group(
      'pull_requests',
      index.pullRequests.map((pullRequest) => ({ kind: 'pull_request', id: `pull:${pullRequest.id}`, pullRequest })),
      query,
    ),
    group(
      'sessions',
      index.sessions.map((session) => ({ kind: 'session', id: `session:${session.id}`, session })),
      query,
    ),
  ].filter((found) => found.total > 0);
}

/** What a screen reader hears once typing pauses (Q5g): every match, shown or not. */
export function resultCount(groups: readonly SearchGroupResult[]): string {
  const total = groups.reduce((sum, found) => sum + found.total, 0);
  return total === 0 ? 'No results' : plural(total, 'result');
}

export interface HitText {
  /** The key or "web-app #2841", in mono; empty for a session started from neither. */
  code: string;
  title: string;
  /** The status, author or state; null when there's none. */
  meta: string | null;
}

/** A result's words (Q3c): ticket key, title and status; repository and number, title and author; source, title and state. */
export function hitText(hit: SearchHit): HitText {
  switch (hit.kind) {
    case 'ticket': {
      const { key, title, status } = hit.ticket;
      return { code: key, title, meta: status === '' ? null : status };
    }
    case 'pull_request': {
      const { repository, number, title, author } = hit.pullRequest;
      return { code: `${repository} ${hash(number)}`, title, meta: author };
    }
    case 'session':
      return {
        code: sessionSource(hit.session) ?? '',
        title: hit.session.title,
        meta: sessionStateLabels[hit.session.state],
      };
  }
}
