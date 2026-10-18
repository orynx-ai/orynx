import {
  defaultPreferences,
  InboxRuleIdSchema,
  PermissionModeSchema,
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The rules as written, or none when they aren't an object. */
function writtenRules(settings: Settings): Record<string, unknown> {
  const rules = settings.inbox?.['rules'];
  return isObject(rules) ? rules : {};
}

/** What can be read, with the default for anything never chosen or not readable. */
function fromSettings(settings: Settings): Preferences {
  const saved = writtenRules(settings);
  const inboxRules: InboxRules = { ...defaultPreferences.inboxRules };
  for (const rule of InboxRuleIdSchema.options) {
    const on = saved[rule];
    if (typeof on === 'boolean') inboxRules[rule] = on;
  }
  const mode = PermissionModeSchema.safeParse(settings.agent?.['permissionMode']);
  return {
    permissionMode: mode.success ? mode.data : defaultPreferences.permissionMode,
    inboxRules,
    allowedCommands: writtenCommands(settings),
  };
}

/** The allow list as written (spec 012): its non-empty strings, or none when it isn't a list. */
function writtenCommands(settings: Settings): string[] {
  const list = settings.agent?.['allowedCommands'];
  return Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === 'string' && entry !== '') : [];
}

/** The change on top of what was written, keeping every key this version doesn't know. */
function applied(current: Settings, change: PreferencesChange): Settings {
  const next = { ...current };
  if (change.permissionMode !== undefined) next.agent = { ...current.agent, permissionMode: change.permissionMode };
  if (change.inboxRules !== undefined) {
    next.inbox = { ...current.inbox, rules: { ...writtenRules(current), ...change.inboxRules } };
  }
  if (change.allowCommand !== undefined || change.disallowCommand !== undefined) {
    // One entry at a time (spec 012): taken off wherever it is, added once at the end.
    const list = writtenCommands(current).filter((entry) => entry !== change.disallowCommand);
    if (change.allowCommand !== undefined && !list.includes(change.allowCommand)) list.push(change.allowCommand);
    next.agent = { ...next.agent, allowedCommands: list };
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
