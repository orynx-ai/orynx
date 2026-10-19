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
      'Jira ticketSearch by key or title',
      'Pull requestSearch by repo, number or title',
      'File from this computerText files up to 100 KB',
    ]);
    expect(menu).toHaveAccessibleDescription('Tip: you can also paste a Jira key or a pull request link into the box.');
  });

  it('AC-7, AC-8: picks a ticket from your tickets; the popup closes and the box asks what to do with it', async () => {
    serve();
    const { user } = await renderApp();
    await openKind(user, /Jira ticket/);

    const dialog = await screen.findByRole('dialog', { name: 'Jira ticket' });
    expect(within(dialog).getByText('2 open')).toBeVisible();
    expect(within(dialog).getByText('Claude gets the summary, description, comments and linked issues.')).toBeVisible();
    await user.type(within(dialog).getByRole('combobox'), 'header');
    expect(
      within(dialog)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['PROJ-1377Fix the header · To do']);
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Jira ticket' })).toBeNull();
    });
    expect(box()).toHaveFocus();
    expect(chips().map((chip) => chip.textContent)).toEqual(['PROJ-1377']);
    expect(box()).toHaveAttribute('placeholder', 'What should Claude do with PROJ-1377?');
  });

  it('022 AC-1: the ticket added is checked, and picking another adds it after the first', async () => {
    serve();
    useComposerStore.setState({ chips: [{ kind: 'jira', key: 'PROJ-1423' }] });
    const { user } = await renderApp();
    await openKind(user, /Jira ticket/);

    const dialog = await screen.findByRole('dialog', { name: 'Jira ticket' });
    expect(within(dialog).getByRole('option', { name: /PROJ-1423/ })).toHaveAttribute('aria-selected', 'true');
    await user.click(within(dialog).getByRole('option', { name: /PROJ-1377/ }));
    await waitFor(() => {
      expect(chips().map((chip) => chip.textContent)).toEqual(['PROJ-1423', 'PROJ-1377']);
    });
    expect(box()).toHaveAttribute('placeholder', 'What should Claude do with these 2 tickets?');

    await openKind(user, /Jira ticket/);
    const again = await screen.findByRole('dialog', { name: 'Jira ticket' });
    expect(within(again).getByRole('option', { name: /PROJ-1377/ })).toHaveAttribute('aria-selected', 'true');
    // 022 AC-2: picking a ticket that's there already adds nothing.
    await user.click(within(again).getByRole('option', { name: /PROJ-1423/ }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Jira ticket' })).toBeNull();
    });
    expect(chips().map((chip) => chip.textContent)).toEqual(['PROJ-1423', 'PROJ-1377']);
  });

  it('022 AC-3: the Jira list says why an eleventh ticket can’t be added', async () => {
    serve();
    useComposerStore.setState({
      chips: Array.from({ length: 10 }, (_, n) => ({ kind: 'jira', key: `OPS-${String(n + 1)}` })),
    });
    const { user } = await renderApp();
    await openKind(user, /Jira ticket/);
    const dialog = await screen.findByRole('dialog', { name: 'Jira ticket' });
    expect(within(dialog).getByText('A session takes up to 10 tickets.')).toBeVisible();
    expect(within(dialog).queryAllByRole('option')).toEqual([]);
  });

  it('AC-10: offers a key the list doesn’t hold, and says when nothing matches', async () => {
    serve();
    const { user } = await renderApp();
    await openKind(user, /Jira ticket/);
    const dialog = await screen.findByRole('dialog', { name: 'Jira ticket' });

    await user.type(within(dialog).getByRole('combobox'), 'nothing like it');
    expect(within(dialog).getByText('No matches. Try a key like PROJ-1423 or a repo name.')).toBeVisible();
    await user.clear(within(dialog).getByRole('combobox'));
    await user.type(within(dialog).getByRole('combobox'), 'proj-9999');
    await user.click(within(dialog).getByRole('option', { name: 'Add PROJ-9999' }));

    await waitFor(() => {
      expect(chips().map((chip) => chip.textContent)).toEqual(['PROJ-9999']);
    });
  });

  it('022 AC-3: adds a pull request, and says why an eleventh can’t be added', async () => {
    serve();
    const { user } = await renderApp();
    await openKind(user, /Pull request/);
    await user.click(await screen.findByRole('option', { name: /web-app #2841/ }));
    await waitFor(() => {
      expect(chips().map((chip) => chip.textContent)).toEqual(['web-app #2841']);
    });

    useComposerStore.setState({
      chips: Array.from({ length: 10 }, (_, n) => ({
        kind: 'pull_request',
        owner: 'acme',
        name: 'web-app',
        number: n + 1,
      })),
    });
    await openKind(user, /Pull request/);
    const dialog = await screen.findByRole('dialog', { name: 'Pull request' });
    expect(within(dialog).getByText('A session takes up to 10 pull requests.')).toBeVisible();
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

  it('AC-12: a text file becomes a chip; a binary, a large file or a 21st file is said under the composer', async () => {
    serve();
    const { user } = await renderApp();
    await openKind(user, /File from this computer/);
    const input = screen.getByLabelText('File from this computer', { selector: 'input' });

    await user.upload(input, new File(['# Notes'], 'notes.md', { type: 'text/markdown' }));
    await waitFor(() => {
      expect(chips().map((chip) => chip.textContent)).toEqual(['notes.md']);
    });

    await user.upload(input, new File([new Uint8Array([0x89, 0x50, 0xff, 0xfe])], 'logo.png', { type: 'image/png' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("logo.png isn't a text file.");

    await user.upload(input, new File(['x'.repeat(102_401)], 'big.log'));
    expect(await screen.findByRole('alert')).toHaveTextContent('big.log is over 100 KB.');

    useComposerStore.setState({
      chips: Array.from({ length: 20 }, (_, n) => ({ kind: 'file', name: `${String(n + 1)}.md`, text: 'x' })),
    });
    await user.upload(input, new File(['more'], '21.md'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Add up to 20 files.');
  });

  it('AC-32: a tool that isn’t connected says so with the way to Settings; a first sync shows loading rows', async () => {
    serve(makeSearchIndex({ tools: { jira: { state: 'not_connected' }, github: { state: 'syncing' } } }));
    const { user } = await renderApp();
    await openKind(user, /Jira ticket/);
    const jira = await screen.findByRole('dialog', { name: 'Jira ticket' });
    expect(within(jira).getByRole('link', { name: 'Connect Jira in Settings to add tickets.' })).toHaveAttribute(
      'href',
      '/settings/connections',
    );

    await user.click(within(jira).getByRole('button', { name: 'Back to all context types' }));
    await user.click(await screen.findByRole('menuitem', { name: /Pull request/ }));
    const github = await screen.findByRole('dialog', { name: 'Pull request' });
    expect(within(github).getByRole('status')).toHaveTextContent('Loading');
  });
});
