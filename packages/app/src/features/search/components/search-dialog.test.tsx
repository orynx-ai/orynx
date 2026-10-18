import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
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
    const { user } = await renderApp();

    await openSearch(user);

    const dialog = await screen.findByRole('dialog', { name: 'Search' });
    expect(searchBox()).toHaveAttribute('placeholder', 'Search tickets, pull requests and sessions');
    expect(
      within(dialog).getByText('Find a ticket by key or title, a pull request by number or repository, or a session.'),
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

  it('AC-20: Tab stays inside the dialog', async () => {
    const { user } = await renderApp();
    await openSearch(user);
    await screen.findByRole('dialog', { name: 'Search' });

    await user.tab();
    expect(searchBox()).toHaveFocus();
    await user.tab({ shift: true });
    expect(searchBox()).toHaveFocus();
  });

  it('AC-6, AC-8, AC-9: results show in their groups as I type, from one request however much I type', async () => {
    const asked = holding();
    const { user } = await renderApp();
    await openSearch(user);

    await user.type(await screen.findByRole('combobox'), 'archive');

    const results = await screen.findByRole('listbox');
    expect(within(results).getByRole('group', { name: 'Tickets' })).toBeVisible();
    expect(
      within(results)
        .getAllByRole('option')
        .map((option) => option.getAttribute('aria-label')),
    ).toEqual(['PROJ-1423, Add bulk archive, In Progress', 'PROJ-1377, Fix archive search, To Do']);
    expect(within(results).getByRole('option', { name: /PROJ-1423/ })).toHaveAttribute('aria-selected', 'true');

    await user.clear(searchBox());
    await user.type(searchBox(), 'priya');
    expect(within(screen.getByRole('listbox')).getByRole('group', { name: 'Pull requests' })).toBeVisible();
    expect(screen.getByRole('option')).toHaveAccessibleName(
      'web-app #2841, Lazy-load the people directory, Priya Shah',
    );

    await user.clear(searchBox());
    await user.type(searchBox(), 'needs you');
    expect(screen.getByRole('option')).toHaveAccessibleName('Tidy the settings page, PROJ-1500, Needs you');
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
});
