import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type Repository } from '@devhub/contracts';
import { makeRepository } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { useComposerStore } from '../store.ts';

const web = makeRepository({
  id: '00000000000000aa',
  name: 'web-app',
  displayPath: '~/code/web-app',
  jiraProject: 'PROJ',
});
const api = makeRepository({ id: '00000000000000bb', name: 'api', displayPath: '~/code/api', jiraProject: null });

function folders(...repositories: Repository[]) {
  server.use(http.get(apiUrl(apiRoutes.repositories), () => HttpResponse.json({ repositories })));
}

describe('the composer’s folder picker (spec 015)', () => {
  it('AC-16: lists your folders with their paths, the shown one checked, then Add local folder and Manage folders', async () => {
    folders(web, api);
    useComposerStore.setState({ lastUsed: api.id });
    const { user, history } = await renderApp();

    const picker = await screen.findByRole('button', { name: 'Repository: api' });
    await user.click(picker);
    const menu = await screen.findByRole('menu', { name: 'Repository' });
    expect(within(menu).getByText('On this computer')).toBeVisible();
    const choices = within(menu).getAllByRole('menuitemradio');
    expect(choices.map((choice) => choice.textContent)).toEqual(['web-app~/code/web-app', 'api~/code/api']);
    expect(within(menu).getByRole('menuitemradio', { name: /api/ })).toHaveAttribute('aria-checked', 'true');

    await user.click(within(menu).getByRole('menuitemradio', { name: /web-app/ }));
    expect(await screen.findByRole('button', { name: 'Repository: web-app' })).toBeVisible();
    expect(useComposerStore.getState().picked).toBe(web.id);

    await user.click(screen.getByRole('button', { name: 'Repository: web-app' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Manage folders' }));
    expect(history.location.pathname).toBe('/settings/repositories');
  });

  it('AC-17 (Q7): follows the ticket to its project’s folder, until you pick one yourself', async () => {
    folders(web, api);
    useComposerStore.setState({ lastUsed: api.id, chips: [{ kind: 'jira', key: 'PROJ-1423' }] });
    const { user } = await renderApp();
    expect(await screen.findByRole('button', { name: 'Repository: web-app' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Repository: web-app' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /api/ }));
    useComposerStore.getState().addChip({ kind: 'jira', key: 'PROJ-7' });
    expect(await screen.findByRole('button', { name: 'Repository: api' })).toBeVisible();
  });

  it('AC-18: with no folders it reads Add a folder and opens the folder dialog', async () => {
    folders();
    const { user } = await renderApp();
    await user.click(await screen.findByRole('button', { name: 'Add a folder' }));
    expect(await screen.findByRole('dialog', { name: 'Add a folder' })).toBeVisible();
  });

  it('Q7: a project with two folders asks you to choose', async () => {
    folders(web, { ...web, id: '00000000000000cc', name: 'web-app-2', path: '/Users/dev/code/web-app-2' }, api);
    useComposerStore.setState({ chips: [{ kind: 'jira', key: 'PROJ-1423' }] });
    await renderApp();
    expect(await screen.findByRole('button', { name: 'Choose folder' })).toBeVisible();
  });

  it('AC-16: Add local folder opens the folder dialog with the ticket’s project, and picks the new folder', async () => {
    folders(web);
    server.use(
      http.post(apiUrl(apiRoutes.repositories), () => HttpResponse.json(api, { status: 201 })),
      http.get(apiUrl(apiRoutes.jiraProjects), () => HttpResponse.json({ projects: [] })),
    );
    const { user } = await renderApp();
    await user.click(await screen.findByRole('button', { name: 'Repository: web-app' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Add local folder' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a folder' });

    await user.type(within(dialog).getByLabelText(/^Folder/), '~/code/api');
    await user.click(within(dialog).getByRole('button', { name: 'Add folder' }));

    await waitFor(() => {
      expect(useComposerStore.getState().picked).toBe(api.id);
    });
  });
});

describe('Ask’s folder (spec 031, Q2)', () => {
  it('AC-2: starts on No folder, which its menu offers first, and picking a folder or No folder sets it', async () => {
    folders(web, api);
    useComposerStore.setState({ lastUsed: api.id, mode: 'ask' });
    const { user } = await renderApp();

    await user.click(await screen.findByRole('button', { name: 'Repository: No folder' }));
    const menu = await screen.findByRole('menu', { name: 'Repository' });
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((choice) => choice.textContent),
    ).toEqual(['No folderClaude reads only what you add', 'web-app~/code/web-app', 'api~/code/api']);
    expect(within(menu).getByRole('menuitemradio', { name: /No folder/ })).toHaveAttribute('aria-checked', 'true');

    await user.click(within(menu).getByRole('menuitemradio', { name: /web-app/ }));
    await user.click(await screen.findByRole('button', { name: 'Repository: web-app' }));
    await user.click(
      within(await screen.findByRole('menu', { name: 'Repository' })).getByRole('menuitemradio', { name: /No folder/ }),
    );
    expect(await screen.findByRole('button', { name: 'Repository: No folder' })).toBeVisible();
    expect(useComposerStore.getState().picked).toBeNull();
  });

  it('AC-3: with no folders in Settings, Ask reads No folder, not Add a folder', async () => {
    folders();
    useComposerStore.setState({ mode: 'ask' });
    await renderApp();
    expect(await screen.findByRole('button', { name: 'Repository: No folder' })).toHaveTextContent('No folder');
    expect(screen.queryByRole('button', { name: 'Add a folder' })).toBeNull();
  });
});
