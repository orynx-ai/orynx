import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type AddRepositoryRequest, type Repository, type UpdateRepositoryRequest } from '@devhub/contracts';
import { makeJiraConnection, makeRepository } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const projects = [
  { key: 'MOB', name: 'Mobile' },
  { key: 'PROJ', name: 'Intranet' },
];
const jiraConnected = makeJiraConnection({ saved: { site: 'your-team.atlassian.net', email: 'dev@example.com' } });

/** A server that saves what the form sends, like the real one, and remembers each request. */
function savingServer() {
  const folders: Repository[] = [];
  const sent: AddRepositoryRequest[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.repositories), () => HttpResponse.json({ repositories: folders })),
    http.post(apiUrl(apiRoutes.repositories), async ({ request }) => {
      const body = (await request.json()) as AddRepositoryRequest;
      sent.push(body);
      const folder = makeRepository({ jiraProject: body.jiraProject });
      folders.push(folder);
      return HttpResponse.json(folder, { status: 201 });
    }),
  );
  return { sent };
}

function jira({ connected = true, list = true }: { connected?: boolean; list?: boolean } = {}) {
  server.use(
    http.get(apiUrl(apiRoutes.jiraConnection), () =>
      HttpResponse.json(connected ? jiraConnected : makeJiraConnection()),
    ),
    http.get(apiUrl(apiRoutes.jiraProjects), () =>
      list
        ? HttpResponse.json({ projects })
        : HttpResponse.json(
            { code: 'integration_unreachable', message: "Can't reach your-team.atlassian.net." },
            { status: 502 },
          ),
    ),
  );
}

/** Settings › Repositories with the Add a folder dialog open (spec 020: a dialog, no longer a form under the button). */
async function openForm() {
  const rendered = await renderApp({ route: '/settings/repositories' });
  await rendered.user.click(await screen.findByRole('button', { name: 'Add local folder' }));
  const form = await screen.findByRole('dialog', { name: 'Add a folder' });
  return { ...rendered, form };
}

