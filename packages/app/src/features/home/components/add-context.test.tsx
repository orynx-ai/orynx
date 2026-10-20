import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type SearchIndex } from '@devhub/contracts';
import { makeRepository, makeSearchIndex, makeSearchPullRequest, makeSearchTicket } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { useComposerStore } from '../store.ts';

const web = makeRepository({ id: '00000000000000aa', name: 'web-app', displayPath: '~/code/web-app' });
const api = makeRepository({ id: '00000000000000bb', name: 'api', displayPath: '~/code/api', jiraProject: null });
const index = makeSearchIndex({
  tickets: [
    makeSearchTicket({ key: 'PROJ-1423', title: 'Add bulk archive', status: 'In progress' }),
    makeSearchTicket({ key: 'PROJ-1377', title: 'Fix the header', status: 'To do' }),
    // Someone else's ticket in the sprint: search finds it, the composer's list leaves it out (the user's call, 20 Oct 2026).
    makeSearchTicket({ key: 'PROJ-1500', title: 'Fix the footer', status: 'To do', mine: false }),
  ],
  pullRequests: [
    makeSearchPullRequest(),
    makeSearchPullRequest({ id: 'acme/api#12', repository: 'api', number: 12, title: 'Page the people API' }),
  ],
});

function serve(search: SearchIndex = index) {
  server.use(
    http.get(apiUrl(apiRoutes.repositories), () => HttpResponse.json({ repositories: [web, api] })),
    http.get(apiUrl(apiRoutes.search), () => HttpResponse.json(search)),
  );
}

const box = () => screen.getByRole('textbox', { name: 'Describe a task for Claude' });
const chips = () => within(screen.getByRole('list', { name: 'Context for Claude' })).getAllByRole('listitem');

async function openKind(user: Awaited<ReturnType<typeof renderApp>>['user'], kind: RegExp) {
  await user.click(await screen.findByRole('button', { name: 'Add context' }));
  await user.click(await screen.findByRole('menuitem', { name: kind }));
}

