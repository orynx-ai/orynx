import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render.tsx';

describe('PageBar and PageBreadcrumb', () => {
  it('links the sidebar place and marks the current page', async () => {
    const { user, history } = await renderApp({ route: '/settings/appearance' });
    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' });

    expect(within(crumbs).getByText('Appearance')).toHaveAttribute('aria-current', 'page');
    // Only the last crumb is the current page; the place it sits under is a plain link.
    expect(within(crumbs).getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current');
    await user.click(within(crumbs).getByRole('link', { name: 'Settings' }));

    expect(history.location.pathname).toBe('/settings/connections');
  });

  it('gives the current page a tooltip with its full name', async () => {
    await renderApp({ route: '/settings/appearance' });
    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' });

    expect(within(crumbs).getByTitle('Appearance')).toHaveAttribute('aria-current', 'page');
  });

  it('puts page actions in the page bar', async () => {
    await renderApp({ route: '/settings/appearance' });
    const banner = await screen.findByRole('banner');
    expect(within(banner).getByText('Changes save automatically')).toBeVisible();
  });
});
