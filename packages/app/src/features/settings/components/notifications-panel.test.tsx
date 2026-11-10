import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes, defaultNotificationSettings, withNotificationChange } from '@devhub/contracts';
import { makeDiscordConnection, makeSlackConnection } from '@devhub/contracts/testing';
import { FakeAudioContext } from '../../../test/fake-audio-context.ts';
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

/** Answers GET and PATCH from one copy, so the page reads back what it saved. */
function serving(start = defaultNotificationSettings) {
  let saved = start;
  const changes: unknown[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.notificationSettings), () => HttpResponse.json(saved)),
    http.patch(apiUrl(apiRoutes.notificationSettings), async ({ request }) => {
      const change = (await request.json()) as Parameters<typeof withNotificationChange>[1];
      changes.push(change);
      saved = withNotificationChange(saved, change);
      return HttpResponse.json(saved);
    }),
  );
  return changes;
}

function hearing() {
  FakeAudioContext.reset();
  vi.stubGlobal('AudioContext', FakeAudioContext);
  return () => FakeAudioContext.instances.map((context) => context.played[0]?.frequency);
}

describe('Settings › Notifications: sound (spec 029)', () => {
  it('AC-37: Volume reads and says its value; Play beside Chime plays it at that volume', async () => {
    browserSays('granted');
    const played = hearing();
    serving({ ...defaultNotificationSettings, volume: 35 });
    const { user } = await renderApp({ route: '/settings/notifications' });
    const section = await screen.findByRole('region', { name: 'Sound' });
    const volume = within(section).getByRole('slider', { name: 'Volume' });

    await waitFor(() => {
      expect(volume).toHaveAttribute('aria-valuetext', '35%');
    });
    expect(within(section).getByText('35%')).toBeVisible();
    await user.click(within(section).getByRole('button', { name: 'Play Chime' }));

    expect(played()).toEqual([880]);
    expect(FakeAudioContext.instances[0]?.played[0]?.peak).toBeCloseTo(0.1225);
  });

  it('AC-37: moving Volume saves it', async () => {
    browserSays('granted');
    const changes = serving();
    await renderApp({ route: '/settings/notifications' });
    const volume = within(await screen.findByRole('region', { name: 'Sound' })).getByRole('slider', { name: 'Volume' });
    await waitFor(() => {
      expect(volume).toBeEnabled();
    });

    fireEvent.change(volume, { target: { value: '35' } });

    await waitFor(() => {
      expect(changes).toEqual([{ volume: 35 }]);
    });
  });

  it('AC-36: Play sounds off disables the volume, every Play and every sound picker; on again, they return', async () => {
    browserSays('granted');
    serving();
    const { user } = await renderApp({ route: '/settings/notifications' });
    const sound = await screen.findByRole('region', { name: 'Sound' });
    const toggle = within(sound).getByRole('switch', { name: 'Play sounds' });
    await waitFor(() => {
      expect(toggle).toBeEnabled();
    });

    await user.click(toggle);

    const events = screen.getByRole('region', { name: 'What you’re told about' });
    await waitFor(() => {
      expect(within(sound).getByRole('slider', { name: 'Volume' })).toBeDisabled();
    });
    expect(within(sound).getByRole('button', { name: 'Play Knock' })).toBeDisabled();
    expect(within(events).getByRole('combobox', { name: 'Sound for Session finished' })).toBeDisabled();

    await user.click(toggle);

    await waitFor(() => {
      expect(within(sound).getByRole('slider', { name: 'Volume' })).toBeEnabled();
    });
    expect(within(events).getByRole('combobox', { name: 'Sound for Session finished' })).toBeEnabled();
  });
});

