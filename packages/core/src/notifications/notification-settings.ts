import {
  defaultNotificationSettings,
  NotificationChoiceSchema,
  NotificationEventSchema,
  NotificationSettingsSchema,
  withNotificationChange,
  type NotificationSettings,
  type NotificationSettingsChange,
} from '@devhub/contracts';
import type { EventBus } from '../events/event-bus.ts';
import type { Settings, SettingsStore } from '../settings/settings-store.ts';

/** Settings › Notifications (spec 029), saved as you change them, in `settings.json` under `notifications`. */
export interface NotificationSettingsService {
  /** The saved values, with the default for anything never chosen or not readable. */
  read(): Promise<NotificationSettings>;
  /** Saves one change, says `settings.changed`, and answers with every setting. */
  change(change: NotificationSettingsChange): Promise<NotificationSettings>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function written(settings: Settings): Record<string, unknown> {
  return isObject(settings.notifications) ? settings.notifications : {};
}

/** Each value as written when it reads, else its default, so one bad value can't lose the others. */
function fromSettings(settings: Settings): NotificationSettings {
  const saved = written(settings);
  const read: NotificationSettings = {
    ...defaultNotificationSettings,
    events: { ...defaultNotificationSettings.events },
  };
  const fields = NotificationSettingsSchema.shape;
  for (const key of Object.keys(fields) as (keyof NotificationSettings)[]) {
    if (key === 'events') continue;
    const value = fields[key].safeParse(saved[key]);
    if (value.success) Object.assign(read, { [key]: value.data });
  }
  const events = isObject(saved['events']) ? saved['events'] : {};
  for (const event of NotificationEventSchema.options) {
    const row = events[event];
    if (!isObject(row)) continue;
    const value = NotificationChoiceSchema.safeParse({ ...read.events[event], ...row });
    if (value.success) read.events[event] = value.data;
  }
  return read;
}

export function createNotificationSettingsService({
  settings,
  events,
}: {
  settings: SettingsStore;
  events: EventBus;
}): NotificationSettingsService {
  return {
    async read() {
      return fromSettings(await settings.read());
    },

    async change(change) {
      const next = await settings.update((current) => ({
        ...current,
        // Every setting is written, on top of keys a newer Orynx may have added.
        notifications: { ...written(current), ...withNotificationChange(fromSettings(current), change) },
      }));
      events.publish({ type: 'settings.changed' });
      return fromSettings(next);
    },
  };
}
