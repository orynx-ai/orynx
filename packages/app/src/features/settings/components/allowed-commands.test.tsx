import { act, screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type Preferences, type PreferencesChange } from '@devhub/contracts';
import { makePreferences } from '@devhub/contracts/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const route = '/settings/coding-agent';
const saveFailed = "Couldn't save that change. Check that Orynx is still running, then try again.";

/** The saved list, changed as the server would change it; every change sent is recorded. */
function setUp(list: string[], { fails = false, slow = false } = {}) {
  let saved: Preferences = makePreferences({ allowedCommands: list });
  const sent: PreferencesChange[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.preferences), () => HttpResponse.json(saved)),
    http.patch(apiUrl(apiRoutes.preferences), async ({ request }) => {
      const change = (await request.json()) as PreferencesChange;
      sent.push(change);
      if (slow) await delay('infinite');
      if (fails) return HttpResponse.json({ code: 'internal', message: 'x' }, { status: 500 });
      const kept = saved.allowedCommands.filter((entry) => entry !== change.disallowCommand);
      const added = change.allowCommand;
      saved = { ...saved, allowedCommands: added === undefined || kept.includes(added) ? kept : [...kept, added] };
      return HttpResponse.json(saved);
    }),
  );
  return {
    sent,
    /** Another tab changed the list: the server says so on the event stream. */
    changedElsewhere: (next: string[]) => {
      saved = { ...saved, allowedCommands: next };
      act(() => {
        FakeEventSource.latest().emit({ type: 'settings.changed' });
      });
    },
  };
}

async function section() {
  return within(await screen.findByRole('region', { name: 'Allowed commands' }));
}

describe('AllowedCommands (spec 012, Q6, Q8f)', () => {
  it('AC-15: lists each allowed command with Remove, under its heading and line', async () => {
    setUp(['npm test', 'pnpm lint']);
    await renderApp({ route });
    const allowed = await section();

    expect(
      allowed.getByText(
        'These run without asking while Run commands is set to Only allowed commands. Commands run in a sandbox with no network.',
      ),
    ).toBeVisible();
    const rows = within(await allowed.findByRole('list', { name: 'Allowed commands' })).getAllByRole('listitem');
    expect(rows.map((row) => within(row).getByText(/^(npm test|pnpm lint)$/).textContent)).toEqual([
      'npm test',
      'pnpm lint',
    ]);
    expect(allowed.getByRole('button', { name: 'Remove npm test' })).toBeVisible();
    expect(allowed.getByRole('button', { name: 'Remove pnpm lint' })).toBeVisible();
  });

  it('AC-15: says how commands get here when there are none', async () => {
    setUp([]);
    await renderApp({ route });
    const allowed = await section();
    expect(await allowed.findByText('No commands yet')).toBeVisible();
    expect(allowed.getByText('Add one here, or press Always allow when Claude asks.')).toBeVisible();
    expect(allowed.queryByRole('list')).toBeNull();
  });

  it('AC-15, AC-18: Enter adds the command as the list reads it, shows it at once, and leaves the field empty for the next', async () => {
    const { sent } = setUp([], { slow: true });
    const { user } = await renderApp({ route });
    const allowed = await section();
    const field = allowed.getByRole('textbox', { name: 'Command' });

    await user.type(field, '  npm   test {Enter}');

    expect(await allowed.findByRole('button', { name: 'Remove npm test' })).toBeVisible();
    expect(sent).toEqual([{ allowCommand: 'npm test' }]);
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
  });

  it.each([
    ['', 'Enter a command.'],
    ['git push', "git push always asks, so it can't go on the list."],
    ['curl https://x.test', "curl https://x.test always asks, so it can't go on the list."],
    ['npm test && npm run lint', 'Add one command at a time, without &&, ; or |.'],
    ['npm  test', 'npm test is already on the list.'],
  ])('AC-15: refuses %j with its line, and saves nothing', async (typed, line) => {
    const { sent } = setUp(['npm test']);
    const { user } = await renderApp({ route });
    const allowed = await section();
    await allowed.findByRole('button', { name: 'Remove npm test' });
    const field = allowed.getByRole('textbox', { name: 'Command' });

    if (typed !== '') await user.type(field, typed);
    await user.click(allowed.getByRole('button', { name: 'Add' }));

    expect(await allowed.findByText(line)).toBeVisible();
    expect(field).toHaveAccessibleDescription(line);
    expect(sent).toEqual([]);
  });

  it('AC-15, AC-18: Remove takes the command off at once, and focus moves to the next row’s Remove, then to the field', async () => {
    const { sent } = setUp(['npm test', 'pnpm lint']);
    const { user } = await renderApp({ route });
    const allowed = await section();

    await user.click(await allowed.findByRole('button', { name: 'Remove npm test' }));
    expect(allowed.queryByRole('button', { name: 'Remove npm test' })).toBeNull();
    expect(allowed.getByRole('button', { name: 'Remove pnpm lint' })).toHaveFocus();

    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(allowed.getByRole('textbox', { name: 'Command' })).toHaveFocus();
    });
    await waitFor(() => {
      expect(sent).toEqual([{ disallowCommand: 'npm test' }, { disallowCommand: 'pnpm lint' }]);
    });
  });

  it('AC-16: a change that can’t be saved is taken back, and says so under the list', async () => {
    setUp(['npm test'], { fails: true });
    const { user } = await renderApp({ route });
    const allowed = await section();
    await user.type(allowed.getByRole('textbox', { name: 'Command' }), 'pnpm lint{Enter}');

    expect(await allowed.findByText(saveFailed)).toBeVisible();
    expect(allowed.queryByRole('button', { name: 'Remove pnpm lint' })).toBeNull();
    expect(allowed.getByRole('button', { name: 'Remove npm test' })).toBeVisible();
  });

  it('AC-5, AC-15: shows a command another tab added, or Always allow saved, with no reload', async () => {
    const { changedElsewhere } = setUp([]);
    await renderApp({ route });
    const allowed = await section();
    await allowed.findByText('No commands yet');

    changedElsewhere(['npm run lint']);

    expect(await allowed.findByRole('button', { name: 'Remove npm run lint' })).toBeVisible();
  });
});
