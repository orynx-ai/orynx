import { z } from 'zod';
import type { SessionMode, SessionState, SessionSummary } from '@devhub/contracts';
import { sourceLabel } from './source-label.ts';

/**
 * The Sessions page's search and filters (spec 039), in the address so a reload keeps them:
 * `/sessions?q=failing&status=done,stopped&kind=ask`. Only what differs from the default is written.
 */
export const SessionsSearchSchema = z.object({
  q: z.string().max(200).optional().catch(undefined),
  status: z.string().optional().catch(undefined),
  kind: z.string().optional().catch(undefined),
});
export type SessionsSearch = z.infer<typeof SessionsSearchSchema>;

/** Status's options, in the sidebar's words; "Done" is one, whatever it's ready for. */
export const statusOptions: readonly { value: SessionState; label: string }[] = [
  { value: 'working', label: 'Working' },
  { value: 'needs_you', label: 'Needs you' },
  { value: 'done', label: 'Done' },
  { value: 'pr_open', label: 'PR open' },
  { value: 'pr_merged', label: 'PR merged' },
  { value: 'pr_closed', label: 'PR closed' },
  { value: 'stopped', label: 'Stopped' },
];

/** Kind's options (spec 031). */
export const kindOptions: readonly { value: SessionMode; label: string }[] = [
  { value: 'ask', label: 'Ask' },
  { value: 'build', label: 'Build' },
];

export interface SessionFilters {
  /** The title, the ticket key or the pull request holds it, in any case. */
  q: string;
  /** Nothing ticked lets every state through. */
  status: SessionState[];
  kind: SessionMode[];
}

export const noSessionFilters: SessionFilters = { q: '', status: [], kind: [] };

function listOf<T extends string>(raw: string | undefined, allowed: readonly { value: T }[]): T[] {
  const values = new Set((raw ?? '').split(','));
  return allowed.map((option) => option.value).filter((value) => values.has(value));
}

export function sessionFiltersFromSearch(search: SessionsSearch): SessionFilters {
  return { q: search.q ?? '', status: listOf(search.status, statusOptions), kind: listOf(search.kind, kindOptions) };
}

export function searchFromSessionFilters({ q, status, kind }: SessionFilters): SessionsSearch {
  return {
    ...(q === '' ? {} : { q }),
    ...(status.length === 0 ? {} : { status: status.join(',') }),
    ...(kind.length === 0 ? {} : { kind: kind.join(',') }),
  };
}

export function hasSessionFilters({ q, status, kind }: SessionFilters): boolean {
  return q.trim() !== '' || status.length > 0 || kind.length > 0;
}

/** Whether a session passes: its title, ticket key or pull request ("PR #2836") holds the search, and its ticks. */
export function matchesSession(session: SessionSummary, { q, status, kind }: SessionFilters): boolean {
  if (status.length > 0 && !status.includes(session.state)) return false;
  if (kind.length > 0 && !kind.includes(session.mode)) return false;
  const text = q.trim().toLowerCase();
  if (text === '') return true;
  return [session.title, sourceLabel(session.source) ?? ''].some((field) => field.toLowerCase().includes(text));
}
