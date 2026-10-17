import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type PreferencesChange } from '@devhub/contracts';
import { makePreferences } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const intro = 'Choose what shows up under Needs your attention on Home.';
const rules = [
  "Jira tickets assigned to me that aren't done",
  'Pull requests waiting for my review',
  'My pull requests with failing checks',
  'My pull requests with unresolved review comments',
  'Claude sessions waiting for my approval',
];

async function openTab() {
  const rendered = await renderApp({ route: '/settings/inbox-rules' });
  const group = await screen.findByRole('group', { name: intro });
  await waitFor(() => {
    expect(within(group).getAllByRole('checkbox')[0]).toBeEnabled();
  });
  return { ...rendered, group };
}

describe('InboxRulesPanel', () => {
  it('AC-12: lists the five rules, in the product spec order, all on', async () => {
    const { group } = await openTab();

    const boxes = within(group).getAllByRole('checkbox');
    expect(boxes).toEqual(rules.map((name) => within(group).getByRole('checkbox', { name })));
    for (const box of boxes) expect(box).toBeChecked();
    expect(within(group).queryByText(/slack/i)).not.toBeInTheDocument();
  });

  it('AC-13: unchecks a rule at once and sends only that rule', async () => {
    const sent: PreferencesChange[] = [];
    server.use(
      http.patch(apiUrl(apiRoutes.preferences), async ({ request }) => {
        sent.push((await request.json()) as PreferencesChange);
        await delay(50);
        return HttpResponse.json(makePreferences({ inboxRules: { checks_failing: false } }));
      }),
    );
    const { user } = await openTab();
    const failing = screen.getByRole('checkbox', { name: 'My pull requests with failing checks' });

    await user.click(failing);

    expect(failing).not.toBeChecked();
    await waitFor(() => {
      expect(sent).toEqual([{ inboxRules: { checks_failing: false } }]);
    });
  });

  it('AC-13: shows a rule that was saved off as off', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.preferences), () =>
        HttpResponse.json(makePreferences({ inboxRules: { session_waiting: false } })),
      ),
    );
    await openTab();

    expect(screen.getByRole('checkbox', { name: 'Claude sessions waiting for my approval' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Pull requests waiting for my review' })).toBeChecked();
  });

  it('AC-14: turns the rule back on and says so when the save fails, and focus stays put', async () => {
    server.use(
      http.patch(apiUrl(apiRoutes.preferences), () =>
        HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 }),
      ),
    );
    const { user } = await openTab();
    const review = screen.getByRole('checkbox', { name: 'Pull requests waiting for my review' });

    await user.click(review);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save that change. Check that DevHub is still running, then try again.",
    );
    expect(review).toBeChecked();
    expect(review).toHaveFocus();
  });

  it('AC-15: draws the same rows while the preferences load, unchecked and unusable', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.preferences), async () => {
        await delay('infinite');
        return HttpResponse.json(makePreferences());
      }),
    );
    await renderApp({ route: '/settings/inbox-rules' });

    const boxes = within(await screen.findByRole('group', { name: intro })).getAllByRole('checkbox');
    expect(boxes).toHaveLength(5);
    for (const box of boxes) {
      expect(box).toBeDisabled();
      expect(box).not.toBeChecked();
    }
  });

  it('AC-16: says the server is out of reach when the preferences fail to load', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.preferences), () =>
        HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 }),
      ),
    );
    await renderApp({ route: '/settings/inbox-rules' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the DevHub server');
  });

  it('AC-19: Tab reaches each rule and Space flips it', async () => {
    const { user } = await openTab();
    const first = screen.getByRole('checkbox', { name: "Jira tickets assigned to me that aren't done" });
    first.focus();

    await user.tab();
    await user.keyboard(' ');

    const second = screen.getByRole('checkbox', { name: 'Pull requests waiting for my review' });
    expect(second).toHaveFocus();
    expect(second).not.toBeChecked();
  });
});
