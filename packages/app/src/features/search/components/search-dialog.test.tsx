import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type SearchIndex } from '@devhub/contracts';
import {
  makeSearchIndex,
  makeSearchPullRequest,
  makeSearchTicket,
  makeSessionSummary,
} from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

/** What the server holds: two tickets (one with a session), a pull request and a session. */
const held = makeSearchIndex({
  tickets: [
    makeSearchTicket({ key: 'PROJ-1423', title: 'Add bulk archive', status: 'In Progress' }),
    makeSearchTicket({
      key: 'PROJ-1377',
      title: 'Fix archive search',
      status: 'To Do',
      target: { kind: 'session', sessionId: 'session-9' },
    }),
  ],
  pullRequests: [makeSearchPullRequest()],
  sessions: [
    makeSessionSummary({
      id: 'session-1',
      title: 'Tidy the settings page',
      state: 'needs_you',
      source: { kind: 'jira', key: 'PROJ-1500' },
    }),
  ],
});

/** Answers GET /api/search with `index`, and counts the requests. */
function holding(index: SearchIndex = held): () => number {
  let asked = 0;
  server.use(
    http.get(apiUrl(apiRoutes.search), () => {
      asked += 1;
      return HttpResponse.json(index);
    }),
  );
  return () => asked;
}

function openSearch(user: Awaited<ReturnType<typeof renderApp>>['user']) {
  return user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: /Search/ }));
}

function searchBox() {
  return screen.getByRole('combobox', { name: 'Search tickets, pull requests and sessions' });
}

