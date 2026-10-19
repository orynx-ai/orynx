import { act, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes, type InboxItem } from '@devhub/contracts';
import { makeInbox, makeInboxItem } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const ticket = (key: string, title: string, status: string, waited: string): InboxItem =>
  makeInboxItem({
    id: `jira:${key}`,
    source: 'jira',
    tab: 'jira',
    title,
    subject: { kind: 'issue', key, status, highPriorityBug: false },
    reason: { kind: 'status', category: status === 'To Do' ? 'to_do' : 'in_progress' },
    waitingSince: waited,
    target: { kind: 'external', url: `https://acme.atlassian.net/browse/${key}` },
  });

// Newest first: people, archive, guests, failing.
const archive = ticket('PROJ-1423', 'Add bulk archive to the content list', 'In Progress', '2026-10-15T09:00:00.000Z');
const guests = ticket('PS-77', 'Search returns archived sites for guest users', 'To Do', '2026-10-12T09:00:00.000Z');
const people = makeInboxItem({ waitingSince: '2026-10-16T09:00:00.000Z' });
const failing = makeInboxItem({
  id: 'github:acme/api/977',
  title: 'Rate-limit the export endpoint',
  subject: { kind: 'pull_request', repository: 'api', number: 977, author: null, mine: true },
  reason: { kind: 'checks_failing' },
  waitingSince: '2026-10-10T09:00:00.000Z',
  target: { kind: 'external', url: 'https://github.com/acme/api/pull/977/checks' },
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-17T12:00:00.000Z'));
  server.use(
    http.get(apiUrl(apiRoutes.inbox), () =>
      HttpResponse.json(makeInbox({ items: [people, archive, guests, failing] })),
    ),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

async function openHome(route = '/') {
  const rendered = await renderApp({ route });
  const panel = screen.getByRole('region', { name: 'Needs your attention' });
  await within(panel).findAllByRole('listitem');
  return { ...rendered, panel };
}

/** A row's title: its first link, or on a Jira ticket's row, where the title is a button, its first button. */
function titleText(row: HTMLElement) {
  return (within(row).queryAllByRole('link')[0] ?? within(row).queryAllByRole('button')[0])?.textContent;
}

function titles(panel: HTMLElement) {
  return within(panel).queryAllByRole('listitem').map(titleText);
}

describe('InboxToolbar', () => {
  it("AC-35: puts the search box first and the tab's filters after it, on each tab", async () => {
    const { user, panel } = await openHome();

    expect(within(panel).getByRole('searchbox', { name: 'Search' })).toBeVisible();
    expect(within(panel).getByRole('button', { name: 'Reason' })).toBeVisible();
    expect(within(panel).queryByRole('button', { name: 'Project' })).not.toBeInTheDocument();

    await user.click(within(panel).getByRole('tab', { name: 'Jira 2' }));
    expect(within(panel).getByRole('searchbox', { name: 'Search tickets' })).toBeVisible();
    for (const filter of ['Reason', 'Project', 'Status']) {
      expect(within(panel).getByRole('button', { name: filter })).toBeVisible();
    }

    await user.click(within(panel).getByRole('tab', { name: 'Pull requests 2' }));
    expect(within(panel).getByRole('searchbox', { name: 'Search pull requests' })).toBeVisible();
    expect(within(panel).getByRole('button', { name: 'Repository' })).toBeVisible();
  });

  it('AC-36: shows only the rows whose words match as I type, and keeps the search in the address', async () => {
    const { user, history, panel } = await openHome();
    const search = within(panel).getByRole('searchbox', { name: 'Search' });

    await user.type(search, 'archive');
    expect(titles(panel)).toEqual([archive.title, guests.title]);
    expect(new URLSearchParams(history.location.search).get('q')).toBe('archive');

    await user.clear(search);
    await user.type(search, 'web-app 2841');
    expect(titles(panel)).toEqual([people.title]);
    expect(search).toHaveValue('web-app 2841');
  });

  it('AC-36: a reload keeps the search in the box and the list', async () => {
    const { panel } = await openHome('/?q=priya');

    expect(within(panel).getByRole('searchbox', { name: 'Search' })).toHaveValue('priya');
    expect(titles(panel)).toEqual([people.title]);
  });

  it('AC-37: ticks in one menu mean any of them, menus together mean all of them, and the address keeps them', async () => {
    const { user, history, panel } = await openHome('/?inbox=jira');

    await user.click(within(panel).getByRole('button', { name: 'Project' }));
    expect(
      within(screen.getByRole('menu', { name: 'Project' }))
        .getAllByRole('menuitemcheckbox')
        .map((option) => option.textContent),
    ).toEqual(['PROJ', 'PS']);
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'PS' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'PS' })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{Escape}');

    expect(titles(panel)).toEqual([guests.title]);
    expect(within(panel).getByRole('button', { name: 'Project · 1' })).toHaveFocus();
    expect(new URLSearchParams(history.location.search).get('project')).toBe('PS');

    await user.click(within(panel).getByRole('button', { name: 'Status' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'In Progress' }));
    await user.keyboard('{Escape}');
    expect(titles(panel)).toEqual([]);

    await user.click(within(panel).getByRole('button', { name: 'Project · 1' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'PROJ' }));
    await user.keyboard('{Escape}');
    expect(titles(panel)).toEqual([archive.title]);
    expect(new URLSearchParams(history.location.search).get('project')).toBe('PS,PROJ');
  });

  it('AC-38: says nothing matches, and Clear search and filters empties both and goes back to the search box', async () => {
    const { user, history } = await renderApp({ route: '/?q=nothing+like+this&reason=checks-failing' });
    const panel = screen.getByRole('region', { name: 'Needs your attention' });

    expect(await within(panel).findByText('No matches')).toBeVisible();
    expect(within(panel).getByText('Nothing in this tab matches your search and filters.')).toBeVisible();

    await user.click(within(panel).getByRole('button', { name: 'Clear search and filters' }));

    const search = within(panel).getByRole('searchbox', { name: 'Search' });
    expect(search).toHaveValue('');
    await waitFor(() => {
      expect(search).toHaveFocus();
    });
    expect(history.location.search).toBe('');
    expect(titles(panel)).toHaveLength(4);
    expect(within(panel).getByRole('button', { name: 'Reason' })).toBeVisible();
  });

  it("AC-42: switching tabs keeps the search, and drops the filters the other tab's menus held", async () => {
    const { user, history, panel } = await openHome('/?inbox=pull-requests&q=a&repo=api');
    expect(titles(panel)).toEqual([failing.title]);

    await user.click(within(panel).getByRole('tab', { name: 'Jira 2' }));

    expect(history.location.search).toBe('?inbox=jira&q=a');
    expect(within(panel).getByRole('searchbox', { name: 'Search tickets' })).toHaveValue('a');
    expect(within(panel).getByRole('button', { name: 'Project' })).toBeVisible();
    expect(titles(panel)).toEqual([archive.title, guests.title]);
  });

  it('AC-45: Tab goes from the selected tab to the search box, each filter, then the rows', async () => {
    const { user, panel } = await openHome('/?inbox=jira');
    act(() => {
      within(panel).getByRole('tab', { name: 'Jira 2' }).focus();
    });

    const stops: (string | null)[] = [];
    for (let stop = 0; stop < 5; stop += 1) {
      await user.tab();
      const focused = document.activeElement;
      stops.push(focused?.getAttribute('aria-label') ?? focused?.textContent ?? null);
    }

    expect(stops).toEqual(['Search tickets', 'Reason', 'Project', 'Status', archive.title]);
  });
});
