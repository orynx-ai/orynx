import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type Tickets, type TicketsChoice } from '@devhub/contracts';
import { makeJiraConnection, makeOpenSprint, makeTicket, makeTickets } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { designTickets } from '../../../test/tickets.ts';

const webSprint = { id: 43, name: 'Sprint 43', endsAt: '2026-10-24T17:00:00.000Z', projectKey: 'WEB' };
const webTicket = makeTicket({ key: 'WEB-7', title: 'Ship the new footer' });

/**
 * A server that keeps Tickets' choice as the real one does: your Sprint 42 until a project is picked, then
 * that project's sprint (WEB: Sprint 43; OPS: none). Records each choice saved.
 */
function pickingServer({ sprints = 'listed' }: { sprints?: 'listed' | 'none' | 'fails' } = {}) {
  let choice: TicketsChoice = { projectKey: null, sprintId: null };
  const saved: TicketsChoice[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.jiraConnection), () =>
      HttpResponse.json(makeJiraConnection({ saved: { site: 'your-team.atlassian.net', email: 'dev@example.com' } })),
    ),
    http.get(apiUrl(apiRoutes.jiraProjects), () =>
      HttpResponse.json({
        projects: [
          { key: 'OPS', name: 'Operations' },
          { key: 'PROJ', name: 'Intranet' },
          { key: 'WEB', name: 'Website' },
        ],
      }),
    ),
    http.get(apiUrl(apiRoutes.tickets), () => {
      const answer: Partial<Tickets> =
        choice.projectKey === null
          ? { tickets: designTickets }
          : choice.projectKey === 'OPS'
            ? { sprint: null, tickets: [] }
            : {
                sprint: { ...webSprint, ...(choice.sprintId === 44 ? { id: 44, name: 'Sprint 44' } : {}) },
                tickets: [webTicket],
              };
      return HttpResponse.json(makeTickets({ ...answer, choice }));
    }),
    http.get(apiUrl(apiRoutes.ticketsSprints), () => {
      if (sprints === 'fails') {
        return HttpResponse.json({ code: 'integration_unreachable', message: 'Jira didn’t answer.' }, { status: 502 });
      }
      return HttpResponse.json({
        sprints:
          sprints === 'none'
            ? []
            : [
                makeOpenSprint(),
                makeOpenSprint({
                  id: 44,
                  name: 'Sprint 44',
                  state: 'future',
                  startsAt: '2026-10-27T09:00:00.000Z',
                  endsAt: null,
                }),
              ],
      });
    }),
    http.put(apiUrl(apiRoutes.ticketsChoice), async ({ request }) => {
      choice = (await request.json()) as TicketsChoice;
      saved.push(choice);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return { saved };
}

const project = () => screen.getByRole('button', { name: /^Project / });
const sprint = () => screen.getByRole('button', { name: /^Sprint / });

describe('Tickets: Project and Sprint (spec 020)', () => {
  it('AC-25: with nothing picked, Project reads Your sprint and Sprint names the sprint shown', async () => {
    pickingServer();
    await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    expect(project()).toHaveTextContent('Project Your sprint');
    expect(sprint()).toHaveTextContent('Sprint Sprint 42');
  });

  it('AC-26, AC-38: Project searches the projects; picking one shows its current sprint', async () => {
    const save = pickingServer();
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    await user.click(project());
    const list = screen.getByRole('listbox', { name: 'Search projects' });
    await waitFor(() => {
      expect(
        within(list)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['Your sprint', 'OPS · Operations', 'PROJ · Intranet', 'WEB · Website']);
    });
    await user.keyboard('site{Enter}');

    expect(await screen.findByRole('link', { name: 'Ship the new footer' })).toBeVisible();
    expect(save.saved).toEqual([{ projectKey: 'WEB', sprintId: null }]);
    expect(project()).toHaveTextContent('Project WEB');
    expect(sprint()).toHaveTextContent('Sprint Sprint 43');
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Sprint 43')).toBeVisible();
  });

  it('AC-26: Sprint lists the project’s active then future sprints with their dates; picking one holds it', async () => {
    const save = pickingServer();
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    await user.click(sprint());
    const menu = await screen.findByRole('menu', { name: 'Sprint' });
    await within(menu).findByRole('menuitemradio', { name: /Sprint 43/ });
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent),
    ).toEqual(['Sprint 43Active · ends 24 Oct', 'Sprint 44Future · starts 27 Oct']);
    await user.click(within(menu).getByRole('menuitemradio', { name: /Sprint 44/ }));

    await waitFor(() => {
      expect(sprint()).toHaveTextContent('Sprint Sprint 44');
    });
    // Your sprint's board belongs to PROJ, so its sprints are PROJ's.
    expect(save.saved).toEqual([{ projectKey: 'PROJ', sprintId: 44 }]);
  });

  it('AC-28: a picked project with no open sprint says so, and the pickers stay to pick another', async () => {
    pickingServer({ sprints: 'none' });
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    await user.click(project());
    await user.keyboard('ops{Enter}');

    expect(await screen.findByText('OPS has no open sprints.')).toBeVisible();
    await user.click(sprint());
    expect(
      await within(await screen.findByRole('menu', { name: 'Sprint' })).findByText('OPS has no open sprints.'),
    ).toBeVisible();
  });

  it('AC-28: when the sprints don’t load, the menu says so and Try again asks again', async () => {
    pickingServer({ sprints: 'fails' });
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    await user.click(sprint());
    const menu = await screen.findByRole('menu', { name: 'Sprint' });

    expect(await within(menu).findByText("Sprints didn't load.")).toBeVisible();
    expect(within(menu).getByRole('menuitem', { name: 'Try again' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(sprint()).toHaveTextContent('Sprint Sprint 42');
  });

  it('shows two loading rows in the Sprint menu while the sprints are on their way', async () => {
    pickingServer();
    server.use(
      http.get(apiUrl(apiRoutes.ticketsSprints), async () => {
        await delay('infinite');
        return HttpResponse.json({ sprints: [] });
      }),
    );
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    await user.click(sprint());

    const menu = await screen.findByRole('menu', { name: 'Sprint' });
    expect(within(menu).getByRole('status')).toHaveTextContent('Loading sprints');
  });

  it('AC-29: picking Your sprint again goes back to the automatic sprint', async () => {
    const save = pickingServer();
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');
    await user.click(project());
    await user.keyboard('web{Enter}');
    await screen.findByRole('link', { name: 'Ship the new footer' });

    await user.click(project());
    await user.click(screen.getByRole('option', { name: 'Your sprint' }));

    expect(await screen.findByText('6 tickets')).toBeVisible();
    expect(save.saved.at(-1)).toEqual({ projectKey: null, sprintId: null });
    expect(project()).toHaveTextContent('Project Your sprint');
  });
});
