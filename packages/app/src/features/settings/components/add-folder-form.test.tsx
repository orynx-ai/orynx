import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type AddRepositoryRequest, type Repository } from '@devhub/contracts';
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

async function openForm() {
  const rendered = await renderApp({ route: '/settings/repositories' });
  await rendered.user.click(await screen.findByRole('button', { name: 'Add local folder' }));
  const form = await screen.findByRole('form', { name: 'Add a folder' });
  return { ...rendered, form };
}

describe('AddFolderForm', () => {
  it('AC-5: opens with Folder focused and my Jira projects listed, "No Jira project" picked', async () => {
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
    expect(screen.getByRole('button', { name: 'Add local folder' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('AC-6: adds the folder with its project, closes the form and puts focus back on Add local folder', async () => {
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
    expect(screen.queryByRole('form', { name: 'Add a folder' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('form', { name: 'Add a folder' })).toBeVisible();
  });

  it('says the server is out of reach in one line above the buttons', async () => {
    jira();
    server.use(http.post(apiUrl(apiRoutes.repositories), () => HttpResponse.error()));
    const { user, form } = await openForm();

    await user.type(within(form).getByRole('textbox', { name: 'Folder' }), '~/code/intranet-web');
    await user.click(within(form).getByRole('button', { name: 'Add folder' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Could not reach the DevHub server on this computer.',
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

  it('AC-10: Cancel closes the form, sends nothing and puts focus back on Add local folder', async () => {
    jira();
    const save = savingServer();
    const { user, form } = await openForm();
    await user.type(within(form).getByRole('textbox', { name: 'Folder' }), '~/code/intranet-web');

    await user.click(within(form).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('form', { name: 'Add a folder' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add local folder' })).toHaveFocus();
    expect(save.sent).toEqual([]);
  });

  it('AC-10: Escape closes the form the same way', async () => {
    jira();
    const { user } = await openForm();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('form', { name: 'Add a folder' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add local folder' })).toHaveFocus();
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
      expect(screen.queryByRole('form', { name: 'Add a folder' })).not.toBeInTheDocument();
    });
    expect(sent).toHaveLength(1);
  });
});
