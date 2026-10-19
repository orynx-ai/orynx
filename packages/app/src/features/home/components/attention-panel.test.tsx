import { act, screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes, type Inbox, type InboxItem } from '@devhub/contracts';
import { makeInbox, makeInboxItem, makePreferences, makeRepository, makeStatus } from '@devhub/contracts/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

// The design's rows, longest wait first as the server sends them, seen at noon on 17 Oct 2026.
const review = makeInboxItem();
const ticket = makeInboxItem({
  id: 'jira:PROJ-1423',
  source: 'jira',
  tab: 'jira',
  title: 'Add bulk archive to the content list',
  subject: { kind: 'issue', key: 'PROJ-1423', status: 'In progress', highPriorityBug: false },
  reason: { kind: 'status', category: 'in_progress' },
  waitingSince: '2026-10-15T12:00:00.000Z',
  target: { kind: 'external', url: 'https://acme.atlassian.net/browse/PROJ-1423' },
});
const comments = makeInboxItem({
  id: 'github:acme/api#77',
  title: 'Return 207 for partial archive failures',
  subject: { kind: 'pull_request', repository: 'api', number: 77, author: 'Rakesh Dhariwal', mine: true },
  reason: { kind: 'unresolved_comments', count: 2 },
  waitingSince: '2026-10-16T11:00:00.000Z',
  target: { kind: 'external', url: 'https://github.com/acme/api/pull/77' },
});
const checks = makeInboxItem({
  id: 'github:acme/web-app/pull/2836',
  title: 'Fix timezone shift in event cards',
  subject: { kind: 'pull_request', repository: 'web-app', number: 2836, author: 'Rakesh Dhariwal', mine: true },
  reason: { kind: 'checks_failing' },
  waitingSince: '2026-10-17T09:00:00.000Z',
  target: { kind: 'external', url: 'https://github.com/acme/web-app/pull/2836/checks' },
});
const approval = makeInboxItem({
  id: 'jira:PROJ-1500',
  source: 'jira',
  tab: 'jira',
  title: 'Search returns archived sites for guest users',
  subject: { kind: 'issue', key: 'PROJ-1500', status: 'In progress', highPriorityBug: false },
  reason: { kind: 'approval' },
  waitingSince: '2026-10-17T11:55:00.000Z',
  target: { kind: 'session', sessionId: 'session-1' },
});
const everyRow = [review, ticket, comments, checks, approval];

function inboxWith(items: InboxItem[], overrides: Partial<Inbox> = {}) {
  server.use(http.get(apiUrl(apiRoutes.inbox), () => HttpResponse.json(makeInbox({ items, ...overrides }))));
}

function rulesOff(...rules: (keyof ReturnType<typeof makePreferences>['inboxRules'])[]) {
  const inboxRules = Object.fromEntries(rules.map((rule) => [rule, false]));
  server.use(http.get(apiUrl(apiRoutes.preferences), () => HttpResponse.json(makePreferences({ inboxRules }))));
}

const synced = { state: 'synced', at: '2026-10-17T11:58:00.000Z' } as const;

async function openHome(route = '/') {
  const rendered = await renderApp({ route });
  const panel = screen.getByRole('region', { name: 'Needs your attention' });
  // Loading rows are hidden from screen readers, so the first row found is a real one.
  await within(panel).findAllByRole('listitem');
  // The rows come first; a pager, when there is one, is a list of its own after them.
  const [list] = within(panel).getAllByRole('list');
  if (list === undefined) throw new Error('No list of rows');
  return { ...rendered, panel, list };
}

/** The row whose title link has this name. */
function rowOf(title: string) {
  const row = screen.getByRole('link', { name: title }).closest('li');
  if (row === null) throw new Error(`No row for "${title}"`);
  return within(row);
}

