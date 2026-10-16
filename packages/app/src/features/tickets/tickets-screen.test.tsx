import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/render.tsx';

describe('TicketsScreen', () => {
  it('says Jira is not connected and where to connect it', async () => {
    const { user, history } = await renderApp({ route: '/tickets' });

    expect(await screen.findByText('Jira is not connected')).toBeVisible();
    expect(screen.getByText('Connect it in Settings to see your sprint.')).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Open Settings' }));

    expect(history.location.pathname).toBe('/settings/connections');
  });
});
