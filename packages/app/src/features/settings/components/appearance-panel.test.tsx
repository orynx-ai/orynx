import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../test/render.tsx';

describe('AppearancePanel', () => {
  it('matches the computer by default', async () => {
    await renderApp({ route: '/settings/appearance' });

    expect(await screen.findByRole('radio', { name: 'Match my computer' })).toBeChecked();
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });

  it('switches to dark at once and remembers it', async () => {
    const { user } = await renderApp({ route: '/settings/appearance' });

    await user.click(await screen.findByRole('radio', { name: 'Dark' }));

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(JSON.parse(localStorage.getItem('devhub.theme') ?? '{}')).toMatchObject({ state: { theme: 'dark' } });
  });

  it('goes back to following the computer', async () => {
    const { user } = await renderApp({ route: '/settings/appearance' });
    await user.click(await screen.findByRole('radio', { name: 'Light' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');

    await user.click(screen.getByRole('radio', { name: 'Match my computer' }));

    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });
});
