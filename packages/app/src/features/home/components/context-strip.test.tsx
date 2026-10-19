import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type ComposerChip } from '@devhub/contracts';
import { makeRepository, makeSearchIndex, makeSearchPullRequest, makeSearchTicket } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { useComposerStore } from '../store.ts';

const web = makeRepository({ id: '00000000000000aa', name: 'web-app', displayPath: '~/code/web-app' });

function serve() {
  server.use(
    http.get(apiUrl(apiRoutes.repositories), () => HttpResponse.json({ repositories: [web] })),
    http.get(apiUrl(apiRoutes.search), () =>
      HttpResponse.json(
        makeSearchIndex({
          tickets: [
            makeSearchTicket({ key: 'PROJ-1423', title: 'Add bulk archive', status: 'In progress' }),
            makeSearchTicket({ key: 'PROJ-1424', title: 'Archive from the list', status: 'To do' }),
          ],
          pullRequests: [
            makeSearchPullRequest({ id: `acme/web-app#${String(2836)}`, number: 2836, title: 'Lazy-load people' }),
          ],
        }),
      ),
    ),
  );
}

const ticket = (key: string): ComposerChip => ({ kind: 'jira', key });
const pull = (number: number): ComposerChip => ({ kind: 'pull_request', owner: 'acme', name: 'web-app', number });
const file = (name: string): ComposerChip => ({ kind: 'file', path: `~/notes/${name}` });
const five = [ticket('PROJ-1423'), pull(2836), ticket('PROJ-1424'), pull(2841), file('notes.md')];

const strip = () => screen.getByRole('list', { name: 'Context for Claude' });

describe('ContextStrip: two chips, then +N (spec 022)', () => {
  it('AC-18: two chips both show, with no +N', async () => {
    serve();
    useComposerStore.setState({ chips: [ticket('PROJ-1423'), pull(2836)] });
    await renderApp();
    await screen.findByRole('button', { name: 'Remove PROJ-1423' });
    expect(
      within(strip())
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['PROJ-1423', 'web-app #2836']);
    expect(within(strip()).queryByRole('button', { name: /Show all/ })).toBeNull();
  });

  it('a ticket chip opens the ticket dialog; a pull request chip is plain text', async () => {
    serve();
    server.use(http.get(apiUrl(apiRoutes.ticket), () => HttpResponse.json({ result: 'not_found' })));
    useComposerStore.setState({ chips: [ticket('PROJ-1423'), pull(2836)] });
    const { user } = await renderApp();
    const open = await screen.findByRole('button', { name: 'PROJ-1423' });
    expect(within(strip()).queryByRole('button', { name: 'web-app #2836' })).toBeNull();
    await user.click(open);
    expect(await screen.findByRole('dialog', { name: 'PROJ-1423' })).toBeVisible();
  });

  it('AC-19: five chips show the first two added, then +3', async () => {
    serve();
    useComposerStore.setState({ chips: five });
    const { user } = await renderApp();
    const more = await screen.findByRole('button', { name: '+3: Show all 5 items of context' });
    expect(
      within(strip())
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['PROJ-1423', 'web-app #2836', '+3']);

    // Removing a shown chip brings the next one into view.
    await user.click(screen.getByRole('button', { name: 'Remove PROJ-1423' }));
    expect(
      within(strip())
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['web-app #2836', 'PROJ-1424', '+2']);
    expect(more).toHaveAccessibleName('+2: Show all 4 items of context');
  });
});