describe('Settings › Notifications: what you’re told about (spec 029)', () => {
  it('AC-38: a table of the events by group, each with its choices named for it', async () => {
    browserSays('granted');
    serving();
    await renderApp({ route: '/settings/notifications' });
    const table = within(await screen.findByRole('region', { name: 'What you’re told about' })).getByRole('table', {
      name: 'Notification choices by event',
    });

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((head) => head.textContent),
    ).toEqual(['Event', 'Pop-up', 'Desktop', 'Sound', 'Agent sessions', 'Inbox', 'Orynx']);
    expect(within(table).getByRole('columnheader', { name: 'Agent sessions' })).toBeVisible();
    expect(within(table).getByRole('columnheader', { name: 'Inbox' })).toBeVisible();
    // Questions share the row (spec 051, Q6).
    const approval = within(table).getByRole('row', { name: /The agent is waiting for you/ });
    expect(within(approval).getByText('Needs you')).toBeVisible();
    expect(
      within(approval).getByText('A command, an edit, a push, a pull request or a question needs you'),
    ).toBeVisible();
    await waitFor(() => {
      expect(within(table).getByRole('checkbox', { name: 'Pop-up for Session finished' })).toBeChecked();
    });
    expect(
      within(table).getByRole('checkbox', { name: 'Desktop notification for Session hit a limit' }),
    ).not.toBeChecked();
    expect(within(table).getByRole('combobox', { name: 'Sound for The agent is waiting for you' })).toHaveTextContent(
      'Knock',
    );
    expect(within(table).getByRole('combobox', { name: 'Sound for Jira ticket assigned to you' })).toHaveTextContent(
      'None',
    );
    // Spec 045, AC-13: a newer Orynx pops up, and nothing more, unless you choose.
    expect(within(table).getByRole('checkbox', { name: 'Pop-up for A new version of Orynx is out' })).toBeChecked();
    expect(
      within(table).getByRole('checkbox', { name: 'Desktop notification for A new version of Orynx is out' }),
    ).not.toBeChecked();
  });

  it('AC-39: unticking Pop-up saves it; picking a sound saves it and plays it', async () => {
    browserSays('granted');
    const played = hearing();
    const changes = serving();
    const { user } = await renderApp({ route: '/settings/notifications' });
    const table = within(await screen.findByRole('region', { name: 'What you’re told about' })).getByRole('table');
    const popUp = within(table).getByRole('checkbox', { name: 'Pop-up for Session finished' });
    await waitFor(() => {
      expect(popUp).toBeEnabled();
    });

    await user.click(popUp);
    await user.click(within(table).getByRole('combobox', { name: 'Sound for Session finished' }));
    await user.click(screen.getByRole('option', { name: 'Ping' }));

    await waitFor(() => {
      expect(changes).toEqual([
        { events: { session_finished: { popUp: false } } },
        { events: { session_finished: { sound: 'ping' } } },
      ]);
    });
    expect(played()).toEqual([1568]);
    expect(popUp).not.toBeChecked();
  });

  it('AC-39: a row with no sound can’t play one', async () => {
    browserSays('granted');
    serving();
    await renderApp({ route: '/settings/notifications' });
    const table = within(await screen.findByRole('region', { name: 'What you’re told about' })).getByRole('table');

    await waitFor(() => {
      expect(within(table).getByRole('button', { name: 'Play the sound for Session finished' })).toBeEnabled();
    });
    expect(
      within(table).getByRole('button', { name: 'Play the sound for Jira ticket assigned to you' }),
    ).toBeDisabled();
  });
});

