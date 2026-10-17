import type { EventBus } from '../events/event-bus.ts';
import { jiraAccount } from '../integrations/jira/connection.ts';
import type { Settings, SettingsStore } from '../settings/settings-store.ts';
import type { InboxTool } from './inbox-cache.ts';
import type { InboxService } from './inbox-service.ts';

/**
 * When the inbox syncs on its own (spec 007): once at start, every 2 minutes while a page has the event
 * stream open, and at once when a tool connects. A tool that disconnects loses its rows from the cache.
 * Hosts turn this on with `autoSync`; tests leave it off, so nothing reaches Jira or GitHub by surprise.
 */
export interface InboxSchedule {
  stop(): void;
}

export interface InboxScheduleOptions {
  inbox: InboxService;
  settings: SettingsStore;
  events: EventBus;
  /** How often to sync while a page is open; 2 minutes (product spec, Refresh). */
  everyMs?: number;
  /** Told about a sync or settings read that failed behind the scenes. */
  onError?: (error: unknown) => void;
}

const tools: readonly InboxTool[] = ['jira', 'github'];

function accounts(settings: Settings): Record<InboxTool, string | null> {
  return {
    jira: settings.jira === undefined ? null : jiraAccount(settings.jira),
    github: settings.github?.method ?? null,
  };
}

export function startInboxSchedule({
  inbox,
  settings,
  events,
  everyMs = 2 * 60_000,
  onError,
}: InboxScheduleOptions): InboxSchedule {
  let known: Record<InboxTool, string | null> | undefined;

  function sync(): void {
    inbox.sync().catch((error: unknown) => onError?.(error));
  }

  /** Compares the saved connections with the last ones seen: a new account syncs, a gone one is forgotten. */
  async function connectionsChanged(): Promise<void> {
    const now = accounts(await settings.read());
    const before = known;
    known = now;
    if (before === undefined) return;
    let connected = false;
    for (const tool of tools) {
      if (now[tool] === before[tool]) continue;
      if (now[tool] === null) inbox.forget(tool);
      else connected = true;
    }
    if (connected) inbox.syncAfterChange().catch((error: unknown) => onError?.(error));
  }

  // One comparison at a time, in the order the changes came, so a late read can't undo a newer one.
  let checking = connectionsChanged().catch((error: unknown) => onError?.(error));
  sync();

  const timer = setInterval(() => {
    if (events.pageCount() > 0) sync();
  }, everyMs);
  timer.unref();

  const unsubscribe = events.subscribe((event) => {
    if (event.type !== 'status.changed') return;
    checking = checking.then(connectionsChanged).catch((error: unknown) => onError?.(error));
  });

  return {
    stop() {
      clearInterval(timer);
      unsubscribe();
    },
  };
}