describe('FolderDialog: Add a folder', () => {
  it('AC-5, AC-19 (spec 020): opens a dialog with Folder focused and my Jira projects listed, "No Jira project" picked', async () => {
    jira();
    const { form } = await openForm();

    expect(within(form).getByRole('textbox', { name: 'Folder' })).toHaveFocus();
    expect(within(form).getByRole('textbox', { name: 'Folder' })).toHaveAccessibleDescription(
      "The folder's full path, for example ~/code/intranet-web.",
    );
    const select = within(form).getByRole('combobox', { name: 'Jira project' });
    await waitFor(() => {
      expect(
        within(select)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['No Jira project', 'MOB · Mobile', 'PROJ · Intranet']);
    });
    expect(select).toHaveValue('');
    expect(select).toHaveAccessibleDescription('Tickets from this project open in this folder.');
    expect(within(form).getByRole('button', { name: 'Add folder' })).toBeEnabled();
    expect(within(form).getByRole('button', { name: 'Cancel' })).toBeEnabled();
    // The page behind a dialog is hidden from screen readers while it's open.
    expect(screen.getByRole('button', { name: 'Add local folder', hidden: true })).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
  });

  it('AC-6, AC-19: adds the folder with its project, closes the dialog and puts focus back on Add local folder', async () => {
    jira();
    const save = savingServer();
    const { user, form } = await openForm();
    const select = within(form).getByRole('combobox', { name: 'Jira project' });
    await waitFor(() => {
      expect(select).toBeEnabled();
    });

    await user.type(within(form).getByRole('textbox', { name: 'Folder' }), '~/code/intranet-web');
    await user.selectOptions(select, 'PROJ');
    await user.click(within(form).getByRole('button', { name: 'Add folder' }));

    expect(await screen.findByText('~/code/intranet-web')).toBeVisible();
    expect(screen.getByText('Jira PROJ')).toBeVisible();
    expect(save.sent).toEqual([{ path: '~/code/intranet-web', jiraProject: 'PROJ' }]);
    expect(screen.queryByRole('dialog', { name: 'Add a folder' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add local folder' })).toHaveFocus();
  });

  it('AC-19: Enter in the Folder field sends the form', async () => {
    jira({ connected: false });
    const save = savingServer();
    const { user, form } = await openForm();

    await user.type(within(form).getByRole('textbox', { name: 'Folder' }), '~/code/intranet-web{Enter}');

    await waitFor(() => {
      expect(save.sent).toEqual([{ path: '~/code/intranet-web', jiraProject: null }]);
    });
  });

  it('AC-7: asks for a path, then a full path, before anything is sent', async () => {
    jira();
    const save = savingServer();
    const { user, form } = await openForm();
    const folder = within(form).getByRole('textbox', { name: 'Folder' });

    await user.click(within(form).getByRole('button', { name: 'Add folder' }));
    expect(folder).toHaveAccessibleDescription("Enter the folder's path.");
    expect(folder).toHaveFocus();

    await user.type(folder, 'code/app');
    await user.click(within(form).getByRole('button', { name: 'Add folder' }));
    expect(folder).toHaveAccessibleDescription('Enter the full path, starting with / or ~.');
    expect(save.sent).toEqual([]);
  });

  it("AC-7: puts the server's reason under Folder and focuses it", async () => {
    jira();
    server.use(
      http.post(apiUrl(apiRoutes.repositories), () =>
        HttpResponse.json(
          {
            code: 'folder_rejected',
            message: "This folder isn't a git repository. Claude works on a branch, so it needs one.",
          },
          { status: 422 },
        ),
      ),
    );
    const { user, form } = await openForm();
    const folder = within(form).getByRole('textbox', { name: 'Folder' });

    await user.type(folder, '~/plain');
    await user.click(within(form).getByRole('button', { name: 'Add folder' }));

    await waitFor(() => {
      expect(folder).toHaveAccessibleDescription(
        "This folder isn't a git repository. Claude works on a branch, so it needs one.",
      );
    });
    expect(folder).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Add a folder' })).toBeVisible();
  });

  it('says the server is out of reach in one line above the buttons', async () => {
    jira();
    server.use(http.post(apiUrl(apiRoutes.repositories), () => HttpResponse.error()));
    const { user, form } = await openForm();

    await user.type(within(form).getByRole('textbox', { name: 'Folder' }), '~/code/intranet-web');
    await user.click(within(form).getByRole('button', { name: 'Add folder' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Could not reach the Orynx server on this computer.',
    );
  });

  it('AC-8: without Jira, the project field is off, says how to connect, and the folder saves without one', async () => {
    jira({ connected: false });
    const save = savingServer();
    const { user, form } = await openForm();
    const select = within(form).getByRole('combobox', { name: 'Jira project' });

    expect(select).toBeDisabled();
    expect(select).toHaveAccessibleDescription('Connect Jira in Connections to pick a project.');
    await user.type(within(form).getByRole('textbox', { name: 'Folder' }), '~/code/intranet-web');
    await user.click(within(form).getByRole('button', { name: 'Add folder' }));

    expect(await screen.findByText('~/code/intranet-web')).toBeVisible();
    expect(save.sent).toEqual([{ path: '~/code/intranet-web', jiraProject: null }]);
    expect(screen.queryByText(/^Jira /)).not.toBeInTheDocument();
  });

  it("AC-9: when the projects don't load, offers only No Jira project, says so, and still adds", async () => {
    jira({ list: false });
    const save = savingServer();
    const { user, form } = await openForm();
    const select = within(form).getByRole('combobox', { name: 'Jira project' });

    await waitFor(() => {
      expect(select).toHaveAccessibleDescription(
        "Your Jira projects didn't load. Add the folder without one, or try again later.",
      );
    });
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['No Jira project']);
    await user.type(within(form).getByRole('textbox', { name: 'Folder' }), '~/code/intranet-web');
    await user.click(within(form).getByRole('button', { name: 'Add folder' }));

    await waitFor(() => {
      expect(save.sent).toEqual([{ path: '~/code/intranet-web', jiraProject: null }]);
    });
  });

  it('AC-10, AC-19: Cancel closes the dialog, sends nothing and puts focus back on Add local folder', async () => {
    jira();
    const save = savingServer();
    const { user, form } = await openForm();
    await user.type(within(form).getByRole('textbox', { name: 'Folder' }), '~/code/intranet-web');

    await user.click(within(form).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog', { name: 'Add a folder' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add local folder' })).toHaveFocus();
    expect(save.sent).toEqual([]);
  });

  it('AC-10, AC-19: Escape closes the dialog the same way', async () => {
    jira();
    const { user } = await openForm();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Add a folder' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add local folder' })).toHaveFocus();
  });

  it('AC-7: the dialog stays open while the folder is on its way, even on Escape or Cancel, so its answer still shows', async () => {
    jira({ connected: false });
    server.use(
      http.post(apiUrl(apiRoutes.repositories), async () => {
        await delay(100);
        return HttpResponse.json({ code: 'folder_rejected', message: 'Nothing is at this path.' }, { status: 422 });
      }),
    );
    const { user, form } = await openForm();
    const folder = within(form).getByRole('textbox', { name: 'Folder' });
    await user.type(folder, '~/nope');

    await user.click(within(form).getByRole('button', { name: 'Add folder' }));
    await user.keyboard('{Escape}');
    await user.click(within(form).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(folder).toHaveAccessibleDescription('Nothing is at this path.');
    });
    expect(screen.getByRole('dialog', { name: 'Add a folder' })).toBeVisible();
  });

  it('a second press while the folder is on its way sends nothing more', async () => {
    jira({ connected: false });
    const sent: unknown[] = [];
    server.use(
      http.post(apiUrl(apiRoutes.repositories), async ({ request }) => {
        sent.push(await request.json());
        await delay(100);
        return HttpResponse.json(makeRepository({ jiraProject: null }), { status: 201 });
      }),
    );
    const { user, form } = await openForm();
    await user.type(within(form).getByRole('textbox', { name: 'Folder' }), '~/code/intranet-web');

    const add = within(form).getByRole('button', { name: 'Add folder' });
    await user.click(add);
    await user.click(add);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Add a folder' })).not.toBeInTheDocument();
    });
    expect(sent).toHaveLength(1);
  });
});

