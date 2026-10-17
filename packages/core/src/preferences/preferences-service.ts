import {
  defaultPreferences,
  InboxRuleIdSchema,
  type InboxRules,
  type Preferences,
  type PreferencesChange,
} from '@devhub/contracts';
import type { EventBus } from '../events/event-bus.ts';
import type { Settings, SettingsStore } from '../settings/settings-store.ts';

/** Settings › Coding agent and Inbox rules (spec 005): saved as the person changes them. */
export interface PreferencesService {
  /** The saved values, with the default for anything never chosen. */
  read(): Promise<Preferences>;
  /** Saves one change, says `settings.changed`, and answers with every preference. */
  change(change: PreferencesChange): Promise<Preferences>;
}

export interface PreferencesServiceOptions {
  settings: SettingsStore;
  events: EventBus;
}

function fromSettings(settings: Settings): Preferences {
  const saved = settings.inbox?.rules ?? {};
  const inboxRules: InboxRules = { ...defaultPreferences.inboxRules };
  for (const rule of InboxRuleIdSchema.options) {
    const on = saved[rule];
    if (on !== undefined) inboxRules[rule] = on;
  }
  return { permissionMode: settings.agent?.permissionMode ?? defaultPreferences.permissionMode, inboxRules };
}

function applied(current: Settings, change: PreferencesChange): Settings {
  const next = { ...current };
  if (change.permissionMode !== undefined) next.agent = { ...current.agent, permissionMode: change.permissionMode };
  if (change.inboxRules !== undefined) {
    next.inbox = { ...current.inbox, rules: { ...current.inbox?.rules, ...change.inboxRules } };
  }
  return next;
}

export function createPreferencesService({ settings, events }: PreferencesServiceOptions): PreferencesService {
  return {
    async read() {
      return fromSettings(await settings.read());
    },

    async change(change) {
      const next = await settings.update((current) => applied(current, change));
      events.publish({ type: 'settings.changed' });
      return fromSettings(next);
    },
  };
}
