import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, defaultPreferences, type PreferencesChange } from '@devhub/contracts';
import { makePreferences, makeRepository } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const heading = 'What Claude can do without asking';
const saveFailed = "Couldn't save that change. Check that Orynx is still running, then try again.";
/** A row's options, named by the row. */
const row = (name: string) => screen.getByRole('group', { name });
/** The option a row has pressed, or undefined when none is. */
const pressed = (name: string) =>
  within(row(name))
    .getAllByRole('button')
    .find((option) => option.getAttribute('aria-pressed') === 'true')?.textContent;
const option = (name: string, label: string) => within(row(name)).getByRole('button', { name: label });
const level = (name: string) =>
  within(screen.getByRole('radiogroup', { name: 'Permission level' })).getByRole('radio', { name });

/** Answers PATCH /api/preferences once `release` is called, and records what was sent. */
function slowSave() {
  const sent: PreferencesChange[] = [];
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.patch(apiUrl(apiRoutes.preferences), async ({ request }) => {
      const change = (await request.json()) as PreferencesChange;
      sent.push(change);
      await released;
      return HttpResponse.json(makePreferences({ permissions: change.permissions ?? {} }));
    }),
  );
  return { sent, release };
}

/** Opens Coding agent and waits until its rows can be used. */
async function openRows() {
  const rendered = await renderApp({ route: '/settings/coding-agent' });
  await waitFor(() => {
    expect(option('Push the branch', 'Allow')).toBeEnabled();
  });
  return rendered;
}

