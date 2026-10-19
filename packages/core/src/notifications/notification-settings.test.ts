import { describe, expect, it } from 'vitest';
import { defaultNotificationSettings, type ServerEvent } from '@devhub/contracts';
import { createEventBus } from '../events/event-bus.ts';
import { createMemorySettingsStore, type Settings } from '../settings/settings-store.ts';
import { createNotificationSettingsService } from './notification-settings.ts';

function service(initial: Settings = {}) {
  const settings = createMemorySettingsStore(initial);
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  return { notifications: createNotificationSettingsService({ settings, events }), settings, seen };
}

describe('notification settings (spec 029)', () => {
  it("answers with the design's defaults when nothing was ever chosen", async () => {
    expect(await service().notifications.read()).toEqual(defaultNotificationSettings);
  });

  it('AC-39: saves one change, keeps the rest, and tells every tab (AC-44)', async () => {
    const { notifications, settings, seen } = service({ jira: { site: 'acme.atlassian.net', email: 'dev@acme.dev' } });

    const answer = await notifications.change({ events: { session_finished: { popUp: false } } });

    expect(answer.events.session_finished).toEqual({ popUp: false, desktop: true, sound: 'chime' });
    expect(await notifications.read()).toEqual(answer);
    expect((await settings.read()).jira).toEqual({ site: 'acme.atlassian.net', email: 'dev@acme.dev' });
    expect(seen).toEqual([{ type: 'settings.changed' }]);
  });

  it('AC-41: saves quiet hours and Do not disturb whole', async () => {
    const { notifications } = service();
    const quietHours = { on: false, from: '22:00', to: '07:00', days: [true, true, true, true, true, true, true] };
    const doNotDisturb = { on: true, length: 'hour' as const, until: '2026-10-19T11:00:00.000Z' };

    const answer = await notifications.change({ quietHours, doNotDisturb });

    expect(answer).toMatchObject({ quietHours, doNotDisturb });
  });

  it('reads what it can of a hand-edited file, keeps keys it doesn’t know, and fills the rest with defaults', async () => {
    const { notifications, settings } = service({
      notifications: {
        volume: 35,
        sounds: 'loud',
        events: { approval: { popUp: false }, review_requested: 7 },
        later: 1,
      },
    });

    const read = await notifications.read();
    expect(read.volume).toBe(35);
    expect(read.sounds).toBe(true);
    expect(read.events.approval).toEqual({ ...defaultNotificationSettings.events.approval, popUp: false });
    expect(read.events.review_requested).toEqual(defaultNotificationSettings.events.review_requested);

    await notifications.change({ popUps: false });
    expect((await settings.read()).notifications).toMatchObject({ later: 1, popUps: false, volume: 35 });
  });
});
