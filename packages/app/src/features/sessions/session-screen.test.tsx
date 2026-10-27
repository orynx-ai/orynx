import { screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeSession, makeSessionChanges, makeSessionTicket } from '@devhub/contracts/testing';
import { apiUrl, server, sessionHandler } from '../../test/msw.ts';
import { renderApp } from '../../test/render.tsx';

const id = '0123456789abcdef';
const route = `/sessions/${id}`;
// Four minutes after the session started.
const now = new Date('2026-10-16T10:00:00.000Z');

const working = makeSession({
  id,
  title: 'Add bulk archive to the content list',
  state: 'working',
  source: { kind: 'jira', key: 'PROJ-1423' },
  folder: { name: 'web-app', displayPath: '~/code/web-app' },
  branch: 'feat/PROJ-1423',
  startedAt: '2026-10-16T09:56:00.000Z',
  sprint: 'Sprint 42',
  jiraUrl: 'https://your-team.atlassian.net/browse/PROJ-1423',
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now });
});
afterEach(() => {
  vi.useRealTimers();
});

function pageBar() {
  return screen.getByRole('banner');
}

describe('SessionScreen', () => {
  it('013 AC-1: puts Claude’s progress, with the follow-up box, beside the Changes and Context tabs, Changes open', async () => {
    server.use(
      sessionHandler({ ...working, ticket: makeSessionTicket(), worktreePath: '/Users/you/.devhub/worktrees/x' }),
      http.get(apiUrl(apiRoutes.sessionChanges), () => HttpResponse.json(makeSessionChanges())),
    );
    const { user } = await renderApp({ route });

    const progress = await screen.findByRole('region', { name: 'What Claude did' });
    expect(within(progress).getByRole('textbox', { name: 'Message Claude' })).toBeVisible();
    const details = screen.getByRole('region', { name: 'Work details' });
    const tabs = within(details).getByRole('tablist', { name: 'Session details' });
    expect(await within(tabs).findByRole('tab', { name: 'Changes 4' })).toHaveAttribute('aria-selected', 'true');
    expect(within(tabs).getByRole('tab', { name: 'Context 1' })).toHaveAttribute('aria-selected', 'false');
    expect(within(details).getByRole('tabpanel', { name: 'Changes 4' })).toBeVisible();
    // Open in the editor and Delete are in the page bar's More actions, at hand from the top (19 Oct 2026; Delete took
    // Discard changes' place in spec 039).
    await user.click(within(pageBar()).getByRole('button', { name: 'More actions' }));
    // Claude is working here, so Delete is there but disabled, with its reason in its name.
    expect(screen.getByRole('menuitem', { name: /^Delete/ })).toBeVisible();
    expect(await screen.findByRole('menuitem', { name: 'Open in VS Code' })).toHaveAttribute(
      'href',
      'vscode://file/Users/you/.devhub/worktrees/x',
    );
  });

  it('spec 026: an Ask session has no stepper, worktree or Changes: it says it reads the folder in place', async () => {
    const ask = { ...working, mode: 'ask', branch: null, worktreePath: null, state: 'done' } as const;
    server.use(sessionHandler({ ...ask, context: [] }));
    await renderApp({ route });

    expect(await screen.findByText('Ask session · reads web-app in place and changes nothing')).toBeVisible();
    expect(screen.queryByText(/separate worktree/)).toBeNull();
    expect(screen.queryByRole('list', { name: 'Session progress' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create pull request' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Message Claude' })).toBeVisible();
    // Its ticket is all it was sent: Context alone, with no Changes beside it.
    const tabs = screen.getByRole('tablist', { name: 'Session details' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Context 1']);
    expect(within(tabs).getByRole('tab', { name: 'Context 1' })).toHaveAttribute('aria-selected', 'true');
  });

  it('spec 026: an Ask session that was sent nothing has no details beside its progress', async () => {
    server.use(
      sessionHandler({ ...working, mode: 'ask', branch: null, worktreePath: null, source: null, context: [] }),
    );
    await renderApp({ route });
    expect(await screen.findByRole('region', { name: 'What Claude did' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Work details' })).toBeNull();
  });

  it('AC-3 (spec 031): an Ask with no folder says it changes nothing, and names no folder', async () => {
    server.use(
      sessionHandler({ ...working, mode: 'ask', folder: null, branch: null, worktreePath: null, source: null }),
    );
    await renderApp({ route });
    expect(await screen.findByText('Ask session · changes nothing')).toBeVisible();
    expect(screen.queryByText(/web-app/)).toBeNull();
    expect(screen.queryByRole('list', { name: 'Session progress' })).toBeNull();
  });

  it('AC-6 (Q9e): the page bar shows Tickets / the sprint / the key and when it started, with no Open in Jira', async () => {
    server.use(sessionHandler(working));
    await renderApp({ route });

    const crumbs = within(pageBar()).getByRole('navigation', { name: 'Breadcrumb' });
    expect(await within(crumbs).findByText('PROJ-1423')).toHaveAttribute('aria-current', 'page');
    expect(within(crumbs).getByRole('link', { name: 'Tickets' })).toHaveAttribute('href', '/tickets');
    expect(within(crumbs).getByRole('link', { name: 'Sprint 42' })).toHaveAttribute('href', '/tickets');
    expect(within(pageBar()).getByText('Started 4 min ago')).toBeVisible();

    // The user's call, 20 Oct 2026: the Context tab's ticket keeps the way to Jira.
    expect(within(pageBar()).queryByRole('link', { name: 'Open in Jira' })).toBeNull();
  });

  it('Q9e: says Sessions / the key when the ticket wasn’t in a sprint', async () => {
    server.use(sessionHandler({ ...working, sprint: null }));
    await renderApp({ route });
    const crumbs = within(pageBar()).getByRole('navigation', { name: 'Breadcrumb' });
    expect(await within(crumbs).findByText('PROJ-1423')).toBeVisible();
    expect(within(crumbs).getByRole('link', { name: 'Sessions' })).toHaveAttribute('href', '/sessions');
  });

  it('015 AC-24: a session with no ticket says Sessions / its title, has no Context tab, and names what Claude got', async () => {
    server.use(
      sessionHandler({
        ...working,
        title: 'Add a CSV export to the reports page',
        source: null,
        sprint: null,
        jiraUrl: null,
        branch: 'feat/add-a-csv-export-to',
        activities: [
          {
            id: 'step-1',
            state: 'done',
            kind: 'brief',
            key: null,
            tickets: [],
            message: true,
            pullRequests: ['web-app #2836'],
            files: ['~/notes/notes.md'],
            skills: [],
          },
        ],
      }),
    );
    await renderApp({ route: `${route}?tab=context` });

    const crumbs = within(pageBar()).getByRole('navigation', { name: 'Breadcrumb' });
    expect(await within(crumbs).findByText('Add a CSV export to the reports page')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(crumbs).getByRole('link', { name: 'Sessions' })).toBeVisible();
    expect(within(pageBar()).queryByRole('link', { name: 'Open in Jira' })).toBeNull();
    const tabs = screen.getByRole('tablist', { name: 'Session details' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Changes']);
    expect(within(tabs).getByRole('tab', { name: /Changes/ })).toHaveAttribute('aria-selected', 'true');
    const progress = screen.getByRole('region', { name: 'What Claude did' });
    // 022 AC-17: a file by its name, with its full path in the tooltip.
    expect(within(progress).getByText('Your message, web-app #2836 and notes.md')).toHaveAttribute(
      'title',
      '~/notes/notes.md',
    );
  });

  it('AC-16: shows the page bar and skeletons in the page’s shape while the session loads', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.session), async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    await renderApp({ route });

    const crumbs = within(pageBar()).getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Sessions' })).toBeVisible();
    expect(screen.getByRole('main').querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('AC-17: says the page does not exist for an unknown session', async () => {
    server.use(sessionHandler(working));
    await renderApp({ route: '/sessions/fedcba9876543210' });
    expect(await screen.findByText('This page does not exist')).toBeVisible();
  });

  it('AC-17: says the session couldn’t load, and tries again on request', async () => {
    let fail = true;
    server.use(
      http.get(apiUrl(apiRoutes.session), () =>
        fail ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(working),
      ),
    );
    const { user } = await renderApp({ route });

    expect(await within(screen.getByRole('main')).findByText("Couldn't load sessions")).toBeVisible();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Add bulk archive to the content list' }),
    ).toBeVisible();
  });
});
