import { describe, expect, it } from 'vitest';
import type { InboxItem } from '@devhub/contracts';
import { makeInboxItem } from '@devhub/contracts/testing';
import { HomeSearchSchema } from './inbox-tabs.ts';
import {
  defaultView,
  filterMenus,
  pageSize,
  searchFor,
  searchForTab,
  showView,
  viewOf,
  type HomeView,
} from './inbox-view.ts';

const ticket = (key: string, title: string, status: string, waited: string, overrides: Partial<InboxItem> = {}) =>
  makeInboxItem({
    id: `jira:${key}`,
    source: 'jira',
    tab: 'jira',
    title,
    subject: { kind: 'issue', key, status, highPriorityBug: false },
    reason: { kind: 'status', category: status === 'To Do' ? 'to_do' : 'in_progress' },
    waitingSince: waited,
    target: { kind: 'external', url: `https://acme.atlassian.net/browse/${key}` },
    ...overrides,
  });

const pull = (repository: string, number: number, title: string, waited: string, overrides: Partial<InboxItem> = {}) =>
  makeInboxItem({
    id: `github:acme/${repository}/${String(number)}`,
    title,
    subject: { kind: 'pull_request', repository, number, author: 'Priya Sharma', mine: false },
    waitingSince: waited,
    target: { kind: 'external', url: `https://github.com/acme/${repository}/pull/${String(number)}/files` },
    ...overrides,
  });

const archive = ticket('PROJ-1423', 'Add bulk archive to the content list', 'In Progress', '2026-10-15T09:00:00.000Z');
const guests = ticket('PS-77', 'Search returns archived sites for guest users', 'To Do', '2026-10-12T09:00:00.000Z');
const people = pull('web-app', 2841, 'Lazy-load the people directory', '2026-10-16T09:00:00.000Z');
const failing = pull('api', 977, 'Rate-limit the export endpoint', '2026-10-17T06:00:00.000Z', {
  subject: { kind: 'pull_request', repository: 'api', number: 977, author: null, mine: true },
  reason: { kind: 'checks_failing' },
});
const everyRow = [guests, archive, people, failing];

const view = (overrides: Partial<HomeView> = {}): HomeView => ({ ...defaultView, ...overrides });
const titles = (items: readonly InboxItem[]) => items.map((item) => item.title);

describe('the address', () => {
  it('Q10i: reads every part of the view from the address, and leaves out what is the default', () => {
    const search = HomeSearchSchema.parse({
      inbox: 'jira',
      q: 'bulk archive',
      reason: 'in-progress,to-do',
      project: 'PROJ',
      status: 'In Progress',
      sort: 'longest',
      page: 3,
    });

    const read = viewOf(search);

    expect(read).toEqual({
      tab: 'jira',
      query: 'bulk archive',
      filters: { reason: ['in-progress', 'to-do'], project: ['PROJ'], status: ['In Progress'], repo: [] },
      order: 'longest',
      page: 3,
    });
    expect(searchFor(read)).toEqual(search);
    expect(searchFor(defaultView)).toEqual({});
  });

  it('Q10i: ignores what it cannot read, so a hand-typed address still opens', () => {
    const search = HomeSearchSchema.parse({ inbox: 'slack', sort: 'oldest', page: 'two', q: 2841, reason: ',,' });

    expect(viewOf(search)).toEqual({ ...defaultView, query: '2841' });
  });

  it('AC-41, Q10h: switching tabs keeps the search and the order, and drops the filters and the page', () => {
    const on = view({
      query: 'archive',
      order: 'longest',
      page: 2,
      filters: { reason: ['checks-failing'], project: [], status: [], repo: ['api'] },
    });

    expect(viewOf(searchForTab(searchFor(on), 'jira'))).toEqual(
      view({ tab: 'jira', query: 'archive', order: 'longest' }),
    );
    expect(searchForTab(searchFor(on), 'all')).toEqual({ q: 'archive', sort: 'longest' });
  });
});

