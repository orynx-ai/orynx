import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type ComposerStart, type NewJiraTicketAnswer } from '@devhub/contracts';
import {
  makeInbox,
  makeJiraTicketTypes,
  makeOpenSprint,
  makeOrynxTicket,
  makeRepository,
  makeSession,
  makeSlackItem,
  makeStatus,
} from '@devhub/contracts/testing';
import { connectedJiraStatus } from '../../../test/jira.ts';
import { apiUrl, server, sessionHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const synced = { state: 'synced', at: '2026-10-17T10:00:00.000Z' } as const;
const row = makeSlackItem();
const mapped = makeRepository({
  id: '00000000000000aa',
  name: 'web-app',
  displayPath: '~/code/web-app',
  jiraProject: 'PROJ',
});
const thread = { kind: 'slack_thread', channel: 'C024BE91L', ts: '1700000000.123456' };

/** Home with one Slack row, Jira as asked, one folder, and every save and start kept. */
function serve({
  jira = true,
  folder = mapped,
  answer = { result: 'made', key: 'PROJ-1501', url: 'https://your-team.atlassian.net/browse/PROJ-1501' },
  start = { result: 'started', sessionId: '00000000000000ab' },
}: { jira?: boolean; folder?: typeof mapped; answer?: NewJiraTicketAnswer; start?: object } = {}) {
  const jiraMade: unknown[] = [];
  const orynxMade: unknown[] = [];
  const started: ComposerStart[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.status), () => HttpResponse.json(jira ? connectedJiraStatus : makeStatus())),
    http.get(apiUrl(apiRoutes.repositories), () => HttpResponse.json({ repositories: [folder] })),
    http.get(apiUrl(apiRoutes.inbox), () => HttpResponse.json(makeInbox({ items: [row], tools: { slack: synced } }))),
    http.get(apiUrl(apiRoutes.jiraTicketTypes), () => HttpResponse.json(makeJiraTicketTypes())),
    http.get(apiUrl(apiRoutes.ticketsSprints), () => HttpResponse.json({ sprints: [makeOpenSprint()] })),
    http.post(apiUrl(apiRoutes.jiraTickets), async ({ request }) => {
      jiraMade.push(await request.json());
      return HttpResponse.json(answer);
    }),
    http.post(apiUrl(apiRoutes.orynxTickets), async ({ request }) => {
      orynxMade.push(await request.json());
      return HttpResponse.json(makeOrynxTicket({ key: 'ORX-7' }));
    }),
    http.post(apiUrl(apiRoutes.sessions), async ({ request }) => {
      started.push((await request.json()) as ComposerStart);
      return HttpResponse.json(start);
    }),
    sessionHandler(makeSession({ id: '00000000000000ab' })),
  );
  return { jiraMade, orynxMade, started };
}

async function openFixThis() {
  const rendered = await renderApp({ route: '/?inbox=slack' });
  const panel = screen.getByRole('region', { name: 'Needs your attention' });
  await rendered.user.click(await within(panel).findByRole('button', { name: `Fix this: ${row.title}` }));
  return { ...rendered, dialog: await screen.findByRole('dialog', { name: 'New ticket' }) };
}

describe('Fix this (spec 016, D)', () => {
  it('AC-34, AC-35: opens on Jira filled in as a Bug, then makes the ticket and starts a Build with the thread', async () => {
    const { jiraMade, started } = serve();
    const { user, dialog, history } = await openFixThis();

    const title = within(dialog).getByRole('textbox', { name: 'Title' });
    expect(title).toHaveValue(row.title);
    expect(title).toHaveFocus();
    expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveValue(
      `Reported by Neha K. in #web-platform: ${row.target.kind === 'external' ? row.target.url : ''}\n\n${row.title}`,
    );
    expect(await within(dialog).findByRole('combobox', { name: 'Type' })).toHaveTextContent('Bug');

    await user.click(within(dialog).getByRole('button', { name: 'Create ticket' }));

    await waitFor(() => {
      expect(started).toHaveLength(1);
    });
    expect(jiraMade).toEqual([expect.objectContaining({ projectKey: 'PROJ', sprintId: 43, title: row.title })]);
    expect(started[0]).toMatchObject({
      message: '',
      mode: 'build',
      repositoryId: mapped.id,
      context: [{ kind: 'jira', key: 'PROJ-1501' }, expect.objectContaining(thread)],
    });
    await waitFor(() => {
      expect(history.location.pathname).toBe('/sessions/00000000000000ab');
    });
  });

  it('AC-36: with the folder on no Jira project, the ticket is Orynx’s own, and the Build starts on it', async () => {
    const { orynxMade, started } = serve({ folder: { ...mapped, jiraProject: null } });
    const { user, dialog } = await openFixThis();

    expect(dialog).toHaveAccessibleDescription('Saved in Orynx on this computer.');
    await user.click(within(dialog).getByRole('button', { name: 'Create ticket' }));

    await waitFor(() => {
      expect(started[0]?.context[0]).toEqual({ kind: 'jira', key: 'ORX-7' });
    });
    expect(orynxMade).toEqual([expect.objectContaining({ title: row.title, type: 'Bug' })]);
  });

  it('AC-37: Jira’s refusal shows in the dialog, and no session starts', async () => {
    const { started } = serve({ answer: { result: 'refused', reason: 'Summary is too long.' } });
    const { user, dialog } = await openFixThis();
    await within(dialog).findByRole('combobox', { name: 'Type' });

    await user.click(within(dialog).getByRole('button', { name: 'Create ticket' }));

    expect(await within(dialog).findByText(/Summary is too long\./)).toBeVisible();
    expect(started).toEqual([]);
  });

  it('AC-38: a ticket made whose session can’t start waits in the composer with the thread, saying why', async () => {
    serve({ start: { result: 'cannot_start', reason: 'too_many' } });
    const { user, dialog } = await openFixThis();
    await within(dialog).findByRole('combobox', { name: 'Type' });

    await user.click(within(dialog).getByRole('button', { name: 'Create ticket' }));

    const strip = await screen.findByRole('list', { name: 'Context for Claude' });
    expect(
      within(strip)
        .getAllByRole('listitem')
        .map((chip) => chip.textContent),
    ).toEqual(['PROJ-1501', 'Neha K. in #web-platform']);
  });

  it('AC-39: Esc closes the dialog and gives focus back to Fix this', async () => {
    serve();
    const { user } = await openFixThis();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: `Fix this: ${row.title}` })).toHaveFocus();
    });
  });
});
