import { act, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiRoutes,
  defaultNotificationSettings,
  type Notification,
  type NotificationSettings,
} from '@devhub/contracts';
import { makeNotification, makeNotificationList } from '@devhub/contracts/testing';
import { FakeAudioContext } from '../../../test/fake-audio-context.ts';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { FakeLocks, FakeNotification, installLocks } from '../../../test/fake-notifications.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const session = {
  id: '00000000000000aa',
  title: 'Add bulk archive',
  source: { kind: 'jira' as const, key: 'PROJ-1423' },
};
const awake: NotificationSettings = {
  ...defaultNotificationSettings,
  quietHours: { ...defaultNotificationSettings.quietHours, on: false },
};

const approval = makeNotification({
  id: 'approval',
  what: {
    kind: 'approval',
    session,
    approvalId: 'call-1',
    about: 'command',
    command: 'npm test -- content-list',
    waiting: true,
  },
});
const finished = (id = 'finished') => makeNotification({ id, what: { kind: 'session_finished', session } });

function listing(notifications: Notification[]) {
  server.use(http.get(apiUrl(apiRoutes.notifications), () => HttpResponse.json(makeNotificationList(notifications))));
}

function choosing(settings: NotificationSettings) {
  server.use(http.get(apiUrl(apiRoutes.notificationSettings), () => HttpResponse.json(settings)));
}

/** The tab opened with these, then the server says these came (newest first, as the list is). */
async function arrive(notifications: Notification[], already: Notification[] = []) {
  listing(already);
  const app = await renderApp();
  await within(screen.getByRole('navigation', { name: 'Main' })).findByRole('button', { name: /^Notifications/ });
  await waitFor(() => {
    expect(screen.getByRole('region', { name: 'Pop-ups' })).toBeInTheDocument();
  });
  listing([...notifications, ...already]);
  act(() => {
    FakeEventSource.latest().emit({ type: 'notifications.changed' });
  });
  return app;
}

