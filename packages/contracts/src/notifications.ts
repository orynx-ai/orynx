import { z } from 'zod';
import { GitHubLinkSchema } from './github.ts';
import { JiraIssueKeySchema, JiraLinkSchema } from './jira.ts';
import { SessionIdSchema, SessionReadySchema, SessionSourceSchema } from './session.ts';

/**
 * Spec 029: what Orynx tells you about. A notification holds the facts the app words ("Claude wants to run a
 * command"), never words of its own, so the panel, a pop-up and a desktop notification say it the same way.
 */

/** The session a notification is about, as the sidebar shows it. */
export const NotificationSessionSchema = z.object({
  id: SessionIdSchema,
  title: z.string().min(1),
  source: SessionSourceSchema.nullable(),
});
export type NotificationSession = z.infer<typeof NotificationSessionSchema>;

/** A pull request in the inbox: `api #977`, its title, and its page on github.com. */
export const NotificationPullRequestSchema = z.object({
  repository: z.string().min(1),
  number: z.int().positive(),
  title: z.string().min(1),
  url: GitHubLinkSchema,
});
export type NotificationPullRequest = z.infer<typeof NotificationPullRequestSchema>;

export const NotificationWhatSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('approval'),
    session: NotificationSessionSchema,
    approvalId: z.string().min(1),
    /**
     * A push or a pull request is a command too, but only the Session screen answers those (Q3), as it does a
     * ticket's delete (spec 037).
     */
    about: z.enum(['command', 'edit', 'push', 'pull_request', 'ticket', 'server']),
    /** The command as Claude asked to run it; null for an edit. Never shown on the desktop. */
    command: z.string().min(1).nullable(),
    /** False once the call was answered or ended anywhere: it leaves Needs you and loses its buttons. */
    waiting: z.boolean(),
  }),
  z.object({
    kind: z.literal('session_finished'),
    session: NotificationSessionSchema,
    /** What Claude left it ready for; one raised before this said a pull request. */
    ready: SessionReadySchema.default('pull_request'),
  }),
  /** You pressed Stop. */
  z.object({ kind: z.literal('session_stopped'), session: NotificationSessionSchema }),
  z.object({ kind: z.literal('session_failed'), session: NotificationSessionSchema }),
  /** Claude's usage limit ended it. */
  z.object({ kind: z.literal('session_limit'), session: NotificationSessionSchema }),
  z.object({
    kind: z.literal('review_requested'),
    pullRequest: NotificationPullRequestSchema,
    /** The pull request's author, as GitHub names them; null when it names nobody. */
    by: z.string().min(1).nullable(),
  }),
  z.object({ kind: z.literal('checks_failed'), pullRequest: NotificationPullRequestSchema }),
  z.object({
    kind: z.literal('jira_assigned'),
    ticket: z.object({ key: JiraIssueKeySchema, title: z.string().min(1), url: JiraLinkSchema }),
  }),
]);
export type NotificationWhat = z.infer<typeof NotificationWhatSchema>;
export type NotificationKind = NotificationWhat['kind'];

export const NotificationSchema = z.object({
  id: z.string().min(1),
  at: z.iso.datetime(),
  read: z.boolean(),
  what: NotificationWhatSchema,
});
export type Notification = z.infer<typeof NotificationSchema>;

/** GET /api/notifications: the newest first, at most 200 and none older than 30 days (AC-18). */
export const NotificationListSchema = z.object({
  notifications: z.array(NotificationSchema),
  /** The bell's count and All's. */
  unread: z.int().nonnegative(),
  /** Approvals still waiting: Needs you's count. */
  waiting: z.int().nonnegative(),
});
export type NotificationList = z.infer<typeof NotificationListSchema>;

/** The most Orynx keeps, and for how long (AC-18). */
export const notificationLimits = { kept: 200, days: 30 } as const;

/** POST /api/notifications/read: some notifications, as you open them, or every one (Mark all read). */
export const MarkNotificationsReadSchema = z.union([
  z.strictObject({ ids: z.array(z.string().min(1)).min(1).max(notificationLimits.kept) }),
  z.strictObject({ all: z.literal(true) }),
]);
export type MarkNotificationsRead = z.infer<typeof MarkNotificationsReadSchema>;

/** Settings › Notifications' rows: the kinds, with stopped and failed as one (the design's "failed or stopped"). */
export const NotificationEventSchema = z.enum([
  'approval',
  'session_finished',
  'session_ended',
  'session_limit',
  'review_requested',
  'checks_failed',
  'jira_assigned',
]);
export type NotificationEvent = z.infer<typeof NotificationEventSchema>;

/** The row that decides how a kind of notification reaches you. */
export function notificationEventOf(kind: NotificationKind): NotificationEvent {
  return kind === 'session_stopped' || kind === 'session_failed' ? 'session_ended' : kind;
}