describe('+ Add context (spec 015)', () => {
  it('AC-6: offers a folder, a ticket, a pull request and a file, with the tip, and no Slack yet (Q12)', async () => {
    serve();
    const { user } = await renderApp();
    await user.click(await screen.findByRole('button', { name: 'Add context' }));

    const menu = await screen.findByRole('menu', { name: 'Add context' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Git repositoryThe folder Claude works in',
      'TicketSearch by key or title',
      'Pull requestSearch by repo, number or title',
      'File from this computerAny file. Claude reads it where it is.',
    ]);
    expect(menu).toHaveAccessibleDescription('Tip: you can also paste a Jira key or a pull request link into the box.');
  });

  it('AC-7, AC-8: ticks a ticket from your tickets; the list stays open, and once closed the box asks what to do with it', async () => {
    serve();
    const { user } = await renderApp();
    await openKind(user, /^Ticket/);

    const dialog = await screen.findByRole('dialog', { name: 'Ticket' });
    expect(within(dialog).getByText('2 open')).toBeVisible();
    expect(within(dialog).getByText('Claude gets the summary, description, comments and linked issues.')).toBeVisible();
    await user.type(within(dialog).getByRole('combobox'), 'header');
    expect(
      within(dialog)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['PROJ-1377Fix the header · To do']);
    await user.keyboard('{Enter}');

    // A checkbox: the list stays open for the next one (the user's call, 19 Oct 2026).
    expect(within(dialog).getByRole('option', { name: /PROJ-1377/ })).toHaveAttribute('aria-selected', 'true');
    expect(chips().map((chip) => chip.textContent)).toEqual(['PROJ-1377']);
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Ticket' })).toBeNull();
    });
    expect(box()).toHaveFocus();
    expect(box()).toHaveAttribute('placeholder', 'What should Claude do with PROJ-1377?');
  });

  it('022 AC-1: the ticket added is ticked, ticking another adds it after the first, and unticking takes it out', async () => {
    serve();
    useComposerStore.setState({ chips: [{ kind: 'jira', key: 'PROJ-1423' }] });
    const { user } = await renderApp();
    await openKind(user, /^Ticket/);

    const dialog = await screen.findByRole('dialog', { name: 'Ticket' });
    expect(within(dialog).getByRole('option', { name: /PROJ-1423/ })).toHaveAttribute('aria-selected', 'true');
    await user.click(within(dialog).getByRole('option', { name: /PROJ-1377/ }));
    await waitFor(() => {
      expect(chips().map((chip) => chip.textContent)).toEqual(['PROJ-1423', 'PROJ-1377']);
    });
    expect(box()).toHaveAttribute('placeholder', 'What should Claude do with these 2 tickets?');
    expect(within(dialog).getByRole('option', { name: /PROJ-1377/ })).toHaveAttribute('aria-selected', 'true');

    await user.click(within(dialog).getByRole('option', { name: /PROJ-1423/ }));
    await waitFor(() => {
      expect(chips().map((chip) => chip.textContent)).toEqual(['PROJ-1377']);
    });
    expect(within(dialog).getByRole('option', { name: /PROJ-1423/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('022 AC-3: the Jira list says why a 101st ticket can’t be added', async () => {
    serve();
    useComposerStore.setState({
      chips: Array.from({ length: 100 }, (_, n) => ({ kind: 'jira', key: `OPS-${String(n + 1)}` })),
    });
    const { user } = await renderApp();
    await openKind(user, /^Ticket/);
    const dialog = await screen.findByRole('dialog', { name: 'Ticket' });
    expect(within(dialog).getByText('A session takes up to 100 tickets.')).toBeVisible();
    expect(within(dialog).queryAllByRole('option')).toEqual([]);
  });

  it('AC-10: offers a key the list doesn’t hold, and says when nothing matches', async () => {
    serve();
    const { user } = await renderApp();
    await openKind(user, /^Ticket/);
    const dialog = await screen.findByRole('dialog', { name: 'Ticket' });

    await user.type(within(dialog).getByRole('combobox'), 'nothing like it');
    expect(within(dialog).getByText('No matches. Try a key like PROJ-1423 or a repo name.')).toBeVisible();
    await user.clear(within(dialog).getByRole('combobox'));
    await user.type(within(dialog).getByRole('combobox'), 'proj-9999');
    await user.click(within(dialog).getByRole('option', { name: 'Add PROJ-9999' }));

    await waitFor(() => {
      expect(chips().map((chip) => chip.textContent)).toEqual(['PROJ-9999']);
    });
  });

  it('022 AC-3: adds a pull request, and says why a 101st can’t be added', async () => {
    serve();
    const { user } = await renderApp();
    await openKind(user, /Pull request/);
    await user.click(await screen.findByRole('option', { name: /web-app #2841/ }));
    await waitFor(() => {
      expect(chips().map((chip) => chip.textContent)).toEqual(['web-app #2841']);
    });

    await user.keyboard('{Escape}');
    useComposerStore.setState({
      chips: Array.from({ length: 100 }, (_, n) => ({
        kind: 'pull_request',
        owner: 'acme',
        name: 'web-app',
        number: n + 1,
      })),
    });
    await openKind(user, /Pull request/);
    const dialog = await screen.findByRole('dialog', { name: 'Pull request' });
    expect(within(dialog).getByText('A session takes up to 100 pull requests.')).toBeVisible();
    expect(within(dialog).queryAllByRole('option')).toEqual([]);
  });

  it('AC-13: a folder sets the folder picker, not a chip', async () => {
    serve();
    const { user } = await renderApp();
    await openKind(user, /Git repository/);
    const dialog = await screen.findByRole('dialog', { name: 'Git repository' });
    expect(within(dialog).getByText('2 folders')).toBeVisible();
    await user.click(within(dialog).getByRole('option', { name: /api/ }));

    expect(await screen.findByRole('button', { name: 'Repository: api' })).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Context for Claude' })).toBeNull();
  });

  it('022 AC-9, AC-10: File from this computer opens the computer’s picker; each file picked of any kind is a chip', async () => {
    serve();
    let picks = 0;
    server.use(
      http.post(apiUrl(apiRoutes.filePicker), () => {
        picks += 1;
        return HttpResponse.json({
          paths: ['~/Movies/demo.mov', '~/notes/release-notes-for-the-people-directory.pdf'],
        });
      }),
    );
    const { user } = await renderApp();
    await openKind(user, /File from this computer/);

    await waitFor(() => {
      expect(chips().map((chip) => chip.textContent)).toEqual(['demo.mov', 'release-notes-f…irectory.pdf']);
    });
    expect(useComposerStore.getState().chips).toEqual([
      { kind: 'file', path: '~/Movies/demo.mov' },
      { kind: 'file', path: '~/notes/release-notes-for-the-people-directory.pdf' },
    ]);
    expect(box()).toHaveFocus();
    expect(picks).toBe(1);
    // AC-14: the same file again is still one chip.
    await openKind(user, /File from this computer/);
    await waitFor(() => {
      expect(picks).toBe(2);
    });
    expect(useComposerStore.getState().chips).toHaveLength(2);
  });

  it('022 AC-11: Cancel in the picker adds nothing', async () => {
    serve();
    server.use(http.post(apiUrl(apiRoutes.filePicker), () => HttpResponse.json({ paths: null })));
    const { user } = await renderApp();
    await openKind(user, /File from this computer/);
    await waitFor(() => {
      expect(box()).toHaveFocus();
    });
    expect(useComposerStore.getState().chips).toEqual([]);
  });

  it('022 AC-13: a file that looks like a secret isn’t added, and a 101st file is said', async () => {
    serve();
    server.use(
      http.post(apiUrl(apiRoutes.filePicker), () => HttpResponse.json({ paths: ['~/.ssh/id_rsa', '~/a.md'] })),
    );
    const { user } = await renderApp();
    await openKind(user, /File from this computer/);

    expect(await screen.findByRole('alert')).toHaveTextContent("id_rsa looks like a secret, so Claude doesn't get it.");
    expect(useComposerStore.getState().chips).toEqual([{ kind: 'file', path: '~/a.md' }]);

    useComposerStore.setState({
      chips: Array.from({ length: 100 }, (_, n) => ({ kind: 'file', path: `~/${String(n + 1)}.md` })),
    });
    server.use(http.post(apiUrl(apiRoutes.filePicker), () => HttpResponse.json({ paths: ['~/101.md'] })));
    await openKind(user, /File from this computer/);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Add up to 100 files.');
    });
  });

  it('022 AC-12: with no picker, Add a file takes a typed path, which the server finds, or says it can’t', async () => {
    serve();
    server.use(
      http.post(apiUrl(apiRoutes.filePicker), () =>
        HttpResponse.json(
          {
            code: 'picker_unavailable',
            message: "Orynx can't open a file picker on this computer. Type the file's path instead.",
          },
          { status: 503 },
        ),
      ),
      http.post(apiUrl(apiRoutes.fileCheck), async ({ request }) => {
        const { path } = (await request.json()) as { path: string };
        return HttpResponse.json(path === '~/notes/plan.pdf' ? { result: 'found', path } : { result: 'not_found' });
      }),
    );
    const { user } = await renderApp();
    await openKind(user, /File from this computer/);

    const dialog = await screen.findByRole('dialog', { name: 'Add a file' });
    expect(dialog).toHaveTextContent("Orynx can't open a file picker on this computer. Type the file's path instead.");
    const path = within(dialog).getByRole('textbox', { name: 'Path' });
    await user.type(path, '~/notes/gone.pdf');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await within(dialog).findByText("Orynx can't find ~/notes/gone.pdf.")).toBeVisible();

    await user.clear(path);
    await user.type(path, '~/notes/plan.pdf');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Add a file' })).toBeNull();
    });
    expect(useComposerStore.getState().chips).toEqual([{ kind: 'file', path: '~/notes/plan.pdf' }]);
    expect(box()).toHaveFocus();
  });

  it('AC-32: a tool that isn’t connected says so with the way to Settings; a first sync shows loading rows', async () => {
    serve(makeSearchIndex({ tools: { jira: { state: 'not_connected' }, github: { state: 'syncing' } } }));
    const { user } = await renderApp();
    await openKind(user, /^Ticket/);
    const jira = await screen.findByRole('dialog', { name: 'Ticket' });
    expect(within(jira).getByRole('link', { name: 'Connect Jira in Settings to add tickets.' })).toHaveAttribute(
      'href',
      '/settings/connections',
    );

    await user.click(within(jira).getByRole('button', { name: 'Back to all context types' }));
    await user.click(await screen.findByRole('menuitem', { name: /Pull request/ }));
    const github = await screen.findByRole('dialog', { name: 'Pull request' });
    expect(within(github).getByRole('status')).toHaveTextContent('Loading');
  });

  it('AC-25 (spec 037): lists Orynx’s own tickets with their mark beside Jira’s, even with Jira not connected', async () => {
    serve(
      makeSearchIndex({
        tickets: [
          makeSearchTicket({
            key: 'ORX-2',
            title: 'Fix the date test',
            status: 'In progress',
            target: { kind: 'ticket' },
          }),
        ],
        pullRequests: [],
        tools: { jira: { state: 'not_connected' }, github: { state: 'not_connected' } },
      }),
    );
    const { user } = await renderApp();
    await openKind(user, /^Ticket/);

    const dialog = await screen.findByRole('dialog', { name: 'Ticket' });
    const option = within(dialog).getByRole('option', { name: /ORX-2/ });
    expect(option).toHaveTextContent('ORX-2Fix the date test · In progress');
    expect(within(dialog).queryByText('Connect Jira in Settings to add tickets.')).toBeNull();
    await user.click(option);

    expect(chips().map((chip) => chip.textContent)).toEqual(['ORX-2']);
  });
});
