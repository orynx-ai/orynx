import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/render.tsx';

describe('NotFoundScreen', () => {
  it('says the page does not exist and links back Home', async () => {
    const { user, history } = await renderApp({ route: '/nowhere' });

    expect(await screen.findByText('This page does not exist')).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Go to Home' }));

    expect(history.location.pathname).toBe('/');
  });
});
