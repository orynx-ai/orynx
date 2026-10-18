import { screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type StartSessionAnswer } from '@devhub/contracts';
import { makeRepository, makeSessionList, makeStatus, makeTicket, makeTickets } from '@devhub/contracts/testing';
import { apiUrl, server, sessionsHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const ticket = makeTicket({ key: 'PROJ-1423', title: 'Add bulk archive to the content list', session: null });

const webApp = makeRepository({
  id: '00000000000000aa',
  name: 'web-app',
  displayPath: '~/code/web-app',
  jiraProject: 'PROJ',
});
const mobile = makeRepository({
  id: '00000000000000bb',
  name: 'mobile',
  displayPath: '~/code/mobile',
  jiraProject: 'PROJ',
});

interface Setup {
  signedIn?: boolean;
  folders?: ReturnType<typeof makeRepository>[];
  answer?: StartSessionAnswer | 'fails';
}

/** The board with one ticket, Claude signed in, one folder for PROJ; records what Ship asked the server. */
function setUp({ signedIn = true, folders = [webApp], answer }: Setup = {}) {
  const asked: unknown[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.tickets), () => HttpResponse.json(makeTickets({ tickets: [ticket] }))),
    http.get(apiUrl(apiRoutes.status), () =>
      HttpResponse.json(makeStatus({ agent: { id: 'claude', connected: signedIn } })),
    ),
    http.get(apiUrl(apiRoutes.repositories), () => HttpResponse.json({ repositories: folders })),
    http.post(apiUrl(apiRoutes.sessions), async ({ request }) => {
      asked.push(await request.json());
      if (answer === 'fails') return HttpResponse.json({ code: 'internal', message: 'x' }, { status: 500 });
      return HttpResponse.json(answer ?? { result: 'started', sessionId: '0123456789abcdef' });
    }),
  );
  return asked;
}

const build = () => screen.findByRole('button', { name: 'Ship PROJ-1423' });

describe('Ship', () => {
  it('AC-1: with one folder, starts Claude on the ticket at once and opens the session', async () => {
    const asked = setUp();
    const { user, history } = await renderApp({ route: '/tickets' });

    await user.click(await build());

    expect(asked).toEqual([{ ticketKey: 'PROJ-1423' }]);
    expect(history.location.pathname).toBe('/sessions/0123456789abcdef');
  });

  it('AC-1: opens the ticket’s live session when the server already has one', async () => {
    setUp({ answer: { result: 'existing', sessionId: 'fedcba9876543210' } });
    const { user, history } = await renderApp({ route: '/tickets' });
    await user.click(await build());
    expect(history.location.pathname).toBe('/sessions/fedcba9876543210');
  });

  it('AC-11 (Q3): with several folders, asks which one under "Start in", then starts there', async () => {
    const asked = setUp({ folders: [webApp, mobile] });
    const { user, history } = await renderApp({ route: '/tickets' });

    await user.click(await build());
    const menu = await screen.findByRole('menu', { name: 'Start in' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['web-app~/code/web-app', 'mobile~/code/mobile']);
    await user.click(within(menu).getByRole('menuitem', { name: /mobile/ }));

    expect(asked).toEqual([{ ticketKey: 'PROJ-1423', repositoryId: '00000000000000bb' }]);
    expect(history.location.pathname).toBe('/sessions/0123456789abcdef');
  });

  it('AC-11, AC-18: Esc closes the folder menu and gives focus back to the button', async () => {
    setUp({ folders: [webApp, mobile] });
    const { user } = await renderApp({ route: '/tickets' });
    const button = await build();
    await user.click(button);
    await screen.findByRole('menu', { name: 'Start in' });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('AC-12 (Q4): with no folder for the project, says so and links to Settings › Repositories', async () => {
    const asked = setUp({ folders: [] });
    const { user, history } = await renderApp({ route: '/tickets' });

    await user.click(await build());
    const menu = await screen.findByRole('menu', { name: 'Ship PROJ-1423' });
    expect(within(menu).getByText('No folder is set for PROJ.')).toBeVisible();
    await user.click(within(menu).getByRole('menuitem', { name: 'Open Settings › Repositories' }));

    expect(history.location.pathname).toBe('/settings/repositories');
    expect(asked).toEqual([]);
  });

  it('AC-12 (Q4): with Claude Code signed out, says so and links to Settings › Coding agent', async () => {
    const asked = setUp({ signedIn: false });
    const { user, history } = await renderApp({ route: '/tickets' });

    await user.click(await build());
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText("Claude Code isn't signed in.")).toBeVisible();
    await user.click(within(menu).getByRole('menuitem', { name: 'Open Settings › Coding agent' }));

    expect(history.location.pathname).toBe('/settings/coding-agent');
    expect(asked).toEqual([]);
  });

  it('AC-12 (Q11): with three sessions working, says to stop one first', async () => {
    const asked = setUp();
    server.use(
      sessionsHandler(
        makeSessionList([
          { state: 'working', source: { kind: 'jira', key: 'PROJ-1' } },
          { state: 'working', source: { kind: 'jira', key: 'PROJ-2' } },
          { state: 'needs_you', source: { kind: 'jira', key: 'PROJ-3' } },
          { state: 'done', source: { kind: 'jira', key: 'PROJ-4' } },
        ]),
      ),
    );
    const { user } = await renderApp({ route: '/tickets' });

    await user.click(await build());
    expect(
      within(await screen.findByRole('menu')).getByText(
        'Three sessions are already working. Stop one to start another.',
      ),
    ).toBeVisible();
    expect(asked).toEqual([]);
  });

  it('AC-12: shows the server’s reason when it knows better than the page', async () => {
    setUp({ answer: { result: 'cannot_start', reason: 'signed_out' } });
    const { user } = await renderApp({ route: '/tickets' });
    await user.click(await build());
    expect(within(await screen.findByRole('menu')).getByText("Claude Code isn't signed in.")).toBeVisible();
  });

  it('says to look at the terminal when the start fails', async () => {
    setUp({ answer: 'fails' });
    const { user } = await renderApp({ route: '/tickets' });
    await user.click(await build());
    expect(within(await screen.findByRole('menu')).getByText('See the terminal for details.')).toBeVisible();
  });

  it('AC-18: Enter starts it, and the button stays busy, focused, while the server answers', async () => {
    setUp();
    server.use(
      http.post(apiUrl(apiRoutes.sessions), async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    const { user } = await renderApp({ route: '/tickets' });
    const button = await build();
    button.focus();
    await user.keyboard('{Enter}');

    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveFocus();
  });
});