function popUps() {
  return screen.getByRole('region', { name: 'Pop-ups' });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pop-ups (spec 029)', () => {
  it('AC-23: Claude waiting pops up at once as an alert with Allow once, Review and Close, and stays', async () => {
    choosing(awake);
    await arrive([approval]);

    const toast = await within(popUps()).findByRole('alert', { name: 'Claude wants to run a command' });
    expect(toast).toHaveAccessibleDescription('PROJ-1423 · Add bulk archive · npm test -- content-list');
    expect(within(toast).getByRole('button', { name: 'Allow once' })).toBeVisible();
    expect(within(toast).getByRole('button', { name: 'Review' })).toBeVisible();
    expect(within(toast).getByRole('button', { name: 'Close' })).toBeVisible();
  });

  it('AC-23: an approval answered elsewhere takes its pop-up with it', async () => {
    choosing(awake);
    await arrive([approval]);
    await within(popUps()).findByRole('alert');

    listing([{ ...approval, what: { ...approval.what, waiting: false } as Notification['what'] }]);
    act(() => {
      FakeEventSource.latest().emit({ type: 'notifications.changed' });
    });

    await waitFor(() => {
      expect(within(popUps()).queryByRole('alert')).toBeNull();
    });
  });

  it('AC-24: anything else is a polite status that goes after 8 seconds, but not while the pointer is on it', async () => {
    choosing(awake);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = await arrive([finished()]);
    const toast = await within(popUps()).findByRole('status', { name: 'Session finished, ready for a pull request' });

    await user.hover(toast);
    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(toast).toBeInTheDocument();

    await user.unhover(toast);
    act(() => {
      vi.advanceTimersByTime(8_000);
    });
    expect(within(popUps()).queryByRole('status')).toBeNull();
  });

  it('AC-24: clicking it opens the session and reads it', async () => {
    choosing(awake);
    const read: unknown[] = [];
    server.use(
      http.post(apiUrl(apiRoutes.notificationsRead), async ({ request }) => {
        read.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user, history } = await arrive([finished()]);

    await user.click(
      await within(popUps()).findByRole('button', { name: 'Session finished, ready for a pull request' }),
    );

    expect(history.location.pathname).toBe('/sessions/00000000000000aa');
    expect(within(popUps()).queryByRole('status')).toBeNull();
    await waitFor(() => {
      expect(read).toEqual([{ ids: ['finished'] }]);
    });
  });

  it('AC-25: four at once show three, newest at the bottom; the fourth shows when one goes', async () => {
    choosing(awake);
    const { user } = await arrive([finished('d'), finished('c'), finished('b'), finished('a')]);

    await waitFor(() => {
      expect(within(popUps()).getAllByRole('status')).toHaveLength(3);
    });
    const [oldest] = within(popUps()).getAllByRole('button', { name: 'Close' });
    if (oldest === undefined) throw new Error('No pop-up to close');
    await user.click(oldest);

    expect(within(popUps()).getAllByRole('status')).toHaveLength(3);
  });

  it('none pops up for the session whose screen you’re on, which shows it already; it’s read and not in the bell', async () => {
    choosing(awake);
    const read: unknown[] = [];
    server.use(
      http.post(apiUrl(apiRoutes.notificationsRead), async ({ request }) => {
        read.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    listing([]);
    const { user } = await renderApp({ route: '/sessions/00000000000000aa' });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    await within(nav).findByRole('button', { name: 'Notifications' });
    listing([approval]);
    act(() => {
      FakeEventSource.latest().emit({ type: 'notifications.changed' });
    });

    await waitFor(() => {
      expect(read).toContainEqual({ ids: ['approval'] });
    });
    expect(within(popUps()).queryByRole('alert')).toBeNull();
    await user.click(within(nav).getByRole('button', { name: /^Notifications/ }));
    expect(await screen.findByText('No notifications yet.')).toBeVisible();
  });

  it('those already there when the tab opened don’t pop up', async () => {
    choosing(awake);
    await arrive([], [finished()]);

    // The list with it in has been read: the bell counts it.
    await within(screen.getByRole('navigation', { name: 'Main' })).findByRole('button', {
      name: 'Notifications, 1 unread',
    });
    expect(within(popUps()).queryByRole('status')).toBeNull();
  });

  it('AC-26: pop-ups off, or off for that kind, pop nothing up', async () => {
    choosing({
      ...awake,
      events: { ...awake.events, session_finished: { ...awake.events.session_finished, popUp: false } },
    });
    await arrive([finished()]);

    // The list with it in has been read: the bell counts it.
    await within(screen.getByRole('navigation', { name: 'Main' })).findByRole('button', {
      name: 'Notifications, 1 unread',
    });
    expect(within(popUps()).queryByRole('status')).toBeNull();
  });

  it('AC-29: Do not disturb holds pop-ups back, but an approval still breaks through', async () => {
    choosing({ ...awake, doNotDisturb: { on: true, length: 'until_off', until: null } });
    await arrive([approval, finished()]);

    expect(await within(popUps()).findByRole('alert')).toBeVisible();
    expect(within(popUps()).queryByRole('status')).toBeNull();
  });
});

describe('sound and the desktop (spec 029)', () => {
  it('AC-27, AC-28: the tab that speaks knocks and shows Claude waiting on the desktop, without the command', async () => {
    choosing(awake);
    FakeAudioContext.reset();
    FakeNotification.reset();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('Notification', FakeNotification);
    const uninstall = installLocks(new FakeLocks());
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);

    await arrive([approval]);

    await waitFor(() => {
      expect(FakeNotification.shown.map(({ title, options }) => [title, options.body])).toEqual([
        ['Claude wants to run a command', 'PROJ-1423 · Add bulk archive'],
      ]);
    });
    expect(FakeAudioContext.instances[0]?.played.map((note) => note.frequency)).toEqual([392, 392]);
    uninstall();
  });
});