export const NotificationSoundSchema = z.enum(['knock', 'chime', 'ping', 'none']);
export type NotificationSound = z.infer<typeof NotificationSoundSchema>;

export const NotificationChoiceSchema = z.object({
  popUp: z.boolean(),
  desktop: z.boolean(),
  sound: NotificationSoundSchema,
});
export type NotificationChoice = z.infer<typeof NotificationChoiceSchema>;

/** Pause now's lengths: for 1 hour, until 9:00 tomorrow, until I turn it off. */
export const PauseLengthSchema = z.enum(['hour', 'tomorrow', 'until_off']);
export type PauseLength = z.infer<typeof PauseLengthSchema>;

export const DoNotDisturbSchema = z.object({
  on: z.boolean(),
  length: PauseLengthSchema,
  /** When it turns itself off, worked out in your own time zone when you turn it on; null for until I turn it off. */
  until: z.iso.datetime().nullable(),
});
export type DoNotDisturb = z.infer<typeof DoNotDisturbSchema>;

/** `HH:MM` on the 24-hour clock, as `<input type="time">` gives it. */
const ClockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const QuietHoursSchema = z
  .object({
    on: z.boolean(),
    from: ClockTimeSchema,
    to: ClockTimeSchema,
    /** Monday first. */
    days: z.array(z.boolean()).length(7),
  })
  .refine((hours) => hours.from !== hours.to, { message: 'Quiet hours need a different start and end.', path: ['to'] });
export type QuietHours = z.infer<typeof QuietHoursSchema>;

/** GET /api/notifications/settings: Settings › Notifications, saved on the server so every tab shares them. */
export const NotificationSettingsSchema = z.object({
  popUps: z.boolean(),
  desktop: z.boolean(),
  /** Desktop notifications only when Orynx isn't the tab you're looking at. */
  onlyInBackground: z.boolean(),
  sounds: z.boolean(),
  volume: z.int().min(0).max(100).multipleOf(5),
  events: z.record(NotificationEventSchema, NotificationChoiceSchema),
  doNotDisturb: DoNotDisturbSchema,
  quietHours: QuietHoursSchema,
  /** Still tell me when Claude is waiting for approval. */
  approvalsBreakThrough: z.boolean(),
});
export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

/** The design's defaults (spec 029, Assumptions). */
export const defaultNotificationSettings: NotificationSettings = {
  popUps: true,
  desktop: true,
  onlyInBackground: true,
  sounds: true,
  volume: 60,
  events: {
    approval: { popUp: true, desktop: true, sound: 'knock' },
    session_finished: { popUp: true, desktop: true, sound: 'chime' },
    session_ended: { popUp: true, desktop: true, sound: 'ping' },
    session_limit: { popUp: true, desktop: false, sound: 'ping' },
    review_requested: { popUp: true, desktop: false, sound: 'none' },
    checks_failed: { popUp: true, desktop: false, sound: 'none' },
    jira_assigned: { popUp: false, desktop: false, sound: 'none' },
  },
  doNotDisturb: { on: false, length: 'hour', until: null },
  quietHours: { on: true, from: '19:00', to: '09:00', days: [true, true, true, true, true, false, false] },
  approvalsBreakThrough: true,
};

/**
 * PATCH /api/notifications/settings: one change, as you make it. An event row sends only what changed in it;
 * Do not disturb and quiet hours go whole, so they're always checked together.
 */
export const NotificationSettingsChangeSchema = z
  .strictObject({
    popUps: z.boolean().optional(),
    desktop: z.boolean().optional(),
    onlyInBackground: z.boolean().optional(),
    sounds: z.boolean().optional(),
    volume: NotificationSettingsSchema.shape.volume.optional(),
    events: z.partialRecord(NotificationEventSchema, NotificationChoiceSchema.partial()).optional(),
    doNotDisturb: DoNotDisturbSchema.optional(),
    quietHours: QuietHoursSchema.optional(),
    approvalsBreakThrough: z.boolean().optional(),
  })
  .refine((change) => Object.values(change).some((value) => value !== undefined), {
    message: 'Send at least one setting.',
  });
export type NotificationSettingsChange = z.infer<typeof NotificationSettingsChangeSchema>;

/** The settings with one change on top: the server saves this, and the page shows it before the answer comes. */
export function withNotificationChange(
  settings: NotificationSettings,
  { events, ...change }: NotificationSettingsChange,
): NotificationSettings {
  const next = { ...settings, events: { ...settings.events } };
  for (const [key, value] of Object.entries(change)) {
    if (value !== undefined) Object.assign(next, { [key]: value });
  }
  for (const event of NotificationEventSchema.options) {
    const row = events?.[event];
    if (row === undefined) continue;
    const set = Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
    next.events[event] = { ...next.events[event], ...set };
  }
  return next;
}
