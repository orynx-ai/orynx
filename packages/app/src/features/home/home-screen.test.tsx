import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/render.tsx';

describe('HomeScreen', () => {
  it('greets you and shows Home as the only breadcrumb', async () => {
    await renderApp();

    expect(await screen.findByRole('heading', { level: 1, name: 'What should we build today?' })).toBeVisible();
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Home')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('AC-21: explains how the attention list gets filled and links to Connections', async () => {
    const { user, history } = await renderApp();
    const panel = screen.getByRole('region', { name: 'Needs your attention' });

    expect(await within(panel).findByText('Nothing needs you yet')).toBeVisible();
    await user.click(within(panel).getByRole('link', { name: 'Connect your tools' }));

    expect(history.location.pathname).toBe('/settings/connections');
  });
});
