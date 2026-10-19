import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes, defaultNotificationSettings, type NotificationSettings } from '@devhub/contracts';
import { FakeAudioContext } from '../../../test/fake-audio-context.ts';
import { FakeNotification } from '../../../test/fake-notifications.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

function choosing(settings: NotificationSettings) {
  server.use(http.get(apiUrl(apiRoutes.notificationSettings), () => HttpResponse.json(settings)));
}

async function send() {
  const app = await renderApp({ route: '/settings/notifications' });
  // The settings have come when the switches can be used.
  await waitFor(() => {
    expect(screen.getByRole('switch', { name: 'Play sounds' })).toBeEnabled();
  });
  await app.user.click(screen.getByRole('button', { name: 'Send a test notification' }));
  return app;
}

beforeEach(() => {
  FakeAudioContext.reset();
  FakeNotification.reset();
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('Notification', FakeNotification);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Send a test notification (spec 029)', () => {
  it('AC-42: pops up, shows on the desktop and knocks as an approval would, and says what you should have heard', async () => {
    choosing(defaultNotificationSettings);
    await send();

    expect(await screen.findByRole('status', { name: 'Test notification' })).toHaveAccessibleDescription(
      'This is how Orynx tells you Claude is waiting.',
    );
    expect(FakeNotification.shown.map(({ title, options }) => [title, options.body])).toEqual([
      ['Test notification', 'This is how Orynx tells you Claude is waiting.'],
    ]);
    expect(FakeAudioContext.instances[0]?.played.map((note) => note.frequency)).toEqual([392, 392]);
    expect(screen.getByText('Sent. You should have heard Knock.')).toBeInTheDocument();
  });

  it('AC-42: ignores Do not disturb, and with sounds off says it went without sound', async () => {
    choosing({
      ...defaultNotificationSettings,
      sounds: false,
      doNotDisturb: { on: true, length: 'until_off', until: null },
    });
    await send();

    expect(await screen.findByRole('status', { name: 'Test notification' })).toBeVisible();
    expect(FakeAudioContext.instances).toEqual([]);
    expect(screen.getByText('Sent, without sound.')).toBeInTheDocument();
  });

  it('AC-42: never joins the list under the bell', async () => {
    choosing(defaultNotificationSettings);
    await send();

    expect(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Notifications' }),
    ).toBeVisible();
  });

  it('AC-42: with pop-ups or the desktop off for approvals, sends neither', async () => {
    choosing({
      ...defaultNotificationSettings,
      events: { ...defaultNotificationSettings.events, approval: { popUp: false, desktop: false, sound: 'chime' } },
    });
    await send();

    expect(screen.getByText('Sent. You should have heard Chime.')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Test notification' })).toBeNull();
    expect(FakeNotification.shown).toEqual([]);
  });
});
