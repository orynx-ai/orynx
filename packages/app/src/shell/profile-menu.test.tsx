import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeStatus } from '@devhub/contracts/testing';
import { apiUrl, serveProfile, server } from '../test/msw.ts';
import { renderApp } from '../test/render.tsx';

function footer() {
  return within(screen.getByRole('navigation', { name: 'Main' })).findByRole('button', { name: /^Profile: / });
}

describe('Profile menu', () => {
  it('shows the person, then Appearance and Settings', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.status), () => HttpResponse.json(makeStatus({ user: { name: 'Rakesh Dhariwal' } }))),
    );
    serveProfile({ bio: 'Ships on Fridays' });
    const { user } = await renderApp();

    await user.click(await footer());
    const menu = screen.getByRole('menu', { name: 'Profile' });

    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['RDRakesh Dhariwal Ships on Fridays', 'Appearance', 'Settings']);
  });

  it('picks Light, Dark or System under Appearance, and the page follows at once', async () => {
    const { user } = await renderApp();

    await user.click(await footer());
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowRight}');
    const appearance = await screen.findByRole('menu', { name: 'Appearance' });
    expect(
      within(appearance)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent),
    ).toEqual(['Light', 'Dark', 'System']);
    expect(within(appearance).getByRole('menuitemradio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');

    await user.click(within(appearance).getByRole('menuitemradio', { name: 'Dark' }));

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(JSON.parse(localStorage.getItem('devhub.theme') ?? '{}')).toMatchObject({ state: { theme: 'dark' } });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens Settings', async () => {
    const { user, history } = await renderApp();

    await user.click(await footer());
    await user.click(screen.getByRole('menuitem', { name: 'Settings' }));

    expect(history.location.pathname).toBe('/settings/connections');
  });

  it('opens Edit profile from the person, and gives focus back to the footer when it closes', async () => {
    const { user } = await renderApp();
    const button = await footer();

    await user.click(button);
    await user.click(screen.getByRole('menuitem', { name: 'You Edit profile' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit profile' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('sits in the narrow bar, where the footer is hidden, behind the avatar', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const { user } = await renderApp();

    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Profile' }));

    // No room for a sub menu beside it, so the theme choices are in the menu itself.
    const menu = screen.getByRole('menu', { name: 'Profile' });
    expect(within(menu).getByText('Appearance')).toBeVisible();
    expect(within(menu).queryByRole('menuitem', { name: 'Appearance' })).toBeNull();
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Light' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });
});
