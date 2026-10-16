import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeStatus } from '@devhub/contracts/testing';
import { FakeEventSource } from './test/fake-event-source.ts';
import { apiUrl, server } from './test/msw.ts';
import { renderApp, testToken } from './test/render.tsx';

describe('LiveUpdates', () => {
  it('opens the event stream with the page token', async () => {
    await renderApp();
    await screen.findByText('Not connected · runs locally');

    expect(FakeEventSource.latest().url).toBe(`${apiUrl(apiRoutes.events)}?token=${testToken}`);
  });

  it('refetches the status when the server says it changed', async () => {
    let connected = false;
    server.use(
      http.get(apiUrl(apiRoutes.status), () => HttpResponse.json(makeStatus({ agent: { id: 'claude', connected } }))),
    );
    await renderApp();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    await within(nav).findByText('Not connected · runs locally');

    connected = true;
    FakeEventSource.latest().emit({ type: 'status.changed' });

    expect(await within(nav).findByText('Connected · runs locally')).toBeVisible();
  });

  it('closes the stream when the app goes away', async () => {
    const { unmount } = await renderApp();
    await screen.findByText('Not connected · runs locally');

    unmount();

    expect(FakeEventSource.latest().closed).toBe(true);
  });
});