describe('showView', () => {
  it('AC-39: puts the newest wait first by default, and the longest wait first when asked', () => {
    expect(titles(showView(everyRow, view()).rows)).toEqual([failing.title, people.title, archive.title, guests.title]);
    expect(titles(showView(everyRow, view({ order: 'longest' })).rows)).toEqual([
      guests.title,
      archive.title,
      people.title,
      failing.title,
    ]);
  });

  it.each([
    ['archive', [guests.title, archive.title]],
    ['ARCHIVE content', [archive.title]],
    ['proj-1423', [archive.title]],
    ['2841', [people.title]],
    ['web-app #2841', [people.title]],
    ['web-app', [people.title]],
    ['priya', [people.title]],
    ['Priya S.', [people.title]],
    ['to do', [guests.title]],
    ['nothing like this', []],
  ])('AC-36, Q10a: "%s" matches the title, key, number, repository, author or status', (query, expected) => {
    expect(titles(showView(everyRow, view({ query, order: 'longest' })).rows)).toEqual(expected);
  });

  it('AC-37: ticks in one menu mean any of them, and menus together mean all of them', () => {
    const jira = (filters: Partial<HomeView['filters']>) =>
      titles(
        showView(everyRow, view({ tab: 'jira', order: 'longest', filters: { ...defaultView.filters, ...filters } }))
          .rows,
      );

    expect(jira({ status: ['To Do', 'In Progress'] })).toEqual([guests.title, archive.title]);
    expect(jira({ project: ['PROJ'], status: ['In Progress'] })).toEqual([archive.title]);
    expect(jira({ project: ['PS'], status: ['In Progress'] })).toEqual([]);
    expect(
      titles(
        showView(everyRow, view({ filters: { ...defaultView.filters, reason: ['checks-failing', 'to-do'] } })).rows,
      ),
    ).toEqual([failing.title, guests.title]);
  });

  it('AC-40: shows 16 rows a page, and says how many pages there are', () => {
    const many = Array.from({ length: 34 }, (_, index) =>
      ticket(
        `PROJ-${String(100 + index)}`,
        `Ticket ${String(index)}`,
        'To Do',
        new Date(Date.UTC(2026, 9, 1, index)).toISOString(),
      ),
    );

    const first = showView(many, view({ order: 'longest' }));
    expect(pageSize).toBe(16);
    expect(first).toMatchObject({ page: 1, pageCount: 3, matched: 34 });
    expect(titles(first.rows)).toEqual(Array.from({ length: 16 }, (_, index) => `Ticket ${String(index)}`));
    expect(titles(showView(many, view({ order: 'longest', page: 3 })).rows)).toEqual(['Ticket 32', 'Ticket 33']);
  });

  it('AC-41: a page past the end shows the last page, and an empty list is page 1 of 1', () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      ticket(
        `PROJ-${String(index)}`,
        `Ticket ${String(index)}`,
        'To Do',
        new Date(Date.UTC(2026, 9, 1, index)).toISOString(),
      ),
    );

    expect(showView(many, view({ page: 9 }))).toMatchObject({ page: 2, pageCount: 2 });
    expect(showView([], view({ page: 4 }))).toMatchObject({ page: 1, pageCount: 1, matched: 0, rows: [] });
  });

  it('AC-37: only shows the rows of the tab', () => {
    expect(titles(showView(everyRow, view({ tab: 'pull-requests', order: 'longest' })).rows)).toEqual([
      people.title,
      failing.title,
    ]);
  });
});

describe('filterMenus', () => {
  it('AC-35, Q10c: gives All a Reason menu, Jira Reason, Project and Status, and Pull requests Reason and Repository', () => {
    expect(filterMenus(everyRow, 'all', defaultView.filters).map((menu) => menu.label)).toEqual(['Reason']);
    expect(filterMenus(everyRow, 'jira', defaultView.filters).map((menu) => menu.label)).toEqual([
      'Reason',
      'Project',
      'Status',
    ]);
    expect(filterMenus(everyRow, 'pull-requests', defaultView.filters).map((menu) => menu.label)).toEqual([
      'Reason',
      'Repository',
    ]);
  });

  it("AC-37, Q10c: offers only what the tab's rows have, reasons in the pills' order and the rest A to Z", () => {
    const [reason, project, status] = filterMenus(everyRow, 'jira', defaultView.filters);

    expect(reason?.options).toEqual([
      { value: 'to-do', label: 'To do' },
      { value: 'in-progress', label: 'In progress' },
    ]);
    expect(project?.options).toEqual([
      { value: 'PROJ', label: 'PROJ' },
      { value: 'PS', label: 'PS' },
    ]);
    expect(status?.options).toEqual([
      { value: 'In Progress', label: 'In Progress' },
      { value: 'To Do', label: 'To Do' },
    ]);
    const [allReasons] = filterMenus(everyRow, 'all', defaultView.filters);
    expect(allReasons?.options.map((option) => option.label)).toEqual([
      'Review requested',
      'Checks failing',
      'To do',
      'In progress',
    ]);
  });

  it('AC-37: keeps a ticked option that no row has any more, so it can be unticked', () => {
    const [, repository] = filterMenus(everyRow, 'pull-requests', { ...defaultView.filters, repo: ['mobile'] });

    expect(repository?.options.map((option) => option.value)).toEqual(['api', 'mobile', 'web-app']);
    expect(repository?.ticked).toEqual(['mobile']);
  });
});
