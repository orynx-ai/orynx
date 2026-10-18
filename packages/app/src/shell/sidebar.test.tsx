import { fireEvent, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeInbox, makeInboxItem } from '@devhub/contracts/testing';
import { useUiStore } from '../stores/ui-store.ts';
import { apiUrl, server } from '../test/msw.ts';
import { renderApp } from '../test/render.tsx';
import { designTickets, ticketsHandler } from '../test/tickets.ts';

/** GET /api/inbox answering with this many rows. */
function inboxWith(count: number) {
  const items = Array.from({ length: count }, (_, index) =>
    makeInboxItem({ id: `github:acme/web-app#${String(index + 1)}` }),
  );
  server.use(http.get(apiUrl(apiRoutes.inbox), () => HttpResponse.json(makeInbox({ items }))));
}

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

  it.each(['/?inbox=jira', '/?q=archive&sort=longest', '/?page=2'])(
    'AC-14, Q10i: keeps Home the current place with a tab, search or page in the address (%s)',
    async (route) => {
      await renderApp({ route });
      const nav = screen.getByRole('navigation', { name: 'Main' });

      expect(within(nav).getByRole('link', { name: /^Home/ })).toHaveAttribute('aria-current', 'page');
    },
  );

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

  it('names the product Orynx next to its mark, and keeps the name for screen readers when collapsed', async () => {
    const { user } = await renderApp();
    const name = within(mainNav()).getByText('Orynx');

    expect(name).toBeVisible();
    expect(name.previousElementSibling).toHaveAttribute('aria-hidden', 'true');

    await user.click(within(mainNav()).getByRole('button', { name: 'Collapse sidebar' }));
    expect(within(mainNav()).getByText('Orynx')).toHaveClass('md:sr-only');
  });

  it('AC-4 (spec 009): Search opens the Search dialog, says it opens one and names its key; Esc gives focus back', async () => {
    const { user } = await renderApp({ route: '/tickets' });
    const search = within(mainNav()).getByRole('button', { name: /Search/ });
    expect(search).toHaveAttribute('aria-haspopup', 'dialog');
    expect(search).toHaveAttribute('aria-keyshortcuts', 'Meta+K');
    expect(search).not.toHaveAttribute('aria-disabled');

    await user.click(search);
    expect(await screen.findByRole('dialog', { name: 'Search' })).toBeVisible();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(search).toHaveFocus();
  });

  it('AC-19 (spec 009): Search takes focus when clicked, so Esc gives it back even where a click doesn’t focus a button', async () => {
    const { user } = await renderApp({ route: '/tickets' });
    const search = within(mainNav()).getByRole('button', { name: /Search/ });
    // Safari leaves focus where it was when a button is clicked; start from there.
    screen.getByRole('main').focus();

    // A click event alone, as Safari sends it: no focus on mouse down.
    fireEvent.click(search);
    await screen.findByRole('dialog', { name: 'Search' });
    await user.keyboard('{Escape}');

    expect(search).toHaveFocus();
  });

  it('AC-4 (spec 009): Search on the collapsed rail opens it too, from the keyboard', async () => {
    const { user } = await renderApp({ route: '/tickets' });
    await user.click(within(mainNav()).getByRole('button', { name: 'Collapse sidebar' }));
    const search = within(mainNav()).getByRole('button', { name: /^Search/ });

    search.focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Search (⌘K)');
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('dialog', { name: 'Search' })).toBeVisible();
  });

  it('AC-7, AC-10, AC-11 (spec 020): every control on the rail shows its name in a tooltip as Tab reaches it', async () => {
    const { user } = await renderApp();
    const nav = mainNav();
    await within(nav).findByText('Claude not connected · runs locally');
    await user.click(within(nav).getByRole('button', { name: 'Collapse sidebar' }));
    const expand = within(nav).getByRole('button', { name: 'Expand sidebar' });
    const footer = within(nav).getByRole('link', { name: 'You Claude not connected · runs locally' });

    // Collapse kept focus on this button; focus it afresh, as Tab would.
    expand.blur();
    expand.focus();
    const tooltips: string[] = [(await screen.findByRole('tooltip')).textContent];
    while (document.activeElement !== footer && tooltips.length < 10) {
      await user.tab();
      tooltips.push(screen.queryByRole('tooltip')?.textContent ?? '(none)');
    }

    expect(tooltips).toEqual([
      'Expand sidebar',
      'Search (⌘K)',
      'Home',
      'Tickets',
      'Settings',
      'Sessions',
      'You · Claude not connected · runs locally',
    ]);
    // No control on the rail draws a title attribute: the tooltip is the one place its name shows.
    expect(nav.querySelectorAll('a[title], button[title]')).toHaveLength(0);
  });

  it('AC-7 (spec 020): the collapsed rail has Sessions, which opens the full list and is marked current', async () => {
    const { user, history } = await renderApp({ route: '/tickets' });
    await user.click(within(mainNav()).getByRole('button', { name: 'Collapse sidebar' }));

    await user.click(within(mainNav()).getByRole('link', { name: 'Sessions' }));

    expect(history.location.pathname).toBe('/sessions');
    expect(within(mainNav()).getByRole('link', { name: 'Sessions' })).toHaveAttribute('aria-current', 'page');
  });

  it('AC-2: shows no tooltips while expanded, where every name is already on screen', async () => {
    await renderApp();
    const nav = mainNav();

    within(nav).getByRole('link', { name: 'Home' }).focus();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    within(nav)
      .getByRole('button', { name: /^Search/ })
      .focus();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('AC-8 (spec 020): has no New task, collapsed or not; Home carries its shortcut for screen readers', async () => {
    const { user } = await renderApp();
    const nav = mainNav();
    expect(within(nav).queryByRole('link', { name: /New task/ })).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-keyshortcuts', 'Alt+Meta+N');

    await user.click(within(nav).getByRole('button', { name: 'Collapse sidebar' }));
    expect(within(nav).queryByRole('link', { name: /New task/ })).not.toBeInTheDocument();
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
    expect(handle).toHaveAttribute('aria-valuenow', '300');
    expect(handle).toHaveAttribute('aria-controls', nav.id);

    handle.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');

    expect(handle).toHaveAttribute('aria-valuenow', '332');
    expect(nav.style.getPropertyValue('--sidebar-width')).toBe('332px');
    expect(JSON.parse(localStorage.getItem('devhub.ui') ?? '{}')).toMatchObject({ state: { sidebarWidth: 332 } });

    await user.keyboard('{Home}');
    expect(handle).toHaveAttribute('aria-valuenow', '260');
    await user.keyboard('{End}');
    expect(handle).toHaveAttribute('aria-valuenow', '400');
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

  it.each([
    [260, '300'],
    [340, '340'],
  ])('AC-23: a width saved under the old 260 px default (%i) opens at %s px once', async (saved, opens) => {
    localStorage.setItem(
      'devhub.ui',
      JSON.stringify({ state: { sidebarCollapsed: false, sidebarWidth: saved }, version: 0 }),
    );
    await useUiStore.persist.rehydrate();
    await renderApp();

    expect(within(mainNav()).getByRole('separator', { name: 'Resize sidebar' })).toHaveAttribute(
      'aria-valuenow',
      opens,
    );
  });

  it('AC-24: has no resize handle while collapsed', async () => {
    const { user } = await renderApp();
    await user.click(within(mainNav()).getByRole('button', { name: 'Collapse sidebar' }));

    expect(within(mainNav()).queryByRole('separator')).toBeNull();
  });

  it('AC-32: shows next to Home how many items need you, and a screen reader hears what the number means', async () => {
    inboxWith(14);
    await renderApp({ route: '/tickets' });

    const home = await within(mainNav()).findByRole('link', { name: 'Home, 14 need you' });

    expect(within(home).getByText('14')).toBeVisible();
  });

  it('AC-32: says "needs you" for one item', async () => {
    inboxWith(1);
    await renderApp({ route: '/tickets' });

    expect(await within(mainNav()).findByRole('link', { name: 'Home, 1 needs you' })).toBeVisible();
  });

  it('AC-32: shows no count when nothing needs you', async () => {
    inboxWith(0);
    await renderApp({ route: '/tickets' });
    await screen.findByText('Claude not connected · runs locally');

    expect(within(mainNav()).getByRole('link', { name: 'Home' })).toBeVisible();
  });

  it('AC-32: leaves the count off the collapsed rail, where there is no room for it', async () => {
    inboxWith(3);
    useUiStore.setState({ sidebarCollapsed: true });
    await renderApp({ route: '/tickets' });
    await screen.findByText('Claude not connected · runs locally');

    expect(within(mainNav()).getByRole('link', { name: 'Home' })).toBeVisible();
    expect(within(mainNav()).queryByText('3')).toBeNull();
  });

  it('AC-27: shows next to Tickets how many of your tickets are in the sprint, Done included', async () => {
    server.use(ticketsHandler());
    await renderApp({ route: '/' });

    const tickets = await within(mainNav()).findByRole('link', { name: 'Tickets, 6 in your sprint' });

    expect(within(tickets).getByText('6')).toBeVisible();
  });

  it('AC-27: shows no Tickets count when none of the sprint is yours, or Jira isn’t connected', async () => {
    server.use(ticketsHandler({ tickets: designTickets.filter((ticket) => ticket.assignee?.mine !== true) }));
    await renderApp({ route: '/' });
    await screen.findByText('Claude not connected · runs locally');

    expect(within(mainNav()).getByRole('link', { name: 'Tickets' })).toBeVisible();
  });

  it('AC-27: leaves the Tickets count off the collapsed rail', async () => {
    server.use(ticketsHandler());
    useUiStore.setState({ sidebarCollapsed: true });
    await renderApp({ route: '/' });
    await screen.findByText('Claude not connected · runs locally');

    expect(within(mainNav()).getByRole('link', { name: 'Tickets' })).toBeVisible();
    expect(within(mainNav()).queryByText('6')).toBeNull();
  });
});
