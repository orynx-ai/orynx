import { syncActivityLimits, type SyncChange } from '@devhub/contracts';
import { DiscordMessageRecordSchema, type DiscordMessageRecord } from '../integrations/discord/map.ts';
import { PullRequestRecordSchema, type PullRequestRecord } from '../integrations/github/map.ts';
import { JiraIssueRecordSchema, type JiraIssueRecord } from '../integrations/jira/map.ts';
import { SlackMessageRecordSchema, type SlackMessageRecord } from '../integrations/slack/map.ts';
import type { InboxTool } from './inbox-cache.ts';

/** An item as a change shows it, and what of it counts as changing. */
interface Item {
  id: string;
  change: Omit<SyncChange, 'kind'>;
  /** Only what the inbox shows, so a timestamp that moves on its own never reads as an update. */
  shown: string;
}

function jiraItem(record: JiraIssueRecord): Item {
  const { key, summary, status, category, highPriorityBug, dueDate, url } = record;
  return {
    id: key,
    change: { ref: key, title: summary, url },
    shown: JSON.stringify([summary, status, category, highPriorityBug, dueDate]),
  };
}

function githubItem(record: PullRequestRecord): Item {
  const { id, repository, number, title, url, reviewRequestedAt, checksFailedAt, unresolved } = record;
  return {
    id,
    change: { ref: `${repository} #${String(number)}`, title, url },
    shown: JSON.stringify([title, reviewRequestedAt, checksFailedAt, unresolved?.count ?? 0]),
  };
}

/** A message waiting on you (spec 016): "Neha K. in #web-platform", its first line, and its link. */
function messageItem(record: SlackMessageRecord | DiscordMessageRecord): Item {
  const { id, from, channel, title, url } = record;
  return {
    id,
    change: { ref: channel === null ? from : `${from} in #${channel}`, title, url },
    shown: JSON.stringify([title]),
  };
}

const readers: Record<InboxTool, (record: unknown) => Item | null> = {
  jira: (record) => {
    const parsed = JiraIssueRecordSchema.safeParse(record);
    return parsed.success ? { ...jiraItem(parsed.data), id: parsed.data.key } : null;
  },
  github: (record) => {
    const parsed = PullRequestRecordSchema.safeParse(record);
    return parsed.success ? githubItem(parsed.data) : null;
  },
  slack: (record) => {
    const parsed = SlackMessageRecordSchema.safeParse(record);
    return parsed.success ? messageItem(parsed.data) : null;
  },
  discord: (record) => {
    const parsed = DiscordMessageRecordSchema.safeParse(record);
    return parsed.success ? messageItem(parsed.data) : null;
  },
};

/** Records that still read as the tool's schema says; one from an older shape is left out. */
function items(tool: InboxTool, records: readonly unknown[]): Map<string, Item> {
  const found = new Map<string, Item>();
  for (const record of records) {
    const item = readers[tool](record);
    if (item !== null) found.set(item.id, item);
  }
  return found;
}

/**
 * What one tool's sync changed (spec 035): new items first, then updated, then removed, the first 50 kept and the
 * rest counted. `before` is null when no sync of this account came before it, so everything is new.
 */
export function syncChanges(
  tool: InboxTool,
  before: readonly unknown[] | null,
  after: readonly unknown[],
): { changes: SyncChange[]; moreChanges: number } {
  const was = items(tool, before ?? []);
  const now = items(tool, after);
  const all: SyncChange[] = [
    ...[...now.values()].filter((item) => !was.has(item.id)).map((item) => ({ kind: 'new' as const, ...item.change })),
    ...[...now.values()]
      .filter((item) => was.has(item.id) && was.get(item.id)?.shown !== item.shown)
      .map((item) => ({ kind: 'updated' as const, ...item.change })),
    ...[...was.values()]
      .filter((item) => !now.has(item.id))
      .map((item) => ({ kind: 'removed' as const, ...item.change })),
  ];
  const kept = syncActivityLimits.changesKept;
  return { changes: all.slice(0, kept), moreChanges: Math.max(0, all.length - kept) };
}