beforeEach(() => {
  // Only the clock's date is fixed; timers stay real, so the network and the router run as usual.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-17T12:00:00.000Z'));
  inboxWith(everyRow);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AttentionPanel', () => {
  it('AC-1: shows the head, the three tabs with their counts, and one row per item, newest wait first', async () => {
    const { panel, list } = await openHome();

    expect(within(panel).getByRole('button', { name: 'Order: Newest first' })).toBeVisible();
    const tabs = within(panel).getByRole('tablist', { name: 'Filter by source' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['All 5', 'Jira 2', 'Pull requests 3']);
    expect(within(tabs).getByRole('tab', { name: 'All 5' })).toHaveAttribute('aria-selected', 'true');
    expect(within(tabs).queryByRole('tab', { name: /slack/i })).not.toBeInTheDocument();

    const titles = within(list)
      .getAllByRole('listitem')
      .map((row) => within(row).getAllByRole('link')[0]?.textContent);
    expect(titles).toEqual(everyRow.map((item) => item.title).reverse());
  });

  it("AC-1: names each row's tool for a screen reader and speaks the wait in words", async () => {
    await openHome();

    expect(rowOf('Lazy-load the people directory').getByText('GitHub')).toBeInTheDocument();
    expect(rowOf('Add bulk archive to the content list').getByText('Jira')).toBeInTheDocument();
    expect(rowOf('Lazy-load the people directory').getByText('Review requested, 2 days')).toBeInTheDocument();
    expect(rowOf('Lazy-load the people directory').getByText('Review requested · 2 d')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('AC-2: shows a Jira ticket with its sub line and reason, and its title opens it in Jira', async () => {
    const { user, platform } = await openHome();
    const row = rowOf('Add bulk archive to the content list');

    expect(row.getByText('PROJ-1423 · In progress')).toBeVisible();
    expect(row.getByText('In progress · 2 d')).toBeVisible();

    await user.click(row.getByRole('link', { name: 'Add bulk archive to the content list' }));

    expect(platform.openExternal).toHaveBeenCalledWith('https://acme.atlassian.net/browse/PROJ-1423');
  });

  it('AC-14 (spec 020), AC-15 (spec 011): an assigned issue has the Ship icon, which starts Claude on it and opens the session', async () => {
    const asked: unknown[] = [];
    server.use(
      http.get(apiUrl(apiRoutes.status), () =>
        HttpResponse.json(makeStatus({ agent: { id: 'claude', connected: true } })),
      ),
      http.get(apiUrl(apiRoutes.repositories), () =>
        HttpResponse.json({ repositories: [makeRepository({ jiraProject: 'PROJ' })] }),
      ),
      http.post(apiUrl(apiRoutes.sessions), async ({ request }) => {
        asked.push(await request.json());
        return HttpResponse.json({ result: 'started', sessionId: '0123456789abcdef' });
      }),
    );
    const { user, history } = await openHome();
    const row = rowOf('Add bulk archive to the content list');
    const ship = row.getByRole('button', { name: 'Ship PROJ-1423' });
    await user.hover(ship);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Ship');
    expect(row.getByRole('link', { name: 'Open PROJ-1423 in Jira' })).toHaveAttribute(
      'href',
      'https://acme.atlassian.net/browse/PROJ-1423',
    );

    await user.click(ship);

    expect(asked).toEqual([{ ticketKey: 'PROJ-1423' }]);
    expect(history.location.pathname).toBe('/sessions/0123456789abcdef');
  });

  it('AC-15: an issue with a live session has only Open session, which opens the session', async () => {
    inboxWith([{ ...ticket, target: { kind: 'session', sessionId: '0123456789abcdef' } }]);
    await openHome();
    const row = rowOf('Add bulk archive to the content list');
    expect(row.getByRole('link', { name: 'Open session: Add bulk archive to the content list' })).toHaveAttribute(
      'href',
      '/sessions/0123456789abcdef',
    );
    expect(row.queryByRole('button', { name: /^Ship / })).toBeNull();
  });

  it("AC-6, AC-15 (spec 020): shows a review request with its author, and Open in GitHub opens the pull request's Files tab", async () => {
    const { user, platform } = await openHome();
    const row = rowOf('Lazy-load the people directory');

    expect(row.getByText('web-app #2841 · by Priya S.')).toBeVisible();
    expect(row.getByText('Review requested · 2 d')).toBeVisible();
    const action = row.getByRole('link', { name: 'Open web-app #2841 in GitHub' });
    expect(action).toHaveAttribute('href', 'https://github.com/acme/web-app/pull/2841/files');

    await user.click(action);

    expect(platform.openExternal).toHaveBeenCalledWith('https://github.com/acme/web-app/pull/2841/files');
  });

  it("AC-9: shows your pull request's failing checks, and Open in GitHub goes to its Checks tab", async () => {
    const { user, platform } = await openHome();
    const row = rowOf('Fix timezone shift in event cards');

    expect(row.getByText('web-app #2836 · your pull request')).toBeVisible();
    expect(row.getByText('Checks failing · 3 h')).toBeVisible();

    await user.click(row.getByRole('link', { name: 'Open web-app #2836 in GitHub' }));

    expect(platform.openExternal).toHaveBeenCalledWith('https://github.com/acme/web-app/pull/2836/checks');
  });

  it('AC-10: shows the unresolved comments on your pull request, and Open in GitHub goes to the pull request', async () => {
    const { user, platform } = await openHome();
    const row = rowOf('Return 207 for partial archive failures');

    expect(row.getByText('api #77 · your pull request')).toBeVisible();
    expect(row.getByText('2 unresolved comments · 1 d')).toBeVisible();

    await user.click(row.getByRole('link', { name: 'Open api #77 in GitHub' }));

    expect(platform.openExternal).toHaveBeenCalledWith('https://github.com/acme/api/pull/77');
  });

  it("AC-12: shows a session waiting on your ticket in the ticket's row, and Open session goes to the session in Orynx", async () => {
    const { user, history, platform } = await openHome();
    const row = rowOf('Search returns archived sites for guest users');

    expect(row.getByText('Jira')).toBeInTheDocument();
    expect(row.getByText('PROJ-1500 · In progress')).toBeVisible();
    expect(row.getByText('Approve command · 5 min')).toBeVisible();

    await user.click(row.getByRole('link', { name: 'Open session: Search returns archived sites for guest users' }));

    expect(history.location.pathname).toBe('/sessions/session-1');
    expect(platform.openExternal).not.toHaveBeenCalled();
  });

  it('015 AC-24: a waiting session on no ticket or pull request leads with Orynx’s mark, in All', async () => {
    inboxWith([
      ...everyRow,
      makeInboxItem({
        id: 'session:session-9',
        source: null,
        tab: null,
        title: 'Add a CSV export to the reports page',
        subject: { kind: 'session', source: null },
        reason: { kind: 'approval' },
        waitingSince: '2026-10-17T11:50:00.000Z',
        target: { kind: 'session', sessionId: 'session-9' },
      }),
    ]);
    await openHome();
    const row = rowOf('Open session: Add a CSV export to the reports page');
    expect(row.getByText('Orynx')).toHaveClass('sr-only');
    expect(row.getByText('Approve command · 10 min')).toBeVisible();
  });

  it('AC-14: picks Jira with the arrow keys and Enter, shows only its rows, and puts it in the address', async () => {
    const { user, history, panel } = await openHome();
    const all = within(panel).getByRole('tab', { name: 'All 5' });

    act(() => {
      all.focus();
    });
    await user.keyboard('{ArrowRight}{Enter}');

    expect(within(panel).getByRole('tab', { name: 'Jira 2' })).toHaveAttribute('aria-selected', 'true');
    expect(history.location.search).toBe('?inbox=jira');
    const list = within(panel).getByRole('list');
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((row) => within(row).getAllByRole('link')[0]?.textContent),
    ).toEqual([approval.title, ticket.title]);
  });

  it("AC-14, AC-45: a reload stays on the tab in the address, and Tab goes from the selected tab into the tab's panel", async () => {
    const { user, panel } = await openHome('/?inbox=pull-requests');
    const selected = within(panel).getByRole('tab', { name: 'Pull requests 3' });

    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(within(panel).getAllByRole('listitem')).toHaveLength(3);

    act(() => {
      selected.focus();
    });
    await user.tab();

    expect(within(panel).getByRole('searchbox', { name: 'Search pull requests' })).toHaveFocus();
  });

  it('AC-14: going back to All takes the tab out of the address', async () => {
    const { user, history, panel } = await openHome('/?inbox=jira');

    await user.click(within(panel).getByRole('tab', { name: 'All 5' }));

    expect(history.location.search).toBe('');
    expect(within(panel).getAllByRole('listitem')).toHaveLength(5);
  });

  it('AC-14: an unknown tab in the address opens All', async () => {
    const { panel } = await openHome('/?inbox=slack');

    expect(within(panel).getByRole('tab', { name: 'All 5' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('AttentionPanel states', () => {
  /** Home on a tab, once the panel has something other than loading rows in it. */
  async function openTab(route: string, settled: string) {
    const rendered = await renderApp({ route });
    const panel = screen.getByRole('region', { name: 'Needs your attention' });
    await within(panel).findByText(settled);
    return { ...rendered, panel };
  }

  /** The sentence a link sits in, whole. */
  function sentenceOf(link: HTMLElement) {
    return link.closest('p')?.textContent;
  }

  it('AC-20: shows the tabs without counts and 5 loading rows while the first sync runs', async () => {
    inboxWith([], { tools: { jira: { state: 'syncing' }, github: { state: 'syncing' } }, syncedAt: null });
    await renderApp();
    const panel = screen.getByRole('region', { name: 'Needs your attention' });

    const list = await within(panel).findByRole('list');
    expect(list).toHaveAttribute('aria-busy', 'true');
    expect(within(list).getAllByRole('listitem', { hidden: true })).toHaveLength(5);
    expect(within(panel).getByRole('button', { name: 'Order: Newest first' })).toBeVisible();
    expect(
      within(panel)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['All', 'Jira', 'Pull requests']);
  });

  it('AC-20: shows the same loading rows while the list is on its way', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.inbox), async () => {
        await delay('infinite');
        return HttpResponse.json(makeInbox());
      }),
    );
    await renderApp();
    const panel = screen.getByRole('region', { name: 'Needs your attention' });

    expect(within(panel).getByRole('list')).toHaveAttribute('aria-busy', 'true');
    expect(within(panel).getAllByRole('listitem', { hidden: true })).toHaveLength(5);
    expect(within(panel).getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
  });

  it('AC-20: loads only the tab whose tool is still on its first sync, and leaves out its count', async () => {
    inboxWith([review], { tools: { jira: { state: 'syncing' }, github: synced }, syncedAt: null });
    const { user, panel } = await openTab('/', review.title);

    expect(
      within(panel)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['All 1', 'Jira', 'Pull requests 1']);

    await user.click(within(panel).getByRole('tab', { name: 'Jira' }));
    expect(within(panel).getByRole('list')).toHaveAttribute('aria-busy', 'true');
  });

  it('AC-22: says nothing needs you on each tab, in its own words, when nothing matches', async () => {
    inboxWith([]);
    const { user, panel } = await openTab('/', 'Nothing needs you');

    expect(
      within(panel).getByText('Tickets assigned to you and pull requests waiting on you show up here.'),
    ).toBeVisible();
    expect(
      within(panel)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['All 0', 'Jira 0', 'Pull requests 0']);

    await user.click(within(panel).getByRole('tab', { name: 'Jira 0' }));
    expect(within(panel).getByText('No Jira tickets need you')).toBeVisible();
    expect(within(panel).getByText("Tickets assigned to you that aren't done show up here.")).toBeVisible();

    await user.click(within(panel).getByRole('tab', { name: 'Pull requests 0' }));
    expect(within(panel).getByText('No pull requests need you')).toBeVisible();
    expect(
      within(panel).getByText(
        'Review requests, and your pull requests with failing checks or unresolved comments, show up here.',
      ),
    ).toBeVisible();
  });

  it("AC-23: says GitHub is not connected on its own tab only, and links to Settings' Connections", async () => {
    inboxWith([ticket], { tools: { jira: synced, github: { state: 'not_connected' } } });
    const { user, history, panel } = await openTab('/', ticket.title);

    expect(within(panel).queryByText(/GitHub is not connected/)).not.toBeInTheDocument();

    await user.click(within(panel).getByRole('tab', { name: 'Pull requests 0' }));
    const connect = within(panel).getByRole('link', { name: 'Connect it in Settings' });
    expect(sentenceOf(connect)).toBe('GitHub is not connected. Connect it in Settings.');
    expect(within(panel).queryByText('No pull requests need you')).not.toBeInTheDocument();

    await user.click(connect);
    expect(history.location.pathname).toBe('/settings/connections');
  });

  it("AC-24: keeps GitHub's last rows under a line that says it didn't answer, on its tab and on All", async () => {
    inboxWith([review, ticket], {
      tools: {
        jira: synced,
        github: { state: 'failed', problem: { kind: 'no_answer' }, lastSyncedAt: '2026-10-17T11:48:00.000Z' },
      },
    });
    const { user, panel } = await openTab('/', review.title);
    const line = "GitHub didn't answer. These are from 12 min ago.";

    expect(within(panel).getByText(line)).toBeVisible();
    expect(within(panel).getByRole('link', { name: ticket.title })).toBeVisible();

    await user.click(within(panel).getByRole('tab', { name: 'Pull requests 1' }));
    expect(within(panel).getByText(line)).toBeVisible();
    expect(within(panel).getByRole('link', { name: review.title })).toBeVisible();

    await user.click(within(panel).getByRole('tab', { name: 'Jira 1' }));
    expect(within(panel).queryByText(line)).not.toBeInTheDocument();
  });

  it("AC-25: keeps Jira's last rows under a line that says it refused the token, with a link to Connections", async () => {
    inboxWith([ticket], {
      tools: {
        jira: { state: 'failed', problem: { kind: 'rejected' }, lastSyncedAt: '2026-10-17T11:00:00.000Z' },
        github: synced,
      },
    });
    const { user, history, panel } = await openTab('/?inbox=jira', ticket.title);

    const reconnect = within(panel).getByRole('link', { name: 'Reconnect it in Settings' });
    expect(sentenceOf(reconnect)).toBe('Jira refused the saved token. Reconnect it in Settings.');

    await user.click(reconnect);
    expect(history.location.pathname).toBe('/settings/connections');
  });

  it('AC-25: says Jira wants a sign-in on the web first', async () => {
    inboxWith([], {
      tools: {
        jira: {
          state: 'failed',
          problem: { kind: 'sign_in_needed', site: 'acme.atlassian.net' },
          lastSyncedAt: null,
        },
        github: synced,
      },
    });
    const { panel } = await openTab('/?inbox=jira', 'No Jira tickets need you');

    expect(
      within(panel).getByText(
        'Jira wants you to sign in on the web first. Sign in at acme.atlassian.net, then press Refresh.',
      ),
    ).toBeVisible();
  });

  it('AC-26: says when a tab is empty because its rules are off, with a link to Inbox rules', async () => {
    inboxWith([]);
    rulesOff('jira_assigned');
    const { user, history, panel } = await openTab('/?inbox=jira', 'The Jira rule is off');

    await user.click(within(panel).getByRole('link', { name: 'Turn them on in Settings › Inbox rules.' }));

    expect(history.location.pathname).toBe('/settings/inbox-rules');
  });

  it('AC-26: says when every rule is off', async () => {
    inboxWith([]);
    rulesOff('jira_assigned', 'review_requested', 'checks_failing', 'unresolved_comments', 'session_waiting');
    const { panel } = await openTab('/', 'Every inbox rule is off');

    expect(within(panel).getByRole('link', { name: 'Turn some on in Settings › Inbox rules.' })).toBeVisible();
  });

  it("AC-27: says the list couldn't load, keeps the rest of Home, and tries again", async () => {
    server.use(http.get(apiUrl(apiRoutes.inbox), () => HttpResponse.json({ error: 'down' }, { status: 500 })));
    const { user, panel } = await openTab('/', "Couldn't load the list");

    expect(within(panel).getByText('Check that Orynx is still running, then try again.')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'What should we build today?' })).toBeVisible();

    inboxWith([review]);
    await user.click(within(panel).getByRole('button', { name: 'Try again' }));

    expect(await within(panel).findByRole('link', { name: review.title })).toBeVisible();
  });
});

describe('AttentionPanel when a sync changes the rows', () => {
  /** The server's list changes, then it says a sync ended, as it does after each sync. */
  async function syncTo(items: InboxItem[]) {
    inboxWith(items);
    act(() => {
      FakeEventSource.latest().emit({ type: 'inbox.changed' });
    });
    const panel = screen.getByRole('region', { name: 'Needs your attention' });
    await waitFor(() => {
      expect(within(panel).getAllByRole('listitem')).toHaveLength(items.length);
    });
  }

  function focusOn(element: HTMLElement) {
    act(() => {
      element.focus();
    });
  }

  it("AC-18: moves focus to the next row's title when the focused row goes", async () => {
    inboxWith([review, ticket, comments]);
    await openHome('/?sort=longest');
    focusOn(rowOf(ticket.title).getByRole('button', { name: 'Ship PROJ-1423' }));

    await syncTo([review, comments]);

    expect(screen.getByRole('link', { name: comments.title })).toHaveFocus();
  });

  it('AC-18: moves focus to the row before when the focused last row goes', async () => {
    inboxWith([review, ticket, comments]);
    await openHome('/?sort=longest');
    focusOn(screen.getByRole('link', { name: comments.title }));

    await syncTo([review, ticket]);

    expect(screen.getByRole('link', { name: ticket.title })).toHaveFocus();
  });

  it('AC-18: moves focus to the selected tab when no row is left', async () => {
    inboxWith([ticket]);
    const { panel } = await openHome('/?inbox=jira');
    focusOn(screen.getByRole('link', { name: ticket.title }));

    inboxWith([]);
    act(() => {
      FakeEventSource.latest().emit({ type: 'inbox.changed' });
    });

    await waitFor(() => {
      expect(within(panel).getByRole('tab', { name: 'Jira 0' })).toHaveFocus();
    });
  });

  it('AC-16: keeps focus where it is when rows come and go around it', async () => {
    inboxWith([review, ticket, comments]);
    await openHome('/?sort=longest');
    const title = screen.getByRole('link', { name: ticket.title });
    focusOn(title);

    await syncTo([checks, ticket, approval]);

    expect(title).toHaveFocus();
  });

  it('AC-18: leaves focus alone when it is outside the list', async () => {
    inboxWith([review, ticket]);
    const { user } = await openHome('/?sort=longest');
    focusOn(screen.getByRole('link', { name: ticket.title }));
    const search = screen.getByRole('searchbox', { name: 'Search' });
    await user.click(search);

    await syncTo([review]);

    expect(search).toHaveFocus();
  });

  it('AC-33, AC-45: goes from the selected tab through the toolbar, then each row, title then action', async () => {
    inboxWith([review, ticket]);
    const { user, panel } = await openHome('/?sort=longest');
    focusOn(within(panel).getByRole('tab', { name: 'All 2' }));

    const stops: (string | null)[] = [];
    for (let stop = 0; stop < 6; stop += 1) {
      await user.tab();
      const focused = document.activeElement;
      stops.push(focused?.getAttribute('aria-label') ?? focused?.textContent ?? null);
    }

    expect(stops).toEqual([
      'Search',
      'Reason',
      review.title,
      'Open web-app #2841 in GitHub',
      ticket.title,
      'Ship PROJ-1423',
    ]);
  });
});

describe('AttentionPanel pages', () => {
  /** Tickets PROJ-100 to PROJ-1nn, "Ticket 0" waiting longest; newest first, Ticket nn-1 leads. */
  function tickets(count: number): InboxItem[] {
    return Array.from({ length: count }, (_, index) =>
      makeInboxItem({
        id: `jira:PROJ-${String(100 + index)}`,
        source: 'jira',
        tab: 'jira',
        title: `Ticket ${String(index)}`,
        subject: { kind: 'issue', key: `PROJ-${String(100 + index)}`, status: 'To Do', highPriorityBug: false },
        reason: { kind: 'status', category: 'to_do' },
        waitingSince: new Date(Date.UTC(2026, 9, 1, index)).toISOString(),
        target: { kind: 'external', url: `https://acme.atlassian.net/browse/PROJ-${String(100 + index)}` },
      }),
    );
  }

  function shownTitles(panel: HTMLElement) {
    return within(within(panel).getAllByRole('list')[0] ?? panel)
      .getAllByRole('listitem')
      .map((row) => within(row).getAllByRole('link')[0]?.textContent);
  }

  it('AC-40: shows 16 rows, then a pager whose page links go to their page and move focus to its first row', async () => {
    inboxWith(tickets(34));
    const { user, history, panel } = await openHome('/?sort=longest');

    expect(shownTitles(panel)).toHaveLength(16);
    expect(shownTitles(panel)[0]).toBe('Ticket 0');
    const pager = within(panel).getByRole('navigation', { name: 'Pages' });
    expect(within(pager).getByRole('link', { name: '1' })).toHaveAttribute('aria-current', 'page');
    expect(within(pager).getByRole('link', { name: 'Previous page' })).toHaveAttribute('aria-disabled', 'true');

    await user.click(within(pager).getByRole('link', { name: '3' }));

    expect(new URLSearchParams(history.location.search).get('page')).toBe('3');
    expect(shownTitles(panel)).toEqual(['Ticket 32', 'Ticket 33']);
    expect(within(pager).getByRole('link', { name: '3' })).toHaveAttribute('aria-current', 'page');
    expect(within(pager).getByRole('link', { name: 'Next page' })).toHaveAttribute('aria-disabled', 'true');
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Ticket 32' })).toHaveFocus();
    });

    await user.click(within(pager).getByRole('link', { name: 'Previous page' }));
    expect(new URLSearchParams(history.location.search).get('page')).toBe('2');
    expect(shownTitles(panel)[0]).toBe('Ticket 16');
  });

  it('Q10g: moves focus only for a page picked in the pager, never after a click on the page already shown', async () => {
    inboxWith(tickets(34));
    const { user, panel } = await openHome('/?sort=longest&page=2');
    const pager = within(panel).getByRole('navigation', { name: 'Pages' });

    await user.click(within(pager).getByRole('link', { name: '2' }));
    const search = within(panel).getByRole('searchbox', { name: 'Search' });
    await user.type(search, 'ti');

    expect(search).toHaveFocus();
    expect(search).toHaveValue('ti');
  });

  it('AC-40: has no pager with 16 rows or fewer', async () => {
    inboxWith(tickets(16));
    const { panel } = await openHome();

    expect(shownTitles(panel)).toHaveLength(16);
    expect(within(panel).queryByRole('navigation', { name: 'Pages' })).not.toBeInTheDocument();
  });

  it('AC-41: a search goes back to the first page, and a page past the end after a sync shows the last one', async () => {
    inboxWith(tickets(34));
    const { user, history, panel } = await openHome('/?sort=longest&page=3');
    expect(shownTitles(panel)).toEqual(['Ticket 32', 'Ticket 33']);

    inboxWith(tickets(20));
    act(() => {
      FakeEventSource.latest().emit({ type: 'inbox.changed' });
    });
    await waitFor(() => {
      expect(shownTitles(panel)).toEqual(['Ticket 16', 'Ticket 17', 'Ticket 18', 'Ticket 19']);
    });
    expect(within(panel).getByRole('link', { name: '2' })).toHaveAttribute('aria-current', 'page');

    await user.type(within(panel).getByRole('searchbox', { name: 'Search' }), 'ticket 19');
    expect(new URLSearchParams(history.location.search).get('page')).toBeNull();
    expect(shownTitles(panel)).toEqual(['Ticket 19']);
  });

  it("AC-18, AC-41: when a sync empties the page I'm on, focus moves to the first row of the page shown", async () => {
    inboxWith(tickets(17));
    const { panel } = await openHome('/?sort=longest&page=2');
    act(() => {
      screen.getByRole('link', { name: 'Ticket 16' }).focus();
    });

    inboxWith(tickets(16));
    act(() => {
      FakeEventSource.latest().emit({ type: 'inbox.changed' });
    });

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Ticket 0' })).toHaveFocus();
    });
    expect(within(panel).queryByRole('navigation', { name: 'Pages' })).not.toBeInTheDocument();
  });

  it('AC-44: a sync keeps the search, the filters, the order and the page', async () => {
    inboxWith(tickets(40));
    const { history, panel } = await openHome('/?sort=longest&q=ticket&reason=to-do&page=2');
    expect(shownTitles(panel)[0]).toBe('Ticket 16');

    inboxWith(tickets(41));
    act(() => {
      FakeEventSource.latest().emit({ type: 'inbox.changed' });
    });

    await waitFor(() => {
      expect(within(panel).getByRole('link', { name: '3' })).toBeVisible();
    });
    expect(Object.fromEntries(new URLSearchParams(history.location.search))).toEqual({
      q: 'ticket',
      reason: 'to-do',
      sort: 'longest',
      page: '2',
    });
    expect(shownTitles(panel)[0]).toBe('Ticket 16');
    expect(within(panel).getByRole('searchbox', { name: 'Search' })).toHaveValue('ticket');
  });
});
