import type { z } from 'zod';
import {
  notificationLimits,
  NotificationWhatSchema,
  type MarkNotificationsRead,
  type Notification,
  type NotificationList,
  type Session,
} from '@devhub/contracts';
import type { EventBus } from '../events/event-bus.ts';
import type { InboxCache, InboxTool } from '../inbox/inbox-cache.ts';
import { PullRequestRecordSchema } from '../integrations/github/map.ts';
import { JiraIssueRecordSchema } from '../integrations/jira/map.ts';
import { githubNotifications, jiraNotifications, type InboxNotice } from './inbox-notifications.ts';
import { sessionNotifications } from './session-notifications.ts';

/** The bell (spec 029): what sessions and syncs raise, kept in `cache.db`, read and marked read by the page. */
export interface NotificationService {
  list(): NotificationList;
  markRead(request: MarkNotificationsRead): void;
  /** The session service's `onChange`. */
  sessionChanged(before: Session, after: Session, change?: { quiet: boolean }): void;
  /** The inbox service's `onSynced`. */
  inboxSynced(tool: InboxTool, before: readonly unknown[] | null, after: readonly unknown[]): void;
  /** The update service's `notify`: a newer Orynx is out (spec 045, AC-13). */
  updateAvailable(version: string): void;
}

export interface NotificationServiceOptions {
  cache: InboxCache;
  events: EventBus;
  /** The clock, in milliseconds. */
  now?: () => number;
  /** Told when the cache can't be written; a notification is never worth failing a session or a sync. */
  onError?: (error: unknown) => void;
}

const day = 24 * 60 * 60 * 1000;

/** The records that still read as the schema says; one from an older shape is left out. */
function readable<T>(records: readonly unknown[], schema: z.ZodType<T>): T[] {
  return records.flatMap((record) => {
    const parsed = schema.safeParse(record);
    return parsed.success ? [parsed.data] : [];
  });
}

export function createNotificationService({
  cache,
  events,
  now = Date.now,
  onError,
}: NotificationServiceOptions): NotificationService {
  /** Tools that have answered a sync since Orynx started: only their later syncs raise anything (AC-21). */
  const primed = new Set<InboxTool>();

  function changed() {
    events.publish({ type: 'notifications.changed' });
  }

  /** Runs a change to the cache, reporting a failure instead of throwing it into a session or a sync. */
  function safely(work: () => void) {
    try {
      work();
    } catch (error) {
      onError?.(error);
    }
  }

  function add(notices: readonly InboxNotice[]) {
    if (notices.length === 0) return;
    const at = now();
    cache.addNotifications(
      notices.map((notice) => ({ id: notice.id, at: new Date(at).toISOString(), data: notice.what })),
      { before: new Date(at - notificationLimits.days * day).toISOString() },
    );
    changed();
  }

  return {
    list() {
      const notifications = cache.notifications().flatMap(({ data, ...row }): Notification[] => {
        const what = NotificationWhatSchema.safeParse(data);
        return what.success ? [{ ...row, what: what.data }] : [];
      });
      return {
        notifications,
        unread: notifications.filter((notification) => !notification.read).length,
        waiting: notifications.filter(({ what }) => what.kind === 'approval' && what.waiting).length,
      };
    },

    markRead(request) {
      if (cache.markNotificationsRead('all' in request ? 'all' : request.ids) > 0) changed();
    },

    sessionChanged(before, after, { quiet } = { quiet: false }) {
      safely(() => {
        const notices = sessionNotifications(before, after, { quiet });
        let ended = false;
        for (const id of notices.ended) {
          ended = cache.changeNotification(id, (data) => ({ ...(data as object), waiting: false })) || ended;
        }
        if (notices.added.length > 0) add(notices.added);
        else if (ended) changed();
      });
    },

    inboxSynced(tool, before, after) {
      safely(() => {
        const first = !primed.has(tool);
        primed.add(tool);
        if (first || before === null) return;
        const at = new Date(now()).toISOString();
        add(
          tool === 'github'
            ? githubNotifications(readable(before, PullRequestRecordSchema), readable(after, PullRequestRecordSchema))
            : jiraNotifications(readable(before, JiraIssueRecordSchema), readable(after, JiraIssueRecordSchema), at),
        );
      });
    },

    updateAvailable(version) {
      safely(() => {
        add([{ id: `update_available:${version}`, what: { kind: 'update_available', version } }]);
      });
    },
  };
}
