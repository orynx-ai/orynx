import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeNotification, makeNotificationList } from '@devhub/contracts/testing';
import { useUiStore } from '../../../stores/ui-store.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

function mainNav() {
  return screen.getByRole('navigation', { name: 'Main' });
}

function unread(count: number) {
  const notifications = Array.from({ length: count }, (_, n) => makeNotification({ id: `n-${String(n)}` }));
  server.use(http.get(apiUrl(apiRoutes.notifications), () => HttpResponse.json(makeNotificationList(notifications))));
}

function narrow() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe('the bell (spec 029)', () => {
  it('AC-1: sits at the bottom of the sidebar, after the person and Claude’s state, with the unread count', async () => {
    unread(4);
    await renderApp();
    const nav = mainNav();

    const bell = await within(nav).findByRole('button', { name: 'Notifications, 4 unread' });
    const person = within(nav).getByRole('link', { name: /Claude not connected/ });
    expect(person.compareDocumentPosition(bell) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(nav).getAllByRole('button', { name: /^Notifications/ })).toHaveLength(1);
    // Nothing at the top beside the logo: the first button there is Collapse sidebar.
    expect(within(nav).getAllByRole('button')[0]).toHaveAccessibleName('Collapse sidebar');
  });

  it('AC-1: with nothing unread it is named Notifications, with no count', async () => {
    await renderApp();

    expect(await within(mainNav()).findByRole('button', { name: 'Notifications' })).toHaveTextContent('');
  });

  it('AC-2: on the collapsed rail it sits above the avatar, with its count', async () => {
    unread(2);
    useUiStore.setState({ sidebarCollapsed: true });
    await renderApp();
    const nav = mainNav();

    const bell = await within(nav).findByRole('button', { name: 'Notifications, 2 unread' });
    const person = within(nav).getByRole('link', { name: /Claude not connected/ });
    expect(bell.compareDocumentPosition(person) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('AC-3: under 768 px it sits in the top bar, before Search, once', async () => {
    narrow();
    unread(4);
    await renderApp();
    const nav = mainNav();

    const bell = await within(nav).findByRole('button', { name: 'Notifications, 4 unread' });
    const search = within(nav).getByRole('button', { name: /^Search/ });
    expect(bell.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(nav).getAllByRole('button', { name: /^Notifications/ })).toHaveLength(1);
  });

  it('AC-4: opens the panel named Notifications', async () => {
    unread(1);
    const { user } = await renderApp();

    await user.click(await within(mainNav()).findByRole('button', { name: 'Notifications, 1 unread' }));

    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeVisible();
  });
});
