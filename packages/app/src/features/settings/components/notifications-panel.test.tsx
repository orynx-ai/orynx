import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes, defaultNotificationSettings, withNotificationChange } from '@devhub/contracts';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

/** The browser's Notification API, which jsdom lacks: what it says, and what asking makes it say. */
function browserSays(permission: NotificationPermission, afterAsking: NotificationPermission = permission) {
  const fake = { permission, requestPermission: vi.fn(() => Promise.resolve(afterAsking)) };
  vi.stubGlobal('Notification', fake);
  return fake;
}

/** Answers PATCH with the change applied, keeping each change. */
function saving() {
  const changes: unknown[] = [];
  server.use(
    http.patch(apiUrl(apiRoutes.notificationSettings), async ({ request }) => {
      const change = (await request.json()) as Parameters<typeof withNotificationChange>[1];
      changes.push(change);
      return HttpResponse.json(withNotificationChange(defaultNotificationSettings, change));
    }),
  );
  return changes;
}

async function where() {
  return screen.findByRole('region', { name: 'Where you get notified' });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Settings › Notifications: where you get notified (spec 029)', () => {
  it('AC-33: says notifications come from the browser, with both switches on as a fresh Orynx has them', async () => {
    browserSays('granted');
    await renderApp({ route: '/settings/notifications' });
    const section = await where();

    expect(
      within(section).getByText('Orynx runs on your computer, so notifications come from your browser.'),
    ).toBeVisible();
    await waitFor(() => {
      expect(within(section).getByRole('switch', { name: 'Pop-ups inside Orynx' })).toBeChecked();
    });
    expect(within(section).getByRole('switch', { name: 'Desktop notifications' })).toBeChecked();
    expect(within(section).getByText('Allowed in this browser')).toBeVisible();
    expect(
      within(section).getByRole('checkbox', { name: 'Only when Orynx isn’t the tab you’re looking at' }),
    ).toBeChecked();
  });

  it('AC-33, AC-39: each change saves at once', async () => {
    browserSays('granted');
    const changes = saving();
    const { user } = await renderApp({ route: '/settings/notifications' });
    const section = await where();
    const popUps = within(section).getByRole('switch', { name: 'Pop-ups inside Orynx' });
    await waitFor(() => {
      expect(popUps).toBeEnabled();
    });

    await user.click(popUps);
    await waitFor(() => {
      expect(popUps).not.toBeChecked();
    });
    await user.click(
      within(section).getByRole('checkbox', { name: 'Only when Orynx isn’t the tab you’re looking at' }),
    );

    await waitFor(() => {
      expect(changes).toEqual([{ popUps: false }, { onlyInBackground: false }]);
    });
  });

  it('AC-34: Allow in browser asks the browser; allowed, the pill says so and the button goes', async () => {
    const browser = browserSays('default', 'granted');
    const { user } = await renderApp({ route: '/settings/notifications' });
    const section = await where();
    expect(within(section).getByText('Not allowed yet')).toBeVisible();

    await user.click(await within(section).findByRole('button', { name: 'Allow in browser' }));

    expect(browser.requestPermission).toHaveBeenCalledOnce();
    expect(await within(section).findByText('Allowed in this browser')).toBeVisible();
    expect(within(section).queryByRole('button', { name: 'Allow in browser' })).toBeNull();
  });

  it('AC-34: blocked in the browser, it says so and offers no button', async () => {
    browserSays('denied');
    await renderApp({ route: '/settings/notifications' });
    const section = await where();

    expect(within(section).getByText('Blocked in browser settings')).toBeVisible();
    expect(within(section).queryByRole('button', { name: 'Allow in browser' })).toBeNull();
  });

  it('AC-35: the desktop app speaks of the operating system and its window, with no browser to ask', async () => {
    browserSays('default');
    await renderApp({ route: '/settings/notifications', platform: { kind: 'desktop' } });
    const section = await where();

    expect(within(section).getByText('Orynx shows notifications through your operating system.')).toBeVisible();
    expect(within(section).getByText('Allowed')).toBeVisible();
    expect(within(section).queryByRole('button', { name: 'Allow in browser' })).toBeNull();
    expect(
      within(section).getByRole('checkbox', { name: 'Only when Orynx isn’t the window you’re looking at' }),
    ).toBeVisible();
  });

  it('AC-43: while loading, the same controls show the defaults, disabled', async () => {
    browserSays('granted');
    server.use(
      http.get(apiUrl(apiRoutes.notificationSettings), async () => {
        await delay('infinite');
        return HttpResponse.json(defaultNotificationSettings);
      }),
    );
    await renderApp({ route: '/settings/notifications' });
    const section = await where();

    expect(within(section).getByRole('switch', { name: 'Pop-ups inside Orynx' })).toBeDisabled();
    expect(within(section).getByRole('switch', { name: 'Pop-ups inside Orynx' })).toBeChecked();
  });

  it('AC-43: a save that fails puts the control back and says so', async () => {
    browserSays('granted');
    server.use(
      http.patch(apiUrl(apiRoutes.notificationSettings), () =>
        HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 }),
      ),
    );
    const { user } = await renderApp({ route: '/settings/notifications' });
    const popUps = within(await where()).getByRole('switch', { name: 'Pop-ups inside Orynx' });
    await waitFor(() => {
      expect(popUps).toBeEnabled();
    });

    await user.click(popUps);

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save that change.");
    await waitFor(() => {
      expect(popUps).toBeChecked();
    });
  });

  it('AC-44: a change made in another tab shows here', async () => {
    browserSays('granted');
    await renderApp({ route: '/settings/notifications' });
    const popUps = within(await where()).getByRole('switch', { name: 'Pop-ups inside Orynx' });
    await waitFor(() => {
      expect(popUps).toBeChecked();
    });

    server.use(
      http.get(apiUrl(apiRoutes.notificationSettings), () =>
        HttpResponse.json({ ...defaultNotificationSettings, popUps: false }),
      ),
    );
    FakeEventSource.latest().emit({ type: 'settings.changed' });

    await waitFor(() => {
      expect(popUps).not.toBeChecked();
    });
  });
});
