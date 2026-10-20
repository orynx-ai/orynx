import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { apiRoutes, defaultNotificationSettings, withNotificationChange, type Notification } from '@devhub/contracts';
import { makeNotification, makeNotificationList } from '@devhub/contracts/testing';
import { useUiStore } from '../../../stores/ui-store.ts';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
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
  it('AC-1: sits at the bottom of the sidebar, after the person, with the unread count', async () => {
    unread(4);
    await renderApp();
    const nav = mainNav();

    const bell = await within(nav).findByRole('button', { name: 'Notifications, 4 unread' });
    const person = within(nav).getByRole('button', { name: /^Profile: / });
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
    const person = within(nav).getByRole('button', { name: /^Profile: / });
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

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const session = {
  id: '00000000000000aa',
  title: 'Add bulk archive',
  source: { kind: 'jira' as const, key: 'PROJ-1423' },
};

const approval = makeNotification({
  id: 'approval',
  at: minutesAgo(2),
  what: {
    kind: 'approval',
    session,
    approvalId: 'call-1',
    about: 'command',
    command: 'npm test -- content-list',
    waiting: true,
  },
});
const finished = makeNotification({ id: 'finished', at: minutesAgo(40) });
const review = makeNotification({
  id: 'review',
  at: minutesAgo(60),
  what: {
    kind: 'review_requested',
    pullRequest: {
      repository: 'api',
      number: 977,
      title: 'Rate-limit the export endpoint',
      url: 'https://github.com/acme/api/pull/977',
    },
    by: 'Arjun Mehta',
  },
});
const checks = makeNotification({
  id: 'checks',
  at: new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString(),
  read: true,
  what: {
    kind: 'checks_failed',
    pullRequest: {
      repository: 'web-app',
      number: 2836,
      title: 'Fix the export',
      url: 'https://github.com/acme/web-app/pull/2836',
    },
  },
});

function listing(notifications: Notification[]) {
  server.use(http.get(apiUrl(apiRoutes.notifications), () => HttpResponse.json(makeNotificationList(notifications))));
}

/** Answers POST /api/notifications/read, keeping what each request asked. */
function reading() {
  const asked: unknown[] = [];
  server.use(
    http.post(apiUrl(apiRoutes.notificationsRead), async ({ request }) => {
      asked.push(await request.json());
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return asked;
}

async function openPanel(user: Awaited<ReturnType<typeof renderApp>>['user']) {
  await user.click(await within(mainNav()).findByRole('button', { name: /^Notifications/ }));
  return screen.getByRole('dialog', { name: 'Notifications' });
}

describe('the panel (spec 029)', () => {
  it('AC-4: has All with the unread count and Needs you with the waiting count, grouped Today and Earlier', async () => {
    listing([approval, finished, review, checks]);
    const { user } = await renderApp();
    await within(mainNav()).findByRole('button', { name: 'Notifications, 3 unread' });

    const panel = await openPanel(user);

    expect(within(panel).getByRole('tab', { name: 'All 3', selected: true })).toBeVisible();
    expect(within(panel).getByRole('tab', { name: 'Needs you 1' })).toBeVisible();
    const today = within(panel).getByRole('region', { name: 'Today' });
    expect(
      within(today)
        .getAllByRole('listitem')
        .map((row) => within(row).getAllByRole('button')[0]?.textContent),
    ).toEqual([
      'Claude wants to run a command',
      'Session finished, ready for a pull request',
      'Arjun M. requested your review',
    ]);
    expect(
      within(today).getByRole('button', { name: 'Claude wants to run a command, unread' }),
    ).toHaveAccessibleDescription('PROJ-1423 · Add bulk archive · npm test -- content-list 2 min ago');
    const earlier = within(panel).getByRole('region', { name: 'Earlier' });
    expect(within(earlier).getByRole('button', { name: 'Checks failed on your pull request' })).toBeVisible();
  });

  it('AC-5: opening the panel marks nothing read', async () => {
    listing([finished]);
    const asked = reading();
    const { user } = await renderApp();
    await openPanel(user);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(asked).toEqual([]);
    expect(within(mainNav()).getByRole('button', { name: 'Notifications, 1 unread' })).toHaveFocus();
  });

  it('AC-7: opening a session’s notification goes to its Session screen, closes the panel and marks it read', async () => {
    listing([finished]);
    const asked = reading();
    const { user, history } = await renderApp();
    const panel = await openPanel(user);

    await user.click(within(panel).getByRole('button', { name: 'Session finished, ready for a pull request, unread' }));

    expect(history.location.pathname).toBe('/sessions/00000000000000bb');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(asked).toEqual([{ ids: ['finished'] }]);
    expect(within(mainNav()).getByRole('button', { name: 'Notifications' })).toBeVisible();
  });

  it('AC-8: opening a review request opens the pull request outside Orynx', async () => {
    listing([review]);
    reading();
    const { user, platform } = await renderApp();
    const panel = await openPanel(user);

    await user.click(within(panel).getByRole('button', { name: 'Arjun M. requested your review, unread' }));

    expect(platform.openExternal).toHaveBeenCalledWith('https://github.com/acme/api/pull/977');
  });

  it('AC-13: Mark all read clears every dot and the count, and another tab hears it from the server', async () => {
    listing([approval, finished]);
    const asked = reading();
    const { user } = await renderApp();
    const panel = await openPanel(user);

    await user.click(within(panel).getByRole('button', { name: 'Mark all read' }));

    expect(asked).toEqual([{ all: true }]);
    expect(within(panel).getByRole('tab', { name: 'All' })).toBeVisible();
    expect(within(panel).getByRole('button', { name: 'Session finished, ready for a pull request' })).toBeVisible();

    // The server now says one came in from elsewhere.
    listing([
      { ...finished, id: 'new' },
      { ...approval, read: true },
      { ...finished, read: true },
    ]);
    FakeEventSource.latest().emit({ type: 'notifications.changed' });
    await waitFor(() => {
      expect(within(mainNav()).getByRole('button', { name: 'Notifications, 1 unread' })).toBeVisible();
    });
  });

  it('AC-14: Needs you says when nothing waits', async () => {
    listing([finished]);
    const { user } = await renderApp();
    const panel = await openPanel(user);

    await user.click(within(panel).getByRole('tab', { name: 'Needs you' }));

    expect(within(panel).getByText('Nothing is waiting for you.')).toBeVisible();
  });

  it('AC-15: with none at all it says so, and Mark all read is disabled', async () => {
    const { user } = await renderApp();
    const panel = await openPanel(user);

    expect(within(panel).getByText('No notifications yet.')).toBeVisible();
    expect(within(panel).getByRole('button', { name: 'Mark all read' })).toBeDisabled();
  });

  it('AC-16: three skeleton rows while the list is on its way', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.notifications), async () => {
        await delay('infinite');
        return HttpResponse.json(makeNotificationList());
      }),
    );
    const { user } = await renderApp();
    const panel = await openPanel(user);

    expect(
      within(within(panel).getByRole('list', { name: 'Notifications loading' })).getAllByRole('listitem'),
    ).toHaveLength(3);
  });

  it('AC-16: says when the list didn’t load, and Try again reads it again', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.notifications), () =>
        HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 }),
      ),
    );
    const { user } = await renderApp();
    const panel = await openPanel(user);
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Notifications didn’t load.');

    listing([finished]);
    await user.click(within(panel).getByRole('button', { name: 'Try again' }));

    expect(
      await within(panel).findByRole('button', { name: 'Session finished, ready for a pull request, unread' }),
    ).toBeVisible();
  });
});

