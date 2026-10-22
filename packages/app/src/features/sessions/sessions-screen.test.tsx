import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeSessionList } from '@devhub/contracts/testing';
import { apiUrl, server, sessionsHandler } from '../../test/msw.ts';
import { renderApp } from '../../test/render.tsx';
import { serveSessions } from '../../test/sessions.ts';

function content() {
  return screen.getByRole('main');
}

describe('SessionsScreen', () => {
  it('AC-8: lists every session, newest activity first, with the sidebar rows', async () => {
    const titles = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];
    server.use(sessionsHandler(makeSessionList(titles.map((title) => ({ title, source: null, state: 'done' })))));
    await renderApp({ route: '/sessions' });

    const list = await within(content()).findByRole('list', { name: 'Sessions' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(titles.map((title) => `${title} Done, ready for PR`));
    expect(links[6]).toHaveAttribute('href', '/sessions/session-7');
  });

  it('Select picks several sessions, and Delete takes them all after one confirm (the user’s call, 22 Oct 2026)', async () => {
    const { deleted } = serveSessions([
      { title: 'Add bulk archive', state: 'done' },
      { title: 'Tidy the README', state: 'stopped' },
      { title: 'Fix the login', state: 'working' },
    ]);
    const { user } = await renderApp({ route: '/sessions' });

    await user.click(await within(content()).findByRole('button', { name: 'Select' }));
    expect(within(content()).getByRole('checkbox', { name: 'Select Fix the login' })).toBeDisabled();
    await user.click(within(content()).getByRole('checkbox', { name: 'Select Add bulk archive' }));
    await user.click(within(content()).getByRole('checkbox', { name: 'Select Tidy the README' }));
    expect(within(content()).getByText('2 selected')).toBeVisible();
    await user.click(within(content()).getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 2 sessions?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    expect(deleted).toEqual(['session-1', 'session-2']);
    expect(await within(content()).findByRole('link', { name: /^Fix the login/ })).toBeVisible();
    expect(within(content()).queryByRole('link', { name: /^Add bulk archive/ })).toBeNull();
    expect(within(content()).queryByRole('checkbox')).toBeNull();
    expect(within(content()).getByRole('button', { name: 'Select' })).toBeVisible();
  });

  it('Cancel leaves Select without deleting anything', async () => {
    const { deleted } = serveSessions([{ title: 'Add bulk archive', state: 'done' }]);
    const { user } = await renderApp({ route: '/sessions' });

    await user.click(await within(content()).findByRole('button', { name: 'Select' }));
    await user.click(within(content()).getByRole('checkbox', { name: 'Select Add bulk archive' }));
    await user.click(within(content()).getByRole('button', { name: 'Cancel' }));

    expect(within(content()).queryByRole('checkbox')).toBeNull();
    expect(deleted).toEqual([]);
  });

  it('AC-10: shows that there are no sessions and how to start one', async () => {
    await renderApp({ route: '/sessions' });

    expect(await within(content()).findByText('No sessions yet')).toBeVisible();
    expect(within(content()).getByText('Start one from Home or from a ticket.')).toBeVisible();
  });

  it('shows the page bar and nothing else while the list loads', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.sessions), async () => {
        await delay('infinite');
        return HttpResponse.json({ sessions: [] });
      }),
    );
    await renderApp({ route: '/sessions' });

    expect(within(content()).getByText('Sessions', { selector: '[aria-current="page"]' })).toBeVisible();
    expect(within(content()).queryByText('No sessions yet')).toBeNull();
    expect(within(content()).queryByRole('list', { name: 'Sessions' })).toBeNull();
    // AC-43 (spec 039): the search and filters are there at once, with rows the size of real ones below.
    expect(within(content()).getByRole('searchbox', { name: 'Search sessions' })).toBeVisible();
    expect(within(content()).getByRole('button', { name: 'Status' })).toBeVisible();
    expect(within(content()).getByRole('status')).toHaveTextContent('Loading sessions');
  });

  it("AC-12: says the sessions couldn't load", async () => {
    server.use(http.get(apiUrl(apiRoutes.sessions), () => HttpResponse.json({}, { status: 500 })));
    await renderApp({ route: '/sessions' });

    expect(await within(content()).findByText("Couldn't load sessions")).toBeVisible();
    expect(within(content()).getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('names the page with a level-one heading for screen readers', async () => {
    await renderApp({ route: '/sessions' });
    expect(screen.getByRole('heading', { level: 1, name: 'Sessions' })).toBeInTheDocument();
  });
});

const six = [
  { title: 'Fix the failing checks', state: 'done', mode: 'build', source: { kind: 'pull_request', number: 2836 } },
  { title: 'How does paging work?', state: 'done', mode: 'ask', source: null },
  { title: 'Add bulk archive', state: 'stopped', mode: 'build', source: { kind: 'jira', key: 'MAI-5337' } },
  { title: 'Read receipts', state: 'working', mode: 'build', source: { kind: 'jira', key: 'MAI-7096' } },
  { title: 'Explain the terminal', state: 'done', mode: 'ask', source: null },
  { title: 'Tidy the README', state: 'needs_you', mode: 'build', source: null },
] as const;

describe('searching and filtering sessions (spec 039)', () => {
  it('AC-18: Search sessions narrows by title, ticket key or pull request as you type, and keeps it in the address', async () => {
    serveSessions([...six]);
    const { user, history } = await renderApp({ route: '/sessions' });
    const search = await within(content()).findByRole('searchbox', { name: 'Search sessions' });

    await user.type(search, 'FAILING');
    const list = within(content()).getByRole('list', { name: 'Sessions' });
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/sessions/session-1']);
    expect(history.location.search).toContain('q=FAILING');

    await user.clear(search);
    await user.type(search, 'mai-7096');
    expect(within(content()).getAllByRole('link', { name: /^Read receipts/ })).toHaveLength(1);
    await user.clear(search);
    await user.type(search, '2836');
    expect(within(content()).getByRole('link', { name: /^Fix the failing checks/ })).toBeVisible();
  });

  it('AC-19: Status and Kind narrow together, and a reload keeps both', async () => {
    serveSessions([...six]);
    await renderApp({ route: '/sessions?status=done&kind=ask' });

    const list = await within(content()).findByRole('list', { name: 'Sessions' });
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/sessions/session-2', '/sessions/session-5']);
    expect(within(content()).getByRole('button', { name: 'Status · 1' })).toBeVisible();
  });

  it('AC-19: ticking a status in its menu writes it to the address', async () => {
    serveSessions([...six]);
    const { user, history } = await renderApp({ route: '/sessions' });
    await within(content()).findByRole('list', { name: 'Sessions' });

    await user.click(within(content()).getByRole('button', { name: 'Status' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Needs you' }));
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(history.location.search).toContain('status=needs_you');
    });
    expect(within(content()).getAllByRole('link', { name: /^Tidy the README/ })).toHaveLength(1);
  });

  it('AC-20: nothing matching says so, and Clear filters empties both and puts focus in the search', async () => {
    serveSessions([...six]);
    const { user } = await renderApp({ route: '/sessions?q=nothing&status=stopped' });

    expect(await within(content()).findByText('No sessions match')).toBeVisible();
    await user.click(within(content()).getByRole('button', { name: 'Clear filters' }));

    const search = within(content()).getByRole('searchbox', { name: 'Search sessions' });
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
    expect(within(within(content()).getByRole('list', { name: 'Sessions' })).getAllByRole('link')).toHaveLength(6);
  });

  it('AC-26: pinned sessions sit first, under Pinned, and every row has its ⋯', async () => {
    serveSessions([
      { title: 'Add bulk archive', state: 'done' },
      { title: 'Tidy the README', state: 'done', pinnedAt: '2026-10-16T09:00:00.000Z' },
    ]);
    await renderApp({ route: '/sessions' });

    const pinned = await within(content()).findByRole('list', { name: 'Pinned' });
    expect(within(pinned).getByRole('link', { name: /^Tidy the README/ })).toBeVisible();
    const recent = within(content()).getByRole('list', { name: 'Recent' });
    expect(within(recent).getAllByRole('link')).toHaveLength(1);
    expect(within(content()).getByRole('button', { name: 'More actions for Add bulk archive' })).toBeInTheDocument();
  });

  it("AC-43: a list that can't load says so under the search and filters", async () => {
    server.use(http.get(apiUrl(apiRoutes.sessions), () => HttpResponse.json({}, { status: 500 })));
    await renderApp({ route: '/sessions' });

    expect(await within(content()).findByText("Couldn't load sessions")).toBeVisible();
    expect(within(content()).getByRole('searchbox', { name: 'Search sessions' })).toBeVisible();
  });
});

describe('recent searches on the Sessions page (spec 039)', () => {
  it('AC-21: Enter keeps a search; with the field empty and focused, Recent searches lists them, newest first', async () => {
    serveSessions([...six]);
    const { user } = await renderApp({ route: '/sessions' });
    const search = await within(content()).findByRole('searchbox', { name: 'Search sessions' });

    await user.type(search, 'terminal{Enter}');
    await user.clear(search);
    await user.type(search, 'jira{Enter}');
    await user.clear(search);

    const recent = within(content()).getByRole('group', { name: 'Recent searches' });
    expect(
      within(recent)
        .getAllByRole('button', { name: /^Search for/ })
        .map((row) => row.textContent),
    ).toEqual(['jira', 'terminal']);
  });

  it('AC-21: opening a session it found keeps the search too', async () => {
    serveSessions([...six]);
    const { user } = await renderApp({ route: '/sessions' });
    await user.type(await within(content()).findByRole('searchbox', { name: 'Search sessions' }), 'readme');

    await user.click(within(content()).getByRole('link', { name: /^Tidy the README/ }));
    await user.click(
      await within(screen.getByRole('navigation', { name: 'Main' })).findByRole('link', { name: 'View all' }),
    );
    await user.click(await within(content()).findByRole('searchbox', { name: 'Search sessions' }));

    expect(within(content()).getByRole('button', { name: 'Search for readme' })).toBeVisible();
  });

  it('AC-22: ↓ then Enter runs the first recent search again', async () => {
    serveSessions([...six]);
    const { user, history } = await renderApp({ route: '/sessions' });
    const search = await within(content()).findByRole('searchbox', { name: 'Search sessions' });
    await user.type(search, 'failing{Enter}');
    await user.clear(search);

    await user.keyboard('{ArrowDown}{Enter}');

    expect(search).toHaveValue('failing');
    expect(history.location.search).toContain('q=failing');
    expect(within(content()).getAllByRole('link', { name: /^Fix the failing checks/ })).toHaveLength(1);
    expect(within(content()).queryByRole('group', { name: 'Recent searches' })).not.toBeInTheDocument();
  });

  it('AC-23: remove and Clear take searches away for good, and focus stays in the field', async () => {
    serveSessions([...six]);
    const { user } = await renderApp({ route: '/sessions' });
    const search = await within(content()).findByRole('searchbox', { name: 'Search sessions' });
    await user.type(search, 'terminal{Enter}');
    await user.clear(search);
    await user.type(search, 'jira{Enter}');
    await user.clear(search);

    await user.click(within(content()).getByRole('button', { name: 'Remove “jira” from recent searches' }));
    expect(search).toHaveFocus();
    expect(within(content()).queryByRole('button', { name: 'Search for jira' })).not.toBeInTheDocument();
    await user.click(within(content()).getByRole('button', { name: 'Clear recent searches' }));

    expect(search).toHaveFocus();
    expect(within(content()).queryByRole('group', { name: 'Recent searches' })).not.toBeInTheDocument();
    expect(localStorage.getItem('devhub.recent-searches')).toContain('"sessions":[]');
  });

  it('Esc puts the list away and keeps focus in the field', async () => {
    serveSessions([...six]);
    const { user } = await renderApp({ route: '/sessions' });
    const search = await within(content()).findByRole('searchbox', { name: 'Search sessions' });
    await user.type(search, 'jira{Enter}');
    await user.clear(search);

    await user.keyboard('{Escape}');

    expect(within(content()).queryByRole('group', { name: 'Recent searches' })).not.toBeInTheDocument();
    expect(search).toHaveFocus();
  });
});