describe('CodingAgentPanel', () => {
  it('AC-14, AC-15: shows the agent, the line about more agents, then the rows, in that order', async () => {
    await renderApp({ route: '/settings/coding-agent' });

    const claude = await screen.findByRole('group', { name: 'Claude' });
    const more = screen.getByText(
      'More agents are coming later. Each one plugs in through the same small adapter, so these settings will apply to them too.',
    );
    const rows = screen.getByRole('region', { name: heading });
    expect(claude.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(more.compareDocumentPosition(rows) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('spec 026: one row for each kind of call in three groups, each with its line, starting as edit freely and ask before commands', async () => {
    const { container } = await openRows();

    const groups = [
      ["Inside the session's copy", 'Contained', ['Edit files', 'Run commands']],
      [
        'On your computer',
        'Can change your machine',
        ['Commands that use the network', 'Commands outside the sandbox', "Deleting outside the session's copy"],
      ],
      ['On GitHub', 'Your team sees it', ['Push the branch', 'Open a pull request']],
    ] as const;
    for (const [name, risk, rows] of groups) {
      const group = screen.getByRole('region', { name });
      expect(within(group).getByText(risk)).toBeVisible();
      for (const name of rows) expect(group).toContainElement(row(name));
    }
    const shown = [
      ['Edit files', 'Allow', "In the session's own copy of the repository. Edits anywhere else are refused."],
      ['Run commands', 'Ask', "In a sandbox with no network that writes only to the session's copy."],
      [
        'Commands that use the network',
        'Ask',
        'Such as npm install, curl or git fetch. Allowed, they run outside the sandbox.',
      ],
      ["Deleting outside the session's copy", 'Ask', 'Such as rm ~/notes.txt. Allowed, it runs outside the sandbox.'],
      ['Commands outside the sandbox', 'Ask', "When Claude asks to run one there. One Orynx can't read always asks."],
      ['Push the branch', 'Block', "Only the session's branch to origin, never forced, with your own git login."],
      ['Open a pull request', 'Block', "With gh pr create for the session's branch, as you on GitHub."],
    ] as const;
    for (const [name, picked, line] of shown) {
      expect(pressed(name)).toBe(picked);
      expect(row(name)).toHaveAccessibleDescription(line);
    }
    const labels = (name: string) =>
      within(row(name))
        .getAllByRole('button')
        .map((button) => button.textContent);
    expect(labels('Run commands')).toEqual(['Any', 'Allowed only', 'Ask']);
    expect(labels('Push the branch')).toEqual(['Allow', 'Ask', 'Block']);
    expect(labels('Commands that use the network')).toEqual(['Allow', 'Ask']);
    // A fresh Orynx asks before commands and never pushes: no level has that, so it's Custom.
    expect(level('Custom')).toBeChecked();
    expect(level('Balanced')).not.toBeChecked();
    await expectNoAxeViolations(container);
  });

  it('sums the rows up in three lines, and warns under a row set to Allow', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.preferences), () =>
        HttpResponse.json(makePreferences({ permissions: { network: 'allow', push: 'never', pullRequest: 'ask' } })),
      ),
    );
    await openRows();

    const summary = screen.getByRole('region', { name: 'Summary' });
    expect(summary).toHaveTextContent('Without askingEdit files, use the network.');
    expect(summary).toHaveTextContent(
      'Asks you firstRun commands, run outside the sandbox, delete outside its copy, open pull requests.',
    );
    expect(summary).toHaveTextContent('NeverPush the branch.');
    expect(screen.getByText('Anything Claude downloads runs on your computer.')).toBeVisible();
    expect(screen.queryByText('These can change files and settings anywhere on your computer.')).toBeNull();
  });

  it('picks a level: all seven rows change at once, in one save, and the level shows as picked', async () => {
    const save = slowSave();
    const { user } = await openRows();
    expect(level('Balanced')).toHaveAccessibleDescription(
      'Edits freely, runs your allowed commands, asks for the rest.',
    );
    expect(level('Custom')).toBeEnabled();

    await user.click(level('Hands-off'));

    expect(level('Hands-off')).toBeChecked();
    expect(pressed('Run commands')).toBe('Any');
    expect(pressed('Push the branch')).toBe('Allow');
    expect(pressed("Deleting outside the session's copy")).toBe('Ask');
    // No row of your own now, so Custom waits until one changes.
    expect(level('Custom')).toBeDisabled();
    await waitFor(() => {
      expect(save.sent).toEqual([
        {
          permissions: {
            edits: 'allow',
            commands: 'any',
            network: 'allow',
            unsandboxed: 'allow',
            deleteOutside: 'ask',
            push: 'allow',
            pullRequest: 'allow',
          },
        },
      ]);
    });
    save.release();
  });

  it('AC-3: shows a row’s new choice at once, before the server answers, and sends only that row', async () => {
    const save = slowSave();
    const { user } = await openRows();

    await user.click(option('Push the branch', 'Allow'));

    expect(pressed('Push the branch')).toBe('Allow');
    await waitFor(() => {
      expect(save.sent).toEqual([{ permissions: { push: 'allow' } }]);
    });
    save.release();
    await waitFor(() => {
      expect(pressed('Push the branch')).toBe('Allow');
    });
  });

  it('AC-14: goes back to the saved choice and says so when the save fails, and focus stays put', async () => {
    server.use(
      http.patch(apiUrl(apiRoutes.preferences), () =>
        HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 }),
      ),
    );
    const { user } = await openRows();

    await user.click(option('Edit files', 'Ask'));

    expect(await screen.findByRole('alert')).toHaveTextContent(saveFailed);
    expect(pressed('Edit files')).toBe('Allow');
    expect(option('Edit files', 'Ask')).toHaveFocus();
  });

  it('AC-14: the line goes away with the next change', async () => {
    let fail = true;
    server.use(
      http.patch(apiUrl(apiRoutes.preferences), () =>
        fail
          ? HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 })
          : HttpResponse.json(makePreferences({ permissions: { commands: 'any' } })),
      ),
    );
    const { user } = await openRows();
    await user.click(option('Edit files', 'Ask'));
    await screen.findByRole('alert');

    fail = false;
    await user.click(option('Run commands', 'Any'));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('AC-15: draws the same rows while the preferences load, nothing picked and none usable', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.preferences), async () => {
        await delay('infinite');
        return HttpResponse.json(makePreferences());
      }),
    );
    await renderApp({ route: '/settings/coding-agent' });

    const rows = await screen.findByRole('region', { name: heading });
    for (const name of ['Edit files', 'Run commands', 'Open a pull request']) {
      expect(pressed(name)).toBeUndefined();
      for (const button of within(row(name)).getAllByRole('button')) expect(button).toBeDisabled();
    }
    for (const radio of within(rows).getAllByRole('radio')) {
      expect(radio).toBeDisabled();
      expect(radio).not.toBeChecked();
    }
  });

  it('AC-16: says the server is out of reach when the preferences fail to load, and Appearance still works', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.preferences), () =>
        HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 }),
      ),
    );
    const { user } = await renderApp({ route: '/settings/coding-agent' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the Orynx server');

    await user.click(screen.getByRole('tab', { name: 'Appearance' }));
    expect(await screen.findByRole('radio', { name: 'Dark' })).toBeEnabled();
  });

  it("AC-3: a second quick change stays on screen when the first one's settings.changed arrives before it saves", async () => {
    let saved: PreferencesChange['permissions'] = {};
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let patches = 0;
    server.use(
      http.get(apiUrl(apiRoutes.preferences), () => HttpResponse.json(makePreferences({ permissions: saved }))),
      http.patch(apiUrl(apiRoutes.preferences), async ({ request }) => {
        patches += 1;
        const change = (await request.json()) as PreferencesChange;
        if (patches === 2) await held;
        saved = { ...saved, ...change.permissions };
        return HttpResponse.json(makePreferences({ permissions: saved }));
      }),
    );
    const { user } = await openRows();
    await user.click(option('Edit files', 'Ask'));
    await waitFor(() => {
      expect(saved).toEqual({ edits: 'ask' });
    });

    await user.click(option('Edit files', 'Allow'));
    FakeEventSource.latest().emit({ type: 'settings.changed' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(pressed('Edit files')).toBe('Allow');
    release();
    await waitFor(() => {
      expect(saved).toEqual({ edits: 'allow' });
    });
    expect(pressed('Edit files')).toBe('Allow');
  });

  it('AC-14: when the server stops answering and two quick changes both fail, the saved choices come back', async () => {
    const { user } = await openRows();
    // From here on nothing answers, so no refetch can put things right afterwards.
    server.use(
      http.get(apiUrl(apiRoutes.preferences), () => HttpResponse.error()),
      http.patch(apiUrl(apiRoutes.preferences), async () => {
        await delay(30);
        return HttpResponse.error();
      }),
    );

    await user.click(option('Push the branch', 'Ask'));
    await user.click(option('Open a pull request', 'Allow'));

    await screen.findByRole('alert');
    await waitFor(() => {
      expect(pressed('Push the branch')).toBe('Block');
    });
    expect(pressed('Open a pull request')).toBe('Block');
  });

  describe('041: rules for one repository', () => {
    const web = makeRepository({ id: '0123456789abcdef', name: 'intranet-web' });
    const api = makeRepository({ id: 'fedcba9876543210', name: 'intranet-api', path: '/Users/dev/code/intranet-api' });
    const ownRules = { ...defaultPreferences.permissions, push: 'allow' } as const;

    /** Serves the two folders and these preferences, and records each change sent. */
    function serve(preferences = makePreferences()) {
      const sent: PreferencesChange[] = [];
      server.use(
        http.get(apiUrl(apiRoutes.repositories), () => HttpResponse.json({ repositories: [web, api] })),
        http.get(apiUrl(apiRoutes.preferences), () => HttpResponse.json(preferences)),
        http.patch(apiUrl(apiRoutes.preferences), async ({ request }) => {
          sent.push((await request.json()) as PreferencesChange);
          return HttpResponse.json(preferences);
        }),
      );
      return sent;
    }

    async function pick(user: Awaited<ReturnType<typeof openRows>>['user'], name: string) {
      await user.click(screen.getByRole('combobox', { name: 'Rules for' }));
      await user.click(await screen.findByRole('option', { name }));
    }

    it('starts on All repositories, and a repository with its own rules says so in the list', async () => {
      serve(makePreferences({ repositoryPermissions: { [web.id]: ownRules } }));
      const { user } = await openRows();
      expect(screen.getByRole('combobox', { name: 'Rules for' })).toHaveTextContent('All repositories');

      await user.click(screen.getByRole('combobox', { name: 'Rules for' }));

      expect(screen.getAllByRole('option').map((one) => one.textContent)).toEqual([
        'All repositories',
        'intranet-web · Own rules',
        'intranet-api',
      ]);
    });

    it('a repository that follows All shows All’s rows, and its first change is saved for it alone', async () => {
      const sent = serve();
      const { user } = await openRows();

      await pick(user, 'intranet-api');

      expect(
        screen.getByText('intranet-api follows All repositories. Changing a row gives it its own rules.'),
      ).toBeVisible();
      expect(pressed('Push the branch')).toBe('Block');
      await user.click(option('Push the branch', 'Allow'));

      expect(pressed('Push the branch')).toBe('Allow');
      expect(screen.getByText(/intranet-api has its own rules/)).toBeVisible();
      await waitFor(() => {
        expect(sent).toEqual([{ permissions: { push: 'allow' }, repository: api.id }]);
      });
    });

    it('a repository with its own rules shows them, and Use All repositories sends it back', async () => {
      const sent = serve(makePreferences({ repositoryPermissions: { [web.id]: ownRules } }));
      const { user } = await openRows();
      expect(pressed('Push the branch')).toBe('Block');

      await pick(user, 'intranet-web · Own rules');

      expect(pressed('Push the branch')).toBe('Allow');
      expect(
        screen.getByText("intranet-web has its own rules, so changes to All repositories don't reach it."),
      ).toBeVisible();
      await user.click(screen.getByRole('button', { name: 'Use All repositories' }));

      expect(pressed('Push the branch')).toBe('Block');
      expect(
        screen.getByText('intranet-web follows All repositories. Changing a row gives it its own rules.'),
      ).toBeVisible();
      await waitFor(() => {
        expect(sent).toEqual([{ followAll: web.id }]);
      });
    });

    it('when a repository’s save fails, its rows and All’s go back as they were', async () => {
      serve(makePreferences({ repositoryPermissions: { [web.id]: ownRules } }));
      const { user } = await openRows();
      await pick(user, 'intranet-web · Own rules');
      server.use(
        http.get(apiUrl(apiRoutes.preferences), () => HttpResponse.error()),
        http.patch(apiUrl(apiRoutes.preferences), () => HttpResponse.error()),
      );

      await user.click(option('Push the branch', 'Ask'));
      await screen.findByRole('alert');
      await waitFor(() => {
        expect(pressed('Push the branch')).toBe('Allow');
      });

      await user.click(screen.getByRole('button', { name: 'Use All repositories' }));
      await waitFor(() => {
        expect(screen.getByText(/intranet-web has its own rules/)).toBeVisible();
      });
      expect(pressed('Push the branch')).toBe('Allow');
      await pick(user, 'All repositories');
      expect(pressed('Push the branch')).toBe('Block');
    });
  });
});
