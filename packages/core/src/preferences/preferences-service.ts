import {
  defaultPreferences,
  EditorSchema,
  InboxRuleIdSchema,
  PermissionModeSchema,
  permissionsFromMode,
  PermissionsSchema,
  type InboxRules,
  type Permissions,
  type Preferences,
  type PreferencesChange,
} from '@devhub/contracts';
import type { EventBus } from '../events/event-bus.ts';
import type { Settings, SettingsStore } from '../settings/settings-store.ts';

/** Settings › Coding agent and Inbox rules (spec 005), and the editor (spec 013): saved as the person changes them. */
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

/**
 * Settings › Coding agent's rows (spec 026): each as written, else as an older saved mode set it, else its default.
 * A row this version can't read keeps that fallback, so nothing written is lost.
 */
function writtenPermissions(settings: Settings): Permissions {
  const mode = PermissionModeSchema.safeParse(settings.agent?.['permissionMode']);
  const permissions = { ...(mode.success ? permissionsFromMode(mode.data) : defaultPreferences.permissions) };
  const written = settings.agent?.['permissions'];
  if (!isObject(written)) return permissions;
  const rows = PermissionsSchema.shape;
  for (const row of Object.keys(rows) as (keyof Permissions)[]) {
    const value = rows[row].safeParse(written[row]);
    if (value.success) Object.assign(permissions, { [row]: value.data });
  }
  return permissions;
}

/** What can be read, with the default for anything never chosen or not readable. */
function fromSettings(settings: Settings): Preferences {
  const saved = writtenRules(settings);
  const inboxRules: InboxRules = { ...defaultPreferences.inboxRules };
  for (const rule of InboxRuleIdSchema.options) {
    const on = saved[rule];
    if (typeof on === 'boolean') inboxRules[rule] = on;
  }
  const editor = EditorSchema.safeParse(settings.agent?.['editor']);
  return {
    permissions: writtenPermissions(settings),
    inboxRules,
    allowedCommands: writtenCommands(settings),
    editor: editor.success ? editor.data : defaultPreferences.editor,
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
  // Every row is written, so an older saved mode no longer counts once a row changes (spec 026).
  if (change.permissions !== undefined) {
    next.agent = { ...current.agent, permissions: { ...writtenPermissions(current), ...change.permissions } };
  }
  if (change.editor !== undefined) next.agent = { ...next.agent, editor: change.editor };
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
