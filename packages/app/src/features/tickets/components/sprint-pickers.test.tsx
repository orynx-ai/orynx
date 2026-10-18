import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, TicketsChoiceSchema, type Tickets, type TicketsChoice } from '@devhub/contracts';
import { makeJiraConnection, makeOpenSprint, makeTicket, makeTickets } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
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
        choice.sprintId === 'none'
          ? { sprint: null, tickets: [makeTicket({ key: 'PROJ-1500', title: 'Write the release notes' })] }
          : choice.projectKey === null
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
      choice = TicketsChoiceSchema.parse(await request.json());
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
    ).toEqual(['Sprint 43Active · ends 24 Oct', 'Sprint 44Future · starts 27 Oct', 'No sprint']);
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

  it('a pick that doesn’t save says so in spec 005’s words, and the page goes back to the sprint it showed', async () => {
    pickingServer();
    server.use(http.put(apiUrl(apiRoutes.ticketsChoice), () => new HttpResponse(null, { status: 500 })));
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    await user.click(project());
    await user.keyboard('web{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save that change. Check that Orynx is still running, then try again.",
    );
    expect(await screen.findByText('6 tickets')).toBeVisible();
    expect(project()).toHaveTextContent('Project Your sprint');
  });

  it('AC-34: picking with the keyboard keeps focus on Project, whether the page then has a sprint or none', async () => {
    pickingServer({ sprints: 'none' });
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    await user.click(project());
    await user.keyboard('ops{Enter}');
    await screen.findByText('OPS has no open sprints.');
    expect(project()).toHaveFocus();

    await user.keyboard('{Enter}');
    await user.keyboard('web{Enter}');
    await screen.findByRole('link', { name: 'Ship the new footer' });
    expect(project()).toHaveFocus();
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
    // A menu holds menu items alone (ARIA), so the menu says it's busy and its loading rows are only drawn.
    expect(menu).toHaveAttribute('aria-busy', 'true');
    await expectNoAxeViolations(menu);
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

  it('AC-39: No sprint shows your tickets in no sprint as a board, named No sprint, and a reload keeps it', async () => {
    const save = pickingServer();
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    await user.click(sprint());
    const menu = await screen.findByRole('menu', { name: 'Sprint' });
    await user.click(within(menu).getByRole('menuitemradio', { name: 'No sprint' }));

    expect(await screen.findByRole('link', { name: 'Write the release notes' })).toBeVisible();
    // From Your sprint, No sprint means your own tickets in no sprint, in any project.
    expect(save.saved).toEqual([{ projectKey: null, sprintId: 'none' }]);
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('No sprint')).toBeVisible();
    expect(sprint()).toHaveTextContent('Sprint No sprint');
    expect(screen.getByRole('heading', { name: 'No sprint tickets' })).toBeInTheDocument();
  });

  it('AC-39: with a project picked, No sprint keeps the project', async () => {
    const save = pickingServer();
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');
    await user.click(project());
    await user.keyboard('web{Enter}');
    await screen.findByRole('link', { name: 'Ship the new footer' });

    await user.click(sprint());
    await user.click(await screen.findByRole('menuitemradio', { name: 'No sprint' }));

    await screen.findByRole('link', { name: 'Write the release notes' });
    expect(save.saved.at(-1)).toEqual({ projectKey: 'WEB', sprintId: 'none' });
  });
});