describe('the panel’s foot (spec 029)', () => {
  it('AC-17: Do not disturb and Sounds save at once, as Settings saves them', async () => {
    const changes: unknown[] = [];
    let saved = defaultNotificationSettings;
    server.use(
      http.get(apiUrl(apiRoutes.notificationSettings), () => HttpResponse.json(saved)),
      http.patch(apiUrl(apiRoutes.notificationSettings), async ({ request }) => {
        const change = (await request.json()) as Parameters<typeof withNotificationChange>[1];
        changes.push(change);
        saved = withNotificationChange(saved, change);
        return HttpResponse.json(saved);
      }),
    );
    const { user } = await renderApp();
    const panel = await openPanel(user);
    const pause = await within(panel).findByRole('switch', { name: 'Do not disturb' });
    const sounds = within(panel).getByRole('switch', { name: 'Sounds' });
    expect(pause).not.toBeChecked();
    expect(sounds).toBeChecked();

    await user.click(pause);
    await user.click(sounds);

    await waitFor(() => {
      expect(changes).toEqual([
        { doNotDisturb: { on: true, length: 'hour', until: expect.any(String) as string } },
        { sounds: false },
      ]);
    });
    expect(pause).toBeChecked();
    expect(sounds).not.toBeChecked();
  });

  it('AC-31: Do not disturb past its end shows off', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.notificationSettings), () =>
        HttpResponse.json({
          ...defaultNotificationSettings,
          doNotDisturb: { on: true, length: 'hour', until: new Date(Date.now() - 60_000).toISOString() },
        }),
      ),
    );
    const { user } = await renderApp();
    const panel = await openPanel(user);

    expect(await within(panel).findByRole('switch', { name: 'Do not disturb' })).not.toBeChecked();
  });

  it.each(['All settings', 'Notification settings'])(
    'AC-17: %s opens Settings › Notifications and closes the panel',
    async (name) => {
      const { user, history } = await renderApp();
      const panel = await openPanel(user);

      await user.click(await within(panel).findByRole('link', { name }));

      expect(history.location.pathname).toBe('/settings/notifications');
      expect(screen.queryByRole('dialog')).toBeNull();
    },
  );
});
