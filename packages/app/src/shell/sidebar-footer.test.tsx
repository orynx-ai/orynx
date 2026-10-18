import { screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeStatus } from '@devhub/contracts/testing';
import { apiUrl, server } from '../test/msw.ts';
import { renderApp } from '../test/render.tsx';

function mainNav() {
  return screen.getByRole('navigation', { name: 'Main' });
}

describe('Sidebar footer', () => {
  it('AC-16: says in words whether Claude is connected', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.status), () =>
        HttpResponse.json(makeStatus({ agent: { id: 'claude', connected: true } })),
      ),
    );
    await renderApp();

    expect(await within(mainNav()).findByText('Claude connected · runs locally')).toBeVisible();
  });

  it('AC-16: shows the person by name and initials, and links to Settings', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.status), () => HttpResponse.json(makeStatus({ user: { name: 'Rakesh Dhariwal' } }))),
    );
    await renderApp();

    const footer = await within(mainNav()).findByRole('link', {
      name: 'Rakesh D. Claude not connected · runs locally',
    });
    expect(footer).toHaveAttribute('href', '/settings');
    expect(within(footer).getByText('RD')).toBeVisible();
  });

  it('AC-16: says "You" when DevHub knows no name', async () => {
    await renderApp();

    expect(
      await within(mainNav()).findByRole('link', { name: 'You Claude not connected · runs locally' }),
    ).toHaveAttribute('href', '/settings');
  });

  it('says when the local server cannot be reached', async () => {
    server.use(http.get(apiUrl(apiRoutes.status), () => HttpResponse.error()));
    await renderApp();

    expect(await within(mainNav()).findByText('Orynx server not reachable')).toBeVisible();
  });

  it('AC-16: is not a current page on Settings, where the Settings place is', async () => {
    await renderApp({ route: '/settings/appearance' });
    const nav = mainNav();

    expect(
      await within(nav).findByRole('link', { name: 'You Claude not connected · runs locally' }),
    ).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  });

  it('AC-16: says no name while the status is still loading', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.status), async () => {
        await delay('infinite');
        return HttpResponse.json(makeStatus());
      }),
    );
    await renderApp();

    expect(within(mainNav()).getByText('Checking…')).toBeVisible();
    expect(within(mainNav()).queryByText('You')).toBeNull();
  });
});
