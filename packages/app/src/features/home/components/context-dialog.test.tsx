import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type ComposerChip } from '@devhub/contracts';
import { makeRepository, makeSearchIndex, makeSearchPullRequest, makeSearchTicket } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
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

const box = () => screen.getByRole('textbox', { name: 'Describe a task for Claude' });

describe('the context dialog (spec 022)', () => {
  it('AC-20: lists every chip under Tickets, Pull requests and Files, with what each one is', async () => {
    serve();
    useComposerStore.setState({ chips: five });
    const { user } = await renderApp();
    await user.click(await screen.findByRole('button', { name: '+3: Show all 5 items of context' }));

    const dialog = await screen.findByRole('dialog', { name: 'Context for Claude' });
    expect(
      within(dialog)
        .getAllByRole('tab')
        .map((tab) => [tab.textContent, tab.getAttribute('aria-selected')]),
    ).toEqual([
      ['Tickets 2', 'true'],
      ['Pull requests 2', 'false'],
      ['Files 1', 'false'],
    ]);
    const tickets = within(dialog).getByRole('tabpanel');
    expect(
      within(tickets)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual(['PROJ-1423Add bulk archive · In progress', 'PROJ-1424Archive from the list · To do']);

    await user.click(within(dialog).getByRole('tab', { name: 'Pull requests 2' }));
    expect(
      within(within(dialog).getByRole('tabpanel'))
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual(['web-app #2836Lazy-load people', 'web-app #2841']);
    // A file's second line is its full path.
    await user.click(within(dialog).getByRole('tab', { name: 'Files 1' }));
    expect(within(within(dialog).getByRole('tabpanel')).getByRole('listitem')).toHaveTextContent(
      'notes.md~/notes/notes.md',
    );
    await expectNoAxeViolations(dialog);
  });

  it('AC-21: Remove takes a chip out, the counts and the strip follow, and focus moves on', async () => {
    serve();
    useComposerStore.setState({ chips: five });
    const { user } = await renderApp();
    await user.click(await screen.findByRole('button', { name: '+3: Show all 5 items of context' }));
    const dialog = await screen.findByRole('dialog', { name: 'Context for Claude' });

    await user.click(within(dialog).getByRole('button', { name: 'Remove PROJ-1423' }));

    expect(within(dialog).getByRole('tab', { name: 'Tickets 1' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Remove PROJ-1424' })).toHaveFocus();
    expect(screen.getByText('PROJ-1423 removed')).toBeInTheDocument();
    expect(useComposerStore.getState().chips).toEqual(five.slice(1));

    // The tab goes with its last row, and focus moves to the tab now shown (the user's call, 19 Oct 2026).
    await user.click(within(dialog).getByRole('button', { name: 'Remove PROJ-1424' }));
    expect(within(dialog).getByRole('tab', { name: 'Pull requests 2' })).toHaveFocus();
    expect(within(dialog).getByRole('tab', { name: 'Pull requests 2' })).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).queryByRole('tab', { name: /Tickets/ })).toBeNull();
  });

  it('AC-22: opens on the first tab that holds something, and shows no tab for a kind with nothing', async () => {
    serve();
    useComposerStore.setState({ chips: [file('a.md'), file('b.md'), file('c.md')] });
    const { user } = await renderApp();
    await user.click(await screen.findByRole('button', { name: '+1: Show all 3 items of context' }));
    const dialog = await screen.findByRole('dialog', { name: 'Context for Claude' });
    expect(
      within(dialog)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Files 3']);
    expect(within(dialog).getByRole('tab', { name: 'Files 3' })).toHaveAttribute('aria-selected', 'true');
  });

  it('a ticket’s key opens the ticket dialog over it', async () => {
    serve();
    server.use(http.get(apiUrl(apiRoutes.ticket), () => HttpResponse.json({ result: 'not_found' })));
    useComposerStore.setState({ chips: five });
    const { user } = await renderApp();
    await user.click(await screen.findByRole('button', { name: '+3: Show all 5 items of context' }));
    const dialog = await screen.findByRole('dialog', { name: 'Context for Claude' });

    await user.click(within(dialog).getByRole('button', { name: 'PROJ-1424' }));

    const ticketDialog = await screen.findByRole('dialog', { name: 'PROJ-1424' });
    expect(await within(ticketDialog).findByRole('alert')).toHaveTextContent(
      "Jira can't find PROJ-1424, or you can't see it.",
    );
  });

  it('AC-23: removing every chip closes the dialog and puts focus in the box', async () => {
    serve();
    useComposerStore.setState({ chips: [file('a.md'), file('b.md'), file('c.md')] });
    const { user } = await renderApp();
    await user.click(await screen.findByRole('button', { name: '+1: Show all 3 items of context' }));
    const dialog = await screen.findByRole('dialog', { name: 'Context for Claude' });
    for (const name of ['a.md', 'b.md', 'c.md']) {
      await user.click(within(dialog).getByRole('button', { name: `Remove ${name}` }));
    }
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Context for Claude' })).toBeNull();
    });
    expect(box()).toHaveFocus();
  });

  it('AC-24: Esc or Done closes it; focus returns to +N, or to the box once +N has gone', async () => {
    serve();
    useComposerStore.setState({ chips: five });
    const { user } = await renderApp();
    const more = await screen.findByRole('button', { name: '+3: Show all 5 items of context' });
    await user.click(more);
    await screen.findByRole('dialog', { name: 'Context for Claude' });
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(more).toHaveFocus();
    });

    await user.click(more);
    const dialog = await screen.findByRole('dialog', { name: 'Context for Claude' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove PROJ-1423' }));
    await user.click(within(dialog).getByRole('button', { name: 'Remove PROJ-1424' }));
    await user.click(within(dialog).getByRole('tab', { name: 'Files 1' }));
    await user.click(within(dialog).getByRole('button', { name: 'Remove notes.md' }));
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Context for Claude' })).toBeNull();
    });
    expect(box()).toHaveFocus();
  });
});
