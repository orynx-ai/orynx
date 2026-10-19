import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import {
  makeSearchIndex,
  makeSearchPullRequest,
  makeSearchTicket,
  makeSession,
  makeSessionTicket,
} from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server, sessionHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const id = '0123456789abcdef';
const route = `/sessions/${id}`;
const done = makeSession({ id, state: 'done', step: 'review', ticket: makeSessionTicket() });
/** A composer session sent its ticket, another ticket, a pull request and a file. */
const sent = makeSession({
  id,
  state: 'done',
  step: 'review',
  ticket: makeSessionTicket(),
  context: [
    { kind: 'jira', key: 'PROJ-1423' },
    { kind: 'jira', key: 'PROJ-1424' },
    { kind: 'pull_request', owner: 'acme', name: 'web-app', number: 2836 },
    { kind: 'file', path: '~/notes/plan.md' },
  ],
});

function serveSearch() {
  server.use(
    http.get(apiUrl(apiRoutes.search), () =>
      HttpResponse.json(
        makeSearchIndex({
          tickets: [makeSearchTicket({ key: 'PROJ-1424', title: 'Archive from the list', status: 'To do' })],
          pullRequests: [
            makeSearchPullRequest({ id: `acme/web-app#${String(2836)}`, number: 2836, title: 'Lazy-load people' }),
          ],
        }),
      ),
    ),
  );
}

describe('the Context tab (the user’s call, 19 Oct 2026)', () => {
  it('shows the ticket, then every ticket, pull request and file Claude was sent', async () => {
    server.use(sessionHandler(sent));
    serveSearch();
    const { user, platform } = await renderApp({ route: `${route}?tab=context` });

    const panel = await screen.findByRole('tabpanel', { name: 'Context 4' });
    expect(within(panel).getByText('Story')).toBeVisible();
    const list = within(panel).getByRole('list', { name: 'Context Claude was sent' });
    await waitFor(() => {
      expect(
        within(list)
          .getAllByRole('listitem')
          .map((row) => row.textContent),
      ).toEqual([
        'PROJ-1423',
        'PROJ-1424Archive from the list · To do',
        'web-app #2836Lazy-load people',
        'plan.md~/notes/plan.md',
      ]);
    });
    expect(within(panel).getByText("Claude's brief")).toBeVisible();
    await expectNoAxeViolations(panel);

    await user.click(within(list).getByRole('link', { name: 'web-app #2836' }));
    expect(platform.openExternal).toHaveBeenCalledWith('https://github.com/acme/web-app/pull/2836');
    expect(within(list).queryByRole('button', { name: 'plan.md' })).toBeNull();
    // A file's path can be copied.
    await user.click(within(list).getByRole('button', { name: 'Copy ~/notes/plan.md' }));
    expect(await navigator.clipboard.readText()).toBe('~/notes/plan.md');
  });

  it('a ticket’s key opens the ticket dialog', async () => {
    server.use(
      sessionHandler(sent),
      http.get(apiUrl(apiRoutes.ticket), () => HttpResponse.json({ result: 'not_found' })),
    );
    const { user } = await renderApp({ route: `${route}?tab=context` });
    const list = await screen.findByRole('list', { name: 'Context Claude was sent' });

    await user.click(within(list).getByRole('button', { name: 'PROJ-1424' }));

    const dialog = await screen.findByRole('dialog', { name: 'PROJ-1424' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "Jira can't find PROJ-1424, or you can't see it.",
    );
  });

  it('a session saved before the list was kept shows its ticket alone', async () => {
    server.use(sessionHandler(done));
    await renderApp({ route: `${route}?tab=context` });
    const list = await screen.findByRole('list', { name: 'Context Claude was sent' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByRole('button', { name: 'PROJ-1423' })).toBeVisible();
  });

  it('a session with no ticket lists what it was sent, without the ticket or its brief note', async () => {
    server.use(
      sessionHandler({
        ...sent,
        source: null,
        ticket: null,
        jiraUrl: null,
        context: [{ kind: 'pull_request', owner: 'acme', name: 'web-app', number: 2836 }],
      }),
    );
    await renderApp({ route: `${route}?tab=context` });
    const panel = await screen.findByRole('tabpanel', { name: 'Context 1' });
    expect(within(panel).getByRole('link', { name: 'web-app #2836' })).toBeVisible();
    expect(within(panel).queryByText("Claude's brief")).toBeNull();
    expect(within(panel).queryByRole('link', { name: 'Open in Jira' })).toBeNull();
  });
});
