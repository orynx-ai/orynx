import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render.tsx';

function mainNav() {
  return screen.getByRole('navigation', { name: 'Main' });
}

describe('Sidebar', () => {
  it('lists the places and marks the current one', async () => {
    await renderApp({ route: '/tickets' });
    const nav = mainNav();

    expect(await within(nav).findByRole('link', { name: 'Tickets' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: 'Settings' })).toBeVisible();
  });

  it('moves the current place when you navigate', async () => {
    const { user, history } = await renderApp();
    const nav = mainNav();

    await user.click(await within(nav).findByRole('link', { name: 'Settings' }));

    expect(history.location.pathname).toBe('/settings/connections');
    expect(within(nav).getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  });

  it('collapses and remembers it', async () => {
    const { user } = await renderApp();

    await user.click(within(mainNav()).getByRole('button', { name: 'Collapse sidebar' }));

    const expand = within(mainNav()).getByRole('button', { name: 'Expand sidebar' });
    expect(expand).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(localStorage.getItem('devhub.ui') ?? '{}')).toMatchObject({ state: { sidebarCollapsed: true } });

    await user.click(expand);
    expect(within(mainNav()).getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('keeps Search visible but disabled until search ships', async () => {
    await renderApp();
    expect(within(mainNav()).getByRole('button', { name: /Search/ })).toBeDisabled();
  });

  it('AC-4: names every icon-only control when collapsed, with a hover tooltip, in Tab order', async () => {
    const { user } = await renderApp();
    const nav = mainNav();
    await within(nav).findByText('Claude not connected · runs locally');
    await user.click(within(nav).getByRole('button', { name: 'Collapse sidebar' }));

    const expand = within(nav).getByRole('button', { name: 'Expand sidebar' });
    const newTask = within(nav).getByRole('link', { name: /^New task/ });
    const places = ['Home', 'Tickets', 'Settings'].map((name) => within(nav).getByRole('link', { name }));
    const footer = within(nav).getByRole('link', { name: 'You Claude not connected · runs locally' });

    expect(expand).toHaveAttribute('title', 'Expand sidebar');
    expect(newTask).toHaveAttribute('title', 'New task (⌥⌘N)');
    expect(within(nav).getByRole('button', { name: /Search/ })).toHaveAttribute('title', 'Search');
    expect(places.map((place) => place.getAttribute('title'))).toEqual(['Home', 'Tickets', 'Settings']);
    expect(footer).toHaveAttribute('title', 'You · Claude not connected · runs locally');

    const order = [expand, newTask, ...places, footer];
    expand.focus();
    for (const control of order.slice(1)) {
      await user.tab();
      expect(control).toHaveFocus();
    }
  });

  it('AC-2: shows no tooltips while expanded, where every name is already on screen', async () => {
    await renderApp();
    const nav = mainNav();

    expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute('title');
    expect(within(nav).getByRole('link', { name: /^New task/ })).not.toHaveAttribute('title');
  });
});