describe('Search dialog', () => {
  it('AC-5: before anything is typed it shows the hint line and no results', async () => {
    holding();
    const { user } = await renderApp();

    await openSearch(user);

    const dialog = await screen.findByRole('dialog', { name: 'Search' });
    expect(searchBox()).toHaveAttribute('placeholder', 'Search tickets, pull requests and sessions');
    expect(
      await within(dialog).findByText(
        'Find a ticket by key or title, a pull request by number or repository, or a session.',
      ),
    ).toBeVisible();
    expect(within(dialog).queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('AC-19: opens empty every time: the text typed is dropped when it closes', async () => {
    const { user } = await renderApp();
    await openSearch(user);
    await user.type(await screen.findByRole('combobox'), 'archive');

    await user.keyboard('{Escape}');
    await openSearch(user);

    expect(searchBox()).toHaveValue('');
  });

  it('AC-20: Tab stays inside the dialog: from the box to the results, which scroll by keyboard, and back', async () => {
    holding();
    const { user } = await renderApp();
    await openSearch(user);
    const dialog = await screen.findByRole('dialog', { name: 'Search' });

    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(searchBox()).not.toHaveFocus();
    await user.tab();
    expect(searchBox()).toHaveFocus();
    await user.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('AC-6, AC-8, AC-9: results show in their groups as I type, from one request however much I type', async () => {
    const asked = holding();
    const { user } = await renderApp();
    await openSearch(user);

    await user.type(await screen.findByRole('combobox'), 'archive');

    const results = await screen.findByRole('listbox');
    expect(within(results).getByRole('group', { name: 'Tickets' })).toBeVisible();
    const options = within(results).getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAccessibleName('PROJ-1423, Add bulk archive, In Progress');
    expect(options[1]).toHaveAccessibleName('PROJ-1377, Fix archive search, To Do');
    expect(within(results).getByRole('option', { name: /PROJ-1423/ })).toHaveAttribute('aria-selected', 'true');

    await user.clear(searchBox());
    await user.type(searchBox(), 'priya');
    expect(within(screen.getByRole('listbox')).getByRole('group', { name: 'Pull requests' })).toBeVisible();
    expect(screen.getByRole('option')).toHaveAccessibleName(
      'web-app #2841, Lazy-load the people directory, Priya Shah',
    );

    await user.clear(searchBox());
    await user.type(searchBox(), 'needs you');
    expect(screen.getByRole('option')).toHaveAccessibleName('PROJ-1500, Tidy the settings page, Needs you');
    expect(asked()).toBe(1);
  });

  it('AC-12: Enter on a ticket with no session opens it in Jira, closes search and gives focus back', async () => {
    holding();
    const { user, platform } = await renderApp({ route: '/tickets' });
    await openSearch(user);
    await user.type(await screen.findByRole('combobox'), 'archive');
    await screen.findByRole('listbox');

    await user.keyboard('{Enter}');

    expect(platform.openExternal).toHaveBeenCalledWith('https://your-team.atlassian.net/browse/PROJ-1423');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: /Search/ }),
    ).toHaveFocus();
  });

  it('AC-11, AC-13: ↓ then Enter on a ticket with a session opens that session in DevHub', async () => {
    holding();
    const { user, history, platform } = await renderApp({ route: '/tickets' });
    await openSearch(user);
    await user.type(await screen.findByRole('combobox'), 'archive');
    await screen.findByRole('listbox');

    await user.keyboard('{ArrowDown}{Enter}');

    expect(history.location.pathname).toBe('/sessions/session-9');
    expect(platform.openExternal).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('AC-14: a click on a pull request opens it on GitHub', async () => {
    holding();
    const { user, platform } = await renderApp();
    await openSearch(user);
    await user.type(await screen.findByRole('combobox'), '2841');

    await user.click(await screen.findByRole('option', { name: /web-app #2841/ }));

    expect(platform.openExternal).toHaveBeenCalledWith('https://github.com/acme/web-app/pull/2841');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('AC-15: Enter on a session opens it in DevHub', async () => {
    holding();
    const { user, history } = await renderApp();
    await openSearch(user);
    await user.type(await screen.findByRole('combobox'), 'tidy');
    await screen.findByRole('listbox');

    await user.keyboard('{Enter}');

    expect(history.location.pathname).toBe('/sessions/session-1');
  });

  it('AC-22: with nothing connected and no sessions it says there’s nothing to search, and links to Connections', async () => {
    const { user, history } = await renderApp({ route: '/tickets' });
    await openSearch(user);

    const dialog = await screen.findByRole('dialog', { name: 'Search' });
    expect(await within(dialog).findByText('Nothing to search yet')).toBeVisible();
    // A screen reader hears it too, though nothing was typed.
    await waitFor(() => {
      expect(within(dialog).getByRole('status')).toHaveTextContent('Nothing to search yet');
    });
    expect(within(dialog).getByText('Connect Jira or GitHub to search your tickets and pull requests.')).toBeVisible();
    expect(searchBox()).toBeVisible();

    await user.click(within(dialog).getByRole('link', { name: 'Open Settings' }));

    expect(history.location.pathname).toBe('/settings/connections');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('AC-23: while the list is on its way, opening search shows loading rows and no words, and typing keeps them', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.search), async () => {
        await delay('infinite');
        return HttpResponse.json(held);
      }),
    );
    const { user } = await renderApp();
    await openSearch(user);

    const dialog = await screen.findByRole('dialog', { name: 'Search' });
    // The loading rows are for the eye only; the region around them says it's busy.
    expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(within(dialog).queryByText(/Find a ticket by key or title/)).not.toBeInTheDocument();

    await user.type(searchBox(), 'archive');

    expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(within(dialog).queryByRole('listbox')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('No matches')).not.toBeInTheDocument();
  });

  it('AC-24: a tool still on its first sync says so under the results', async () => {
    holding(
      makeSearchIndex({
        pullRequests: [makeSearchPullRequest()],
        tools: { jira: { state: 'syncing' }, github: { state: 'synced', at: '2026-10-18T09:00:00.000Z' } },
      }),
    );
    const { user } = await renderApp();
    await openSearch(user);

    await user.type(await screen.findByRole('combobox'), 'web-app');

    expect(await screen.findByRole('option', { name: /web-app #2841/ })).toBeVisible();
    expect(screen.getByText('Jira is still syncing. Its tickets appear when it ends.')).toBeVisible();
    expect(screen.queryByText(/GitHub is still syncing/)).not.toBeInTheDocument();
  });

  it('AC-24: says it for GitHub too', async () => {
    holding(
      makeSearchIndex({
        tickets: [makeSearchTicket()],
        tools: { jira: { state: 'synced', at: '2026-10-18T09:00:00.000Z' }, github: { state: 'syncing' } },
      }),
    );
    const { user } = await renderApp();
    await openSearch(user);

    await user.type(await screen.findByRole('combobox'), 'archive');

    expect(await screen.findByText('GitHub is still syncing. Its pull requests appear when it ends.')).toBeVisible();
  });

  it('AC-21: text that matches nothing says so, and DevHub asks nothing more', async () => {
    const asked = holding();
    const { user } = await renderApp();
    await openSearch(user);

    await user.type(await screen.findByRole('combobox'), 'PROJ-9999');

    expect(await screen.findByText('No matches')).toBeVisible();
    expect(screen.getByText('Try a key like PROJ-1423 or a repo name.')).toBeVisible();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(asked()).toBe(1);
  });

  it('AC-25: a server that doesn’t answer says so, and Try again asks once more', async () => {
    server.use(http.get(apiUrl(apiRoutes.search), () => HttpResponse.error()));
    const { user } = await renderApp();
    await openSearch(user);

    const dialog = await screen.findByRole('dialog', { name: 'Search' });
    expect(await within(dialog).findByText("Couldn't load search")).toBeVisible();
    await waitFor(() => {
      expect(within(dialog).getByRole('status')).toHaveTextContent("Couldn't load search");
    });

    let answer: () => void = () => undefined;
    server.use(
      http.get(apiUrl(apiRoutes.search), async () => {
        await new Promise<void>((resolve) => {
          answer = resolve;
        });
        return HttpResponse.json(held);
      }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }));
    // It shows it's working, with the loading rows, until the answer comes.
    expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(within(dialog).queryByText("Couldn't load search", { ignore: '[role="status"]' })).not.toBeInTheDocument();
    answer();
    await user.type(searchBox(), 'archive');

    expect(await within(dialog).findByRole('listbox')).toBeVisible();
    expect(within(dialog).queryByText("Couldn't load search", { ignore: '[role="status"]' })).not.toBeInTheDocument();
  });

  it('AC-27: a tool whose last sync failed is still searched, with no error in the dialog', async () => {
    holding(
      makeSearchIndex({
        pullRequests: [makeSearchPullRequest()],
        tools: {
          jira: { state: 'synced', at: '2026-10-18T09:00:00.000Z' },
          github: { state: 'failed', problem: { kind: 'no_answer' }, lastSyncedAt: '2026-10-18T08:00:00.000Z' },
        },
      }),
    );
    const { user } = await renderApp();
    await openSearch(user);

    await user.type(await screen.findByRole('combobox'), '2841');

    expect(await screen.findByRole('option', { name: /web-app #2841/ })).toBeVisible();
    expect(within(screen.getByRole('dialog', { name: 'Search' })).queryByText(/GitHub/)).not.toBeInTheDocument();
  });
});