describe('Settings › Notifications: do not disturb (spec 029)', () => {
  it('AC-40: picking Until 9:00 tomorrow and turning Pause now on says so, and saves when it ends', async () => {
    browserSays('granted');
    const changes = serving();
    const { user } = await renderApp({ route: '/settings/notifications' });
    const section = await screen.findByRole('region', { name: 'Do not disturb' });
    const pauseNow = within(section).getByRole('switch', { name: 'Pause now' });
    await waitFor(() => {
      expect(pauseNow).toBeEnabled();
    });
    expect(within(section).getByText('Off. Notifications and sounds are on.')).toBeVisible();

    await user.click(within(section).getByRole('combobox', { name: 'Pause for' }));
    await user.click(screen.getByRole('option', { name: 'Until 9:00 tomorrow' }));
    await user.click(pauseNow);

    expect(await within(section).findByText('Paused until 9:00 tomorrow.')).toBeVisible();
    const now = new Date();
    const nine = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0).toISOString();
    expect(changes).toEqual([
      { doNotDisturb: { on: false, length: 'tomorrow', until: null } },
      { doNotDisturb: { on: true, length: 'tomorrow', until: nine } },
    ]);
  });

  it('AC-41: quiet hours save each change, and a day reads as pressed', async () => {
    browserSays('granted');
    const changes = serving();
    const { user } = await renderApp({ route: '/settings/notifications' });
    const section = await screen.findByRole('region', { name: 'Do not disturb' });
    const saturday = within(section).getByRole('button', { name: 'Sat' });
    await waitFor(() => {
      expect(saturday).toBeEnabled();
    });
    expect(saturday).toHaveAttribute('aria-pressed', 'false');
    expect(within(section).getByRole('button', { name: 'Mon' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(saturday);
    await user.click(within(section).getByRole('combobox', { name: 'From' }));
    await user.click(screen.getByRole('option', { name: '20:30' }));
    await user.click(within(section).getByRole('switch', { name: 'Quiet hours' }));

    await waitFor(() => {
      expect(changes).toEqual([
        { quietHours: { on: true, from: '19:00', to: '09:00', days: [true, true, true, true, true, true, false] } },
        { quietHours: { on: true, from: '20:30', to: '09:00', days: [true, true, true, true, true, true, false] } },
        { quietHours: { on: false, from: '20:30', to: '09:00', days: [true, true, true, true, true, true, false] } },
      ]);
    });
    expect(saturday).toHaveAttribute('aria-pressed', 'true');
  });

  it('AC-41: From and to list every half hour, and a saved time between them still shows as picked', async () => {
    browserSays('granted');
    serving({
      ...defaultNotificationSettings,
      quietHours: { ...defaultNotificationSettings.quietHours, from: '22:15' },
    });
    const { user } = await renderApp({ route: '/settings/notifications' });
    const section = await screen.findByRole('region', { name: 'Do not disturb' });
    const from = within(section).getByRole('combobox', { name: 'From' });
    await waitFor(() => {
      expect(from).toHaveTextContent('22:15');
    });

    await user.click(from);

    const times = screen.getAllByRole('option').map((option) => option.textContent);
    expect(times).toHaveLength(49);
    expect(times.slice(0, 2)).toEqual(['00:00', '00:30']);
    expect(times.slice(44, 47)).toEqual(['22:00', '22:15', '22:30']);
    expect(screen.getByRole('option', { name: '22:15' })).toHaveAttribute('aria-selected', 'true');
  });

  it('AC-41: From equal to to says why on to, and saves nothing', async () => {
    browserSays('granted');
    const changes = serving();
    const { user } = await renderApp({ route: '/settings/notifications' });
    const section = await screen.findByRole('region', { name: 'Do not disturb' });
    const to = within(section).getByRole('combobox', { name: 'to' });
    await waitFor(() => {
      expect(to).toBeEnabled();
    });

    await user.click(to);
    await user.click(screen.getByRole('option', { name: '19:00' }));

    expect(await within(section).findByText('Quiet hours need a different start and end.')).toBeVisible();
    expect(to).toHaveAttribute('aria-invalid', 'true');
    expect(to).toHaveTextContent('19:00');
    expect(changes).toEqual([]);
  });

  it('AC-29: Still tell me when Claude is waiting saves as you change it', async () => {
    browserSays('granted');
    const changes = serving();
    const { user } = await renderApp({ route: '/settings/notifications' });
    const still = within(await screen.findByRole('region', { name: 'Do not disturb' })).getByRole('checkbox', {
      name: 'Still tell me when the agent is waiting for approval',
    });
    await waitFor(() => {
      expect(still).toBeEnabled();
    });
    expect(still).toHaveAccessibleDescription('Otherwise a session can sit paused all night.');

    await user.click(still);

    await waitFor(() => {
      expect(changes).toEqual([{ approvalsBreakThrough: false }]);
    });
  });
});

describe("Settings › Notifications: answer Claude's questions from chat (spec 057)", () => {
  const name = "Answer Claude's questions from chat";

  function connected({ slackBot = false, discord = false }) {
    server.use(
      http.get(apiUrl(apiRoutes.slackConnection), () => HttpResponse.json(makeSlackConnection({ bot: slackBot }))),
      http.get(apiUrl(apiRoutes.discordConnection), () =>
        HttpResponse.json(discord ? makeDiscordConnection() : makeDiscordConnection({ saved: null })),
      ),
    );
  }

  it('AC-12: with no Slack bot and no Discord, the row is off and disabled, and links to Connections', async () => {
    browserSays('granted');
    await renderApp({ route: '/settings/notifications' });
    const section = await where();

    const link = await within(section).findByRole('link', { name: 'Connect Slack or Discord first' });
    expect(link).toHaveAttribute('href', '/settings/connections');
    expect(within(section).getByRole('switch', { name })).toBeDisabled();
    expect(within(section).getByRole('switch', { name })).not.toBeChecked();
    expect(
      within(section).getByText(
        'Sends a question and its choices to Slack or Discord, and takes your reply. Commands still wait for you here.',
      ),
    ).toBeVisible();
  });

  it('AC-12, AC-17: with only Discord, Space turns it on for Discord, and Slack is a choice that waits for its bot', async () => {
    browserSays('granted');
    connected({ discord: true });
    // The server keeps what was saved, so the page reads it back after the save.
    let kept = defaultNotificationSettings;
    const changes: unknown[] = [];
    server.use(
      http.get(apiUrl(apiRoutes.notificationSettings), () => HttpResponse.json(kept)),
      http.patch(apiUrl(apiRoutes.notificationSettings), async ({ request }) => {
        const change = (await request.json()) as Parameters<typeof withNotificationChange>[1];
        changes.push(change);
        kept = withNotificationChange(kept, change);
        return HttpResponse.json(kept);
      }),
    );
    const { user } = await renderApp({ route: '/settings/notifications' });
    const section = await where();
    const row = within(section).getByRole('switch', { name });
    await waitFor(() => {
      expect(row).toBeEnabled();
    });

    row.focus();
    await user.keyboard(' ');
    await waitFor(() => {
      expect(changes).toEqual([{ chatAnswers: { on: true, to: 'discord' } }]);
    });
    const picker = within(section).getByRole('combobox', { name: 'Send questions to' });
    await waitFor(() => {
      expect(picker).toBeEnabled();
    });
    await user.click(picker);
    expect(screen.getByRole('option', { name: 'Discord' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Slack' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('option', { name: 'Slack and Discord' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('AC-12: with both, picking Slack and Discord saves it', async () => {
    browserSays('granted');
    connected({ slackBot: true, discord: true });
    server.use(
      http.get(apiUrl(apiRoutes.notificationSettings), () =>
        HttpResponse.json({ ...defaultNotificationSettings, chatAnswers: { on: true, to: 'slack' } }),
      ),
    );
    const changes = saving();
    const { user } = await renderApp({ route: '/settings/notifications' });
    const section = await where();
    const picker = within(section).getByRole('combobox', { name: 'Send questions to' });
    await waitFor(() => {
      expect(picker).toBeEnabled();
    });

    await user.click(picker);
    await user.click(screen.getByRole('option', { name: 'Slack and Discord' }));
    await waitFor(() => {
      expect(changes).toEqual([{ chatAnswers: { on: true, to: 'both' } }]);
    });
  });
});
