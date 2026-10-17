import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useUiStore } from '../stores/ui-store.ts';
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

  it('AC-7: keeps Search reachable but inactive until search ships', async () => {
    const { user } = await renderApp({ route: '/tickets' });
    const search = within(mainNav()).getByRole('button', { name: /Search/ });

    expect(search).toHaveAttribute('aria-disabled', 'true');
    await user.click(search);
    expect(screen.getByRole('main')).toBeVisible();
    expect(search).toHaveFocus();
  });

  it('AC-4: names every icon-only control when collapsed, with a hover tooltip, in Tab order', async () => {
    const { user } = await renderApp();
    const nav = mainNav();
    await within(nav).findByText('Claude not connected · runs locally');
    await user.click(within(nav).getByRole('button', { name: 'Collapse sidebar' }));

    const expand = within(nav).getByRole('button', { name: 'Expand sidebar' });
    const newTask = within(nav).getByRole('link', { name: /^New task/ });
    const search = within(nav).getByRole('button', { name: /Search/ });
    const places = ['Home', 'Tickets', 'Settings'].map((name) => within(nav).getByRole('link', { name }));
    const footer = within(nav).getByRole('link', { name: 'You Claude not connected · runs locally' });

    expect(expand).toHaveAttribute('title', 'Expand sidebar');
    expect(newTask).toHaveAttribute('title', 'New task (⌥⌘N)');
    expect(search).toHaveAttribute('title', 'Search');
    expect(places.map((place) => place.getAttribute('title'))).toEqual(['Home', 'Tickets', 'Settings']);
    expect(footer).toHaveAttribute('title', 'You · Claude not connected · runs locally');

    // jsdom applies no CSS, so the narrow-window Sessions link (display: none from 768 px) is
    // in its Tab order too; check that the rail's controls come in this order, in sequence.
    expand.focus();
    const reached: Element[] = [];
    while (document.activeElement !== footer && reached.length < 10) {
      await user.tab();
      if (document.activeElement !== null) reached.push(document.activeElement);
    }
    const order = [newTask, search, ...places, footer];
    expect(reached.filter((element) => order.includes(element as HTMLElement))).toEqual(order);
  });

  it('AC-2: shows no tooltips while expanded, where every name is already on screen', async () => {
    await renderApp();
    const nav = mainNav();

    expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute('title');
    expect(within(nav).getByRole('link', { name: /^New task/ })).not.toHaveAttribute('title');
  });

  it('AC-19: reaches the session list from the narrow top bar, which has no session rows', async () => {
    const { user, history } = await renderApp({ route: '/tickets' });

    await user.click(within(mainNav()).getByRole('link', { name: 'Sessions' }));

    expect(history.location.pathname).toBe('/sessions');
  });

  it('AC-22: resizes from the keyboard in 16 px steps and remembers the width', async () => {
    const { user } = await renderApp();
    const nav = mainNav();
    const handle = within(nav).getByRole('separator', { name: 'Resize sidebar' });
    expect(handle).toHaveAttribute('aria-valuenow', '260');
    expect(handle).toHaveAttribute('aria-controls', nav.id);

    handle.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');

    expect(handle).toHaveAttribute('aria-valuenow', '292');
    expect(nav.style.getPropertyValue('--sidebar-width')).toBe('292px');
    expect(JSON.parse(localStorage.getItem('devhub.ui') ?? '{}')).toMatchObject({ state: { sidebarWidth: 292 } });
  });

  it('AC-23: keeps a remembered width within 260–400 px', async () => {
    localStorage.setItem(
      'devhub.ui',
      JSON.stringify({ state: { sidebarCollapsed: false, sidebarWidth: 999 }, version: 0 }),
    );
    await useUiStore.persist.rehydrate();
    await renderApp();

    expect(within(mainNav()).getByRole('separator', { name: 'Resize sidebar' })).toHaveAttribute(
      'aria-valuenow',
      '400',
    );
  });

  it('AC-24: has no resize handle while collapsed', async () => {
    const { user } = await renderApp();
    await user.click(within(mainNav()).getByRole('button', { name: 'Collapse sidebar' }));

    expect(within(mainNav()).queryByRole('separator')).toBeNull();
  });
});
