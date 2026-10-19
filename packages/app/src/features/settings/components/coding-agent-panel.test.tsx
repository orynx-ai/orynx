import { screen, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type PreferencesChange } from '@devhub/contracts';
import { makePreferences } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const heading = 'What Claude can do without asking';
const saveFailed = "Couldn't save that change. Check that Orynx is still running, then try again.";
const row = (name: string) => screen.getByRole('combobox', { name });

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
    expect(row('Push the branch')).toBeEnabled();
  });
  return rendered;
}

describe('CodingAgentPanel', () => {
  it('AC-14, AC-15: shows the Claude card and "More agents" above the rows, in that order', async () => {
    await renderApp({ route: '/settings/coding-agent' });

    const claude = await screen.findByRole('group', { name: 'Claude' });
    const more = screen.getByRole('group', { name: 'More agents' });
    expect(more).toHaveTextContent('Coming later. Each agent plugs in through one small adapter.');
    const rows = screen.getByRole('region', { name: heading });
    expect(claude.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(more.compareDocumentPosition(rows) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('spec 026: one row for each kind of call, each with its line, starting as edit freely and ask before commands', async () => {
    const { container } = await openRows();

    const shown = [
      ['Edit files', 'Allow', "In the session's own copy of the repository. Edits anywhere else are refused."],
      ['Run commands', 'Ask first', "In a sandbox with no network that writes only to the session's copy."],
      [
        'Commands that use the network',
        'Ask first',
        'Such as npm install, curl or git fetch. Allowed, they run outside the sandbox.',
      ],
      [
        "Deleting outside the session's copy",
        'Ask first',
        'Such as rm ~/notes.txt. Allowed, it runs outside the sandbox.',
      ],
      [
        'Commands outside the sandbox',
        'Ask first',
        "When Claude asks to run one there. One Orynx can't read always asks.",
      ],
      ['Push the branch', 'Never', "Only the session's branch to origin, never forced, with your own git login."],
      ['Open a pull request', 'Never', "With gh pr create for the session's branch, as you on GitHub."],
    ];
    for (const [name, picked, line] of shown) {
      const select = row(name ?? '');
      expect(select).toHaveDisplayValue(picked ?? '');
      expect(select).toHaveAccessibleDescription(line ?? '');
    }
    expect([...row('Run commands').querySelectorAll('option')].map((option) => option.textContent)).toEqual([
      'Ask first',
      'Only allowed commands',
      'Any command',
    ]);
    expect([...row('Push the branch').querySelectorAll('option')].map((option) => option.textContent)).toEqual([
      'Never',
      'Ask first',
      'Allow',
    ]);
    await expectNoAxeViolations(container);
  });

  it('AC-3: shows a row’s new choice at once, before the server answers, and sends only that row', async () => {
    const save = slowSave();
    const { user } = await openRows();

    await user.selectOptions(row('Push the branch'), 'Allow');

    expect(row('Push the branch')).toHaveDisplayValue('Allow');
    await waitFor(() => {
      expect(save.sent).toEqual([{ permissions: { push: 'allow' } }]);
    });
    save.release();
    await waitFor(() => {
      expect(row('Push the branch')).toHaveDisplayValue('Allow');
    });
  });

  it('AC-14: goes back to the saved choice and says so when the save fails, and focus stays put', async () => {
    server.use(
      http.patch(apiUrl(apiRoutes.preferences), () =>
        HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 }),
      ),
    );
    const { user } = await openRows();

    await user.selectOptions(row('Edit files'), 'Ask first');

    expect(await screen.findByRole('alert')).toHaveTextContent(saveFailed);
    expect(row('Edit files')).toHaveDisplayValue('Allow');
    expect(row('Edit files')).toHaveFocus();
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
    await user.selectOptions(row('Edit files'), 'Ask first');
    await screen.findByRole('alert');

    fail = false;
    await user.selectOptions(row('Run commands'), 'Any command');

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

    await screen.findByRole('region', { name: heading });
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(7);
    for (const select of selects) {
      expect(select).toBeDisabled();
      expect(select).toHaveDisplayValue('');
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
    await user.selectOptions(row('Edit files'), 'Ask first');
    await waitFor(() => {
      expect(saved).toEqual({ edits: 'ask' });
    });

    await user.selectOptions(row('Edit files'), 'Allow');
    FakeEventSource.latest().emit({ type: 'settings.changed' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(row('Edit files')).toHaveDisplayValue('Allow');
    release();
    await waitFor(() => {
      expect(saved).toEqual({ edits: 'allow' });
    });
    expect(row('Edit files')).toHaveDisplayValue('Allow');
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

    await user.selectOptions(row('Push the branch'), 'Ask first');
    await user.selectOptions(row('Open a pull request'), 'Allow');

    await screen.findByRole('alert');
    await waitFor(() => {
      expect(row('Push the branch')).toHaveDisplayValue('Never');
    });
    expect(row('Open a pull request')).toHaveDisplayValue('Never');
  });
});