const intranet = makeRepository();

/** Settings › Repositories listing intranet-web, saving edits and new folders like the real server. */
function editingServer() {
  let folders: Repository[] = [intranet];
  const edits: { id: string; body: UpdateRepositoryRequest }[] = [];
  const adds: AddRepositoryRequest[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.repositories), () => HttpResponse.json({ repositories: folders })),
    http.patch(apiUrl(apiRoutes.repository), async ({ params, request }) => {
      const body = (await request.json()) as UpdateRepositoryRequest;
      edits.push({ id: String(params['id']), body });
      const folder = { ...intranet, jiraProject: body.jiraProject };
      folders = folders.map((other) => (other.id === folder.id ? folder : other));
      return HttpResponse.json(folder);
    }),
    http.post(apiUrl(apiRoutes.repositories), async ({ request }) => {
      const body = (await request.json()) as AddRepositoryRequest;
      adds.push(body);
      const folder = makeRepository({ id: 'fedcba9876543210', jiraProject: body.jiraProject });
      folders = [...folders, folder];
      return HttpResponse.json(folder, { status: 201 });
    }),
  );
  return { edits, adds };
}

describe('FolderDialog: Edit and Duplicate (spec 020)', () => {
  it('AC-20: Edit opens filled in, saves the new project in place, and gives focus back to More actions', async () => {
    jira();
    const save = editingServer();
    const { user } = await renderApp({ route: '/settings/repositories' });
    await user.click(await screen.findByRole('button', { name: 'More actions for intranet-web' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit intranet-web' });
    expect(within(dialog).getByRole('textbox', { name: 'Folder' })).toHaveValue('~/code/intranet-web');
    expect(within(dialog).getByRole('textbox', { name: 'Folder' })).toHaveFocus();
    const select = within(dialog).getByRole('combobox', { name: 'Jira project' });
    expect(select).toHaveValue('PROJ');
    await within(select).findByRole('option', { name: 'MOB · Mobile' });
    await user.selectOptions(select, 'MOB');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Jira MOB')).toBeVisible();
    expect(save.edits).toEqual([{ id: intranet.id, body: { path: '~/code/intranet-web', jiraProject: 'MOB' } }]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions for intranet-web' })).toHaveFocus();
  });

  it('AC-20: a folder the server refuses keeps the dialog open with the reason under Folder', async () => {
    jira();
    editingServer();
    server.use(
      http.patch(apiUrl(apiRoutes.repository), () =>
        HttpResponse.json({ code: 'folder_rejected', message: 'Nothing is at this path.' }, { status: 422 }),
      ),
    );
    const { user } = await renderApp({ route: '/settings/repositories' });
    await user.click(await screen.findByRole('button', { name: 'More actions for intranet-web' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit intranet-web' });
    const folder = within(dialog).getByRole('textbox', { name: 'Folder' });

    await user.clear(folder);
    await user.type(folder, '~/nope');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(folder).toHaveAccessibleDescription('Nothing is at this path.');
    });
    expect(folder).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Edit intranet-web' })).toBeVisible();
  });

  it('AC-20: shows the project a folder has while the project list is still on its way', async () => {
    jira();
    editingServer();
    server.use(
      http.get(apiUrl(apiRoutes.jiraProjects), async () => {
        await delay('infinite');
        return HttpResponse.json({ projects });
      }),
    );
    const { user } = await renderApp({ route: '/settings/repositories' });
    await user.click(await screen.findByRole('button', { name: 'More actions for intranet-web' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit intranet-web' });
    expect(within(dialog).getByRole('combobox', { name: 'Jira project' })).toHaveValue('PROJ');
  });

  it('AC-21: Duplicate opens filled in with the folder’s path and project, and adds another entry', async () => {
    jira();
    const save = editingServer();
    const { user } = await renderApp({ route: '/settings/repositories' });
    await user.click(await screen.findByRole('button', { name: 'More actions for intranet-web' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));

    const dialog = await screen.findByRole('dialog', { name: 'Duplicate intranet-web' });
    expect(within(dialog).getByRole('textbox', { name: 'Folder' })).toHaveValue('~/code/intranet-web');
    const select = within(dialog).getByRole('combobox', { name: 'Jira project' });
    expect(select).toHaveValue('PROJ');
    await within(select).findByRole('option', { name: 'MOB · Mobile' });
    await user.selectOptions(select, 'MOB');
    await user.click(within(dialog).getByRole('button', { name: 'Add folder' }));

    await waitFor(() => {
      expect(within(screen.getByRole('list', { name: 'Folders' })).getAllByRole('listitem')).toHaveLength(2);
    });
    expect(save.adds).toEqual([{ path: '~/code/intranet-web', jiraProject: 'MOB' }]);
  });
});
