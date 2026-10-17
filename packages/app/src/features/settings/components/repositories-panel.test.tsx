import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type Repository } from '@devhub/contracts';
import { makeRepository } from '@devhub/contracts/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const intranet = makeRepository();
const mobile = makeRepository({
  id: 'fedcba9876543210',
  path: '/Users/dev/code/mobile',
  name: 'mobile',
  displayPath: '~/code/mobile',
  jiraProject: null,
});

function listing(folders: () => Repository[]) {
  server.use(http.get(apiUrl(apiRoutes.repositories), () => HttpResponse.json({ repositories: folders() })));
}

function folderList() {
  return screen.findByRole('list', { name: 'Folders' });
}

describe('RepositoriesPanel', () => {
  it('AC-4: says what the tab is for, offers Add local folder, and says no folder is there yet', async () => {
    await renderApp({ route: '/settings/repositories' });

    expect(await screen.findByText('No folders yet')).toBeVisible();
    expect(screen.getByText('Add a folder so Claude can work on its code.')).toBeVisible();
    expect(screen.getByText('Folders on this computer that Claude can work in')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add local folder' })).toBeEnabled();
  });

  it('AC-6: shows each folder with its name, its path with ~, its Jira project and Remove', async () => {
    listing(() => [intranet, mobile]);
    await renderApp({ route: '/settings/repositories' });

    const rows = within(await folderList()).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    const [first, second] = rows as [HTMLElement, HTMLElement];
    expect(first).toHaveTextContent('intranet-web');
    expect(within(first).getByText('~/code/intranet-web')).toBeVisible();
    expect(within(first).getByText('Jira PROJ')).toBeVisible();
    expect(within(first).getByRole('button', { name: 'Remove intranet-web' })).toBeEnabled();
    expect(within(second).getByText('~/code/mobile')).toBeVisible();
    expect(within(second).queryByText(/^Jira /)).not.toBeInTheDocument();
    expect(screen.queryByText('No folders yet')).not.toBeInTheDocument();
  });

  it('AC-11: removes the row at once, moves focus to the next Remove and says what was removed', async () => {
    let folders = [intranet, mobile];
    listing(() => folders);
    let removed: string | undefined;
    server.use(
      http.delete(apiUrl(apiRoutes.repository), async ({ params }) => {
        removed = String(params['id']);
        await delay(50);
        folders = folders.filter((folder) => folder.id !== removed);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await renderApp({ route: '/settings/repositories' });
    await folderList();

    await user.click(screen.getByRole('button', { name: 'Remove intranet-web' }));

    expect(screen.queryByText('~/code/intranet-web')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove mobile' })).toHaveFocus();
    // Said once the server has forgotten it, so a failed removal never claims it happened.
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Removed intranet-web.');
    });
    expect(removed).toBe(intranet.id);
  });

  it('AC-11: moves focus to Add local folder when the last folder goes', async () => {
    let folders = [mobile];
    listing(() => folders);
    server.use(
      http.delete(apiUrl(apiRoutes.repository), () => {
        folders = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await renderApp({ route: '/settings/repositories' });
    await folderList();

    await user.click(screen.getByRole('button', { name: 'Remove mobile' }));

    expect(screen.getByRole('button', { name: 'Add local folder' })).toHaveFocus();
    expect(await screen.findByText('No folders yet')).toBeVisible();
  });

  it('AC-14: brings the folder back and says so when the removal fails', async () => {
    listing(() => [intranet, mobile]);
    server.use(
      http.delete(apiUrl(apiRoutes.repository), () =>
        HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 }),
      ),
    );
    const { user } = await renderApp({ route: '/settings/repositories' });
    await folderList();

    await user.click(screen.getByRole('button', { name: 'Remove intranet-web' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save that change. Check that DevHub is still running, then try again.",
    );
    expect(screen.getByText('~/code/intranet-web')).toBeVisible();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove intranet-web' })).toHaveFocus();
    });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('AC-11: holding Enter on Remove removes one folder, not one after another', async () => {
    listing(() => [intranet, mobile]);
    const removed: string[] = [];
    server.use(
      http.delete(apiUrl(apiRoutes.repository), async ({ params }) => {
        removed.push(String(params['id']));
        await delay(20);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await renderApp({ route: '/settings/repositories' });
    await folderList();
    screen.getByRole('button', { name: 'Remove intranet-web' }).focus();

    await user.keyboard('{Enter>3/}');

    await waitFor(() => {
      expect(removed).toEqual([intranet.id]);
    });
    expect(screen.getByRole('button', { name: 'Remove mobile' })).toBeVisible();
  });

  it('AC-15: keeps the intro line and Add local folder in place while the folders load', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.repositories), async () => {
        await delay('infinite');
        return HttpResponse.json({ repositories: [] });
      }),
    );
    await renderApp({ route: '/settings/repositories' });

    expect(await screen.findByText('Folders on this computer that Claude can work in')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add local folder' })).toBeVisible();
    expect(screen.queryByText('No folders yet')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Folders' })).not.toBeInTheDocument();
  });

  it('AC-16: says the server is out of reach when the folders fail to load', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.repositories), () =>
        HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 }),
      ),
    );
    await renderApp({ route: '/settings/repositories' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the DevHub server');
  });

  it('AC-17: shows a folder another tab added', async () => {
    let folders: Repository[] = [];
    listing(() => folders);
    await renderApp({ route: '/settings/repositories' });
    await screen.findByText('No folders yet');

    folders = [intranet];
    FakeEventSource.latest().emit({ type: 'settings.changed' });

    expect(await screen.findByText('~/code/intranet-web')).toBeVisible();
  });
});
