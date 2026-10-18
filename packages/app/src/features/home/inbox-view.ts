import type { InboxItem } from '@devhub/contracts';
import { personName } from '../../shell/person-name.ts';
import { matchesWords } from '../../words/match-words.ts';
import { itemsInTab, type HomeSearch, type HomeTab } from './inbox-tabs.ts';

/**
 * What the list shows of a tab's rows (spec 007, amended by Q9 and Q10): the search, the filters, the order
 * and the page. It all happens in the browser, on the rows the page already has, and it all lives in the
 * address.
 */

export const pageSize = 16;

export const filterKeys = ['reason', 'project', 'status', 'repo'] as const;
export type FilterKey = (typeof filterKeys)[number];
export type Filters = Record<FilterKey, string[]>;

export interface HomeView {
  tab: HomeTab;
  query: string;
  filters: Filters;
  order: 'newest' | 'longest';
  page: number;
}

export const defaultView: HomeView = {
  tab: 'all',
  query: '',
  filters: { reason: [], project: [], status: [], repo: [] },
  order: 'newest',
  page: 1,
};

/** A comma list's values, each once. */
function commaList(raw: string | undefined): string[] {
  const values = (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');
  return [...new Set(values)];
}

/**
 * The view the address asks for. Only the tab's own filters count, and only reasons that exist, so an old or
 * hand-typed address never hides rows behind a tick no menu shows.
 */
export function viewOf(search: HomeSearch): HomeView {
  const tab = search.inbox ?? 'all';
  const own = (key: FilterKey) => (tabFilters[tab].includes(key) ? commaList(search[key]) : []);
  return {
    tab,
    query: search.q ?? '',
    filters: {
      reason: own('reason').filter((value) => reasons.some((reason) => reason.value === value)),
      project: own('project'),
      status: own('status'),
      repo: own('repo'),
    },
    order: search.sort === 'longest' ? 'longest' : 'newest',
    page: search.page ?? 1,
  };
}

/** The address for a view, leaving out each part that is the default (Q10i). */
export function searchFor(view: HomeView): HomeSearch {
  const search: HomeSearch = {};
  if (view.tab !== 'all') search.inbox = view.tab;
  if (view.query !== '') search.q = view.query;
  for (const key of filterKeys) if (view.filters[key].length > 0) search[key] = view.filters[key].join(',');
  if (view.order === 'longest') search.sort = 'longest';
  if (view.page > 1) search.page = view.page;
  return search;
}

/** Another tab keeps the search and the order; the filters belong to the tab they were ticked on (Q10h). */
export function searchForTab(search: HomeSearch, tab: HomeTab): HomeSearch {
  const { query, order } = viewOf(search);
  return searchFor({ ...defaultView, tab, query, order });
}

/** Reason's options, in the order of the pills' words (Q10c). */
const reasons = [
  { value: 'review-requested', label: 'Review requested' },
  { value: 'checks-failing', label: 'Checks failing' },
  { value: 'unresolved-comments', label: 'Unresolved comments' },
  { value: 'approval', label: 'Approve command' },
  { value: 'due', label: 'Due or overdue' },
  { value: 'bug', label: 'Bug' },
  { value: 'to-do', label: 'To do' },
  { value: 'in-progress', label: 'In progress' },
] as const;

function reasonOf(item: InboxItem): string {
  const { reason } = item;
  switch (reason.kind) {
    case 'review_requested':
      return 'review-requested';
    case 'checks_failing':
      return 'checks-failing';
    case 'unresolved_comments':
      return 'unresolved-comments';
    case 'status':
      return reason.category === 'to_do' ? 'to-do' : 'in-progress';
    case 'approval':
    case 'due':
    case 'bug':
      return reason.kind;
  }
}

/** The Jira key a row is about, if any: its own, or the ticket its session works on. */
function jiraKeyOf(item: InboxItem): string | null {
  const { subject } = item;
  if (subject.kind === 'issue') return subject.key;
  if (subject.kind === 'session' && subject.source?.kind === 'jira') return subject.source.key;
  return null;
}

/** The values a row has for each filter; a row with none for a filter never matches a tick in it. */
function valuesOf(item: InboxItem): Record<FilterKey, string | null> {
  const { subject } = item;
  const key = jiraKeyOf(item);
  return {
    reason: reasonOf(item),
    project: key === null ? null : (key.split('-')[0] ?? null),
    status: subject.kind === 'issue' && subject.status !== '' ? subject.status : null,
    repo: subject.kind === 'pull_request' ? subject.repository : null,
  };
}

/** Everything a search looks through (Q10a): the title, key, number, repository, author and status. */
function searchText(item: InboxItem): string {
  const { subject } = item;
  const parts = [item.title, jiraKeyOf(item) ?? ''];
  if (subject.kind === 'issue') parts.push(subject.status);
  if (subject.kind === 'pull_request') {
    parts.push(subject.repository, `#${String(subject.number)}`);
    if (subject.author !== null) parts.push(subject.author, personName(subject.author).short);
  }
  if (subject.kind === 'session' && subject.source?.kind === 'pull_request') {
    parts.push(`#${String(subject.source.number)}`);
  }
  return parts.join(' ');
}

/** Every word typed must be found, ignoring case (Q10a). */
function matchesQuery(item: InboxItem, query: string): boolean {
  return matchesWords(searchText(item), query);
}

/** Ticks in one filter mean any of them; filters together mean all of them (AC-37). */
function matchesFilters(item: InboxItem, filters: Filters): boolean {
  const values = valuesOf(item);
  return filterKeys.every((key) => {
    const ticked = filters[key];
    const value = values[key];
    return ticked.length === 0 || (value !== null && ticked.includes(value));
  });
}

function byWait(order: HomeView['order']) {
  const sign = order === 'newest' ? -1 : 1;
  return (a: InboxItem, b: InboxItem) =>
    sign * (Date.parse(a.waitingSince) - Date.parse(b.waitingSince)) || a.id.localeCompare(b.id);
}

export interface ShownView<Item> {
  /** The rows on this page, in order. */
  rows: Item[];
  /** The page shown: the one asked for, or the last when that's past the end (AC-41). */
  page: number;
  pageCount: number;
}

/** The tab's rows that match the search and filters, in the view's order, across every page. */
function matchingRows<Item extends InboxItem>(items: readonly Item[], view: HomeView): Item[] {
  return itemsInTab(items, view.tab)
    .filter((item) => matchesQuery(item, view.query) && matchesFilters(item, view.filters))
    .sort(byWait(view.order));
}

/** The rows a view shows: the tab's, searched, filtered, ordered and cut into pages of 16. */
export function showView<Item extends InboxItem>(items: readonly Item[], view: HomeView): ShownView<Item> {
  const matched = matchingRows(items, view);
  const pageCount = Math.max(1, Math.ceil(matched.length / pageSize));
  const page = Math.min(Math.max(1, view.page), pageCount);
  return { rows: matched.slice((page - 1) * pageSize, page * pageSize), page, pageCount };
}

export interface FilterMenu {
  key: FilterKey;
  label: string;
  options: { value: string; label: string }[];
  ticked: string[];
}

const menuLabels: Record<FilterKey, string> = {
  reason: 'Reason',
  project: 'Project',
  status: 'Status',
  repo: 'Repository',
};

/** Each tab's filters (Q9a): Reason everywhere, Project and Status on Jira, Repository on Pull requests. */
const tabFilters: Record<HomeTab, readonly FilterKey[]> = {
  all: ['reason'],
  jira: ['reason', 'project', 'status'],
  'pull-requests': ['reason', 'repo'],
};

/**
 * The tab's filter menus. Each offers what the tab's rows have, plus anything still ticked that no row has
 * any more, so it can be unticked. Reasons keep the pills' order; the rest go A to Z (Q10c).
 */
export function filterMenus(items: readonly InboxItem[], tab: HomeTab, filters: Filters): FilterMenu[] {
  const rows = itemsInTab(items, tab);
  return tabFilters[tab].map((key) => {
    const present = new Set(rows.map((item) => valuesOf(item)[key]).filter((value) => value !== null));
    const ticked = filters[key];
    const offered = new Set([...present, ...ticked]);
    const options =
      key === 'reason'
        ? reasons.filter((reason) => offered.has(reason.value)).map(({ value, label }) => ({ value, label }))
        : [...offered].sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }));
    return { key, label: menuLabels[key], options, ticked };
  });
}
