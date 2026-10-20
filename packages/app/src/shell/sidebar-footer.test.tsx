import { screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeStatus } from '@devhub/contracts/testing';
import { useProfileStore } from '../stores/profile-store.ts';
import { useUiStore } from '../stores/ui-store.ts';
import { apiUrl, server } from '../test/msw.ts';
import { renderApp } from '../test/render.tsx';

function mainNav() {
  return screen.getByRole('navigation', { name: 'Main' });
}

describe('Sidebar footer', () => {
  it('AC-16: shows the person by name and initials, and opens the profile menu', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.status), () => HttpResponse.json(makeStatus({ user: { name: 'Rakesh Dhariwal' } }))),
    );
    const { user } = await renderApp();

    const footer = await within(mainNav()).findByRole('button', { name: 'Profile: Rakesh Dhariwal' });
    expect(within(footer).getByText('RD')).toBeVisible();
    await user.click(footer);
    expect(screen.getByRole('menu', { name: 'Profile' })).toBeVisible();
  });

  it('shows the bio under the name, in place of whether Claude is connected', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.status), () =>
        HttpResponse.json(makeStatus({ user: { name: 'Rakesh Dhariwal' }, agent: { id: 'claude', connected: true } })),
      ),
    );
    useProfileStore.setState({ bio: 'Ships on Fridays' });
    await renderApp();

    const footer = await within(mainNav()).findByRole('button', { name: 'Profile: Rakesh Dhariwal Ships on Fridays' });
    expect(within(footer).getByText('Ships on Fridays')).toBeVisible();
    expect(within(mainNav()).queryByText(/runs locally/)).toBeNull();
  });

  it('AC-16: says "You" when DevHub knows no name', async () => {
    await renderApp();

    expect(await within(mainNav()).findByRole('button', { name: 'Profile: You' })).toBeVisible();
  });

  it('shows the name and picture from Edit profile in place of the one the server knows', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.status), () => HttpResponse.json(makeStatus({ user: { name: 'Rakesh Dhariwal' } }))),
    );
    useProfileStore.setState({ name: 'Ada Lovelace', picture: 'data:image/png;base64,AAAA' });
    await renderApp();

    const footer = await within(mainNav()).findByRole('button', { name: 'Profile: Ada Lovelace' });
    expect(within(footer).queryByText('AL')).toBeNull();
  });

  it('puts the name and bio in a tooltip on the collapsed rail', async () => {
    useProfileStore.setState({ name: 'Ada Lovelace', bio: 'Writes the first program' });
    useUiStore.setState({ sidebarCollapsed: true });
    await renderApp();

    within(mainNav())
      .getByRole('button', { name: /^Profile: / })
      .focus();

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Ada Lovelace · Writes the first program');
  });

  it('AC-16: says no name while the status is still loading', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.status), async () => {
        await delay('infinite');
        return HttpResponse.json(makeStatus());
      }),
    );
    await renderApp();

    expect(within(mainNav()).getByRole('button', { name: /^Profile:/ })).toBeVisible();
    expect(within(mainNav()).queryByText('You')).toBeNull();
  });
});
