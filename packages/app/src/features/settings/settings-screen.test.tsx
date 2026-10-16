import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/render.tsx';

describe('SettingsScreen', () => {
  it('opens on Connections from /settings', async () => {
    const { history } = await renderApp({ route: '/settings' });

    expect(await screen.findByRole('tab', { name: 'Connections' })).toHaveAttribute('aria-selected', 'true');
    expect(history.location.pathname).toBe('/settings/connections');
  });

  it('says that everything stays on this computer', async () => {
    await renderApp({ route: '/settings/connections' });
    expect(await screen.findByText('Everything stays on this computer')).toBeVisible();
  });

  it('switches tabs through the URL', async () => {
    const { user, history } = await renderApp({ route: '/settings/connections' });

    await user.click(await screen.findByRole('tab', { name: 'Appearance' }));

    expect(history.location.pathname).toBe('/settings/appearance');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Theme');
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Appearance')).toBeVisible();
  });

  it('falls back to Connections for an unknown tab', async () => {
    await renderApp({ route: '/settings/nope' });
    expect(await screen.findByRole('tab', { name: 'Connections' })).toHaveAttribute('aria-selected', 'true');
  });
});
