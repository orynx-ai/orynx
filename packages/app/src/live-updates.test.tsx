import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makePreferences, makeStatus } from '@devhub/contracts/testing';
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

  it('closes the stream when the app goes away', async () => {
    const { unmount } = await renderApp();
    await screen.findByText('Claude not connected · runs locally');

    unmount();

    expect(FakeEventSource.latest().closed).toBe(true);
  });
});
