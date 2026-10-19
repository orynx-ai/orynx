import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeSession, makeSessionTicket } from '@devhub/contracts/testing';
import { server, sessionHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const id = '0123456789abcdef';

const route = `/sessions/${id}?tab=context`;
/** The Context tab's panel, named by its tab: the session's ticket alone. */
const ticketTab = () => screen.getByRole('tabpanel', { name: 'Context 1' });

describe('TicketPanel', () => {
  it('AC-9: shows the ticket as Claude got it, with its status and due date, and Open in Jira', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 13, 10, 0) });
    server.use(
      sessionHandler(makeSession({ id, title: 'Add bulk archive to the content list', ticket: makeSessionTicket() })),
    );
    const { user, platform } = await renderApp({ route });
    const tab = await screen.findByRole('tabpanel', { name: 'Context 1' });

    expect(within(tab).getByText('Jira')).toBeInTheDocument();
    const sent = within(tab).getByRole('list', { name: 'Context Claude was sent' });
    // The ticket's key at the top; the Context list under it names the ticket too.
    expect(
      within(tab)
        .getAllByText('PROJ-1423')
        .filter((key) => !sent.contains(key)),
    ).toHaveLength(1);
    expect(within(tab).getByText('Story')).toBeVisible();
    expect(within(tab).getByText('In progress')).toBeVisible();
    expect(within(tab).getByText('Due Fri')).toBeVisible();
    expect(within(tab).getByText(/^Content managers need to archive many items/)).toBeVisible();
    expect(within(tab).getByRole('heading', { name: 'Acceptance criteria' })).toBeVisible();
    // The description's four criteria.
    expect(
      within(tab)
        .getAllByRole('listitem')
        .filter((item) => !sent.contains(item)),
    ).toHaveLength(4);
    expect(within(tab).getByText("Claude's brief")).toBeVisible();
    expect(
      within(tab).getByText(
        "Claude started from this ticket's title and description, as they were when the session started. Comments, linked issues and other fields weren't sent.",
      ),
    ).toBeVisible();

    await user.click(within(tab).getByRole('link', { name: 'Open in Jira' }));
    expect(platform.openExternal).toHaveBeenCalledWith('https://your-team.atlassian.net/browse/PROJ-1423');
    vi.useRealTimers();
  });

  it('AC-9: leaves out the status and due date the cache doesn’t have, and says when there’s no description', async () => {
    server.use(
      sessionHandler(
        makeSession({ id, ticket: makeSessionTicket({ description: null, status: null, dueDate: null }) }),
      ),
    );
    await renderApp({ route });
    await screen.findByRole('tabpanel', { name: 'Context 1' });
    expect(within(ticketTab()).getByText('This ticket has no description.')).toBeVisible();
    expect(within(ticketTab()).queryByText('In progress')).toBeNull();
    expect(within(ticketTab()).queryByText(/^Due /)).toBeNull();
  });

  it('AC-10: opens a link in the description outside Orynx', async () => {
    server.use(
      sessionHandler(
        makeSession({
          id,
          ticket: makeSessionTicket({ description: 'See [the design](https://figma.example.com/f).' }),
        }),
      ),
    );
    const { user, platform } = await renderApp({ route });
    await screen.findByRole('tabpanel', { name: 'Context 1' });
    await user.click(within(ticketTab()).getByRole('link', { name: 'the design' }));
    expect(platform.openExternal).toHaveBeenCalledWith('https://figma.example.com/f');
  });
});
