import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import {
  makeClaudeSignedIn,
  makeInbox,
  makeInboxItem,
  makePreferences,
  makeSearchIndex,
  makeSearchTicket,
  makeStatus,
} from '@devhub/contracts/testing';
import type { PermissionMode } from '@devhub/contracts';
import { FakeEventSource } from './test/fake-event-source.ts';
import { apiUrl, server } from './test/msw.ts';
import { renderApp, testToken } from './test/render.tsx';

describe('LiveUpdates', () => {
  it('opens the event stream with the page token', async () => {
    await renderApp();
    await screen.findByText('Claude not connected · runs locally');

    expect(FakeEventSource.latest().url).toBe(`${apiUrl(apiRoutes.events)}?token=${testToken}`);
  });

  it('refetches the status when the server says it changed', async () => {
    let connected = false;
    server.use(
      http.get(apiUrl(apiRoutes.status), () => HttpResponse.json(makeStatus({ agent: { id: 'claude', connected } }))),
    );
    await renderApp();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    await within(nav).findByText('Claude not connected · runs locally');

    connected = true;
    FakeEventSource.latest().emit({ type: 'status.changed' });

    expect(await within(nav).findByText('Claude connected · runs locally')).toBeVisible();
  });

  it("AC-5: refreshes the Claude card when another tab's Check again found a login", async () => {
    let signedIn = false;
    server.use(
      http.get(apiUrl(apiRoutes.claudeLogin), () =>
        HttpResponse.json(signedIn ? makeClaudeSignedIn() : { state: 'signed_out' }),
      ),
    );
    await renderApp({ route: '/settings/coding-agent' });
    const card = await screen.findByRole('group', { name: 'Claude' });
    await within(card).findByText('Not signed in');

    signedIn = true;
    FakeEventSource.latest().emit({ type: 'status.changed' });

    expect(await within(card).findByText('Active')).toBeVisible();
  });

  it('AC-17: refetches the preferences when another tab saved a change', async () => {
    let permissionMode: PermissionMode = 'edit_freely_ask_commands';
    server.use(http.get(apiUrl(apiRoutes.preferences), () => HttpResponse.json(makePreferences({ permissionMode }))));
    await renderApp({ route: '/settings/coding-agent' });
    const everything = await screen.findByRole('radio', { name: 'Ask before everything' });
    await waitFor(() => {
      expect(everything).toBeEnabled();
    });

    permissionMode = 'ask_everything';
    FakeEventSource.latest().emit({ type: 'settings.changed' });

    await waitFor(() => {
      expect(everything).toBeChecked();
    });
  });

  it.each(['inbox.changed', 'settings.changed', 'status.changed', 'sessions.changed'] as const)(
    'AC-15, AC-16: refreshes what needs you when the server says %s',
    async (type) => {
      let count = 1;
      server.use(
        http.get(apiUrl(apiRoutes.inbox), () =>
          HttpResponse.json(
            makeInbox({
              items: Array.from({ length: count }, (_, index) =>
                makeInboxItem({ id: `jira:PROJ-${String(index + 1)}` }),
              ),
            }),
          ),
        ),
      );
      await renderApp({ route: '/tickets' });
      const nav = screen.getByRole('navigation', { name: 'Main' });
      await within(nav).findByRole('link', { name: 'Home, 1 needs you' });

      count = 2;
      FakeEventSource.latest().emit({ type });

      expect(await within(nav).findByRole('link', { name: 'Home, 2 need you' })).toBeVisible();
    },
  );

  it.each(['inbox.changed', 'status.changed', 'sessions.changed'] as const)(
    'AC-26 (spec 009): refreshes search’s results when the server says %s, keeping what was typed',
    async (type) => {
      let count = 1;
      server.use(
        http.get(apiUrl(apiRoutes.search), () =>
          HttpResponse.json(
            makeSearchIndex({
              tickets: Array.from({ length: count }, (_, index) =>
                makeSearchTicket({ key: `PROJ-${String(index + 1)}`, title: 'Archive it' }),
              ),
            }),
          ),
        ),
      );
      const { user } = await renderApp({ route: '/tickets' });
      await user.click(
        within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: /Search/ }),
      );
      await user.type(await screen.findByRole('combobox'), 'archive');
      expect(await screen.findAllByRole('option')).toHaveLength(1);

      count = 2;
      FakeEventSource.latest().emit({ type });

      await waitFor(() => {
        expect(screen.getAllByRole('option')).toHaveLength(2);
      });
      expect(screen.getByRole('combobox')).toHaveValue('archive');
    },
  );

  it('closes the stream when the app goes away', async () => {
    const { unmount } = await renderApp();
    await screen.findByText('Claude not connected · runs locally');

    unmount();

    expect(FakeEventSource.latest().closed).toBe(true);
  });
});
