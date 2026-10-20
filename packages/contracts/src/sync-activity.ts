import { z } from 'zod';
import { GitHubLinkSchema } from './github.ts';
import { InboxProblemSchema, InboxSourceSchema, InboxToolStateSchema } from './inbox.ts';
import { JiraLinkSchema } from './jira.ts';

/** How much of the sync log Orynx keeps and shows (spec 035). */
export const syncActivityLimits = {
  /** Runs one answer holds, newest first. */
  shown: 100,
  /** Changes one run keeps; the rest are only counted. */
  changesKept: 50,
  keptDays: 30,
  /** How often the inbox syncs while a page is open. */
  everyMinutes: 2,
};

/** One item a sync found new, changed or gone. */
export const SyncChangeSchema = z.object({
  kind: z.enum(['new', 'updated', 'removed']),
  /** The ticket's key, or the pull request's repository and number: "PROJ-1431", "web-app #482". */
  ref: z.string().min(1),
  title: z.string().min(1),
  url: z.union([JiraLinkSchema, GitHubLinkSchema]),
});
export type SyncChange = z.infer<typeof SyncChangeSchema>;

/** One tool's part of one sync, as the log keeps it. */
export const SyncRunSchema = z.object({
  id: z.string().min(1),
  tool: InboxSourceSchema,
  startedAt: z.iso.datetime(),
  tookMs: z.int().nonnegative(),
  /** Why it failed; null when it worked. */
  problem: InboxProblemSchema.nullable(),
  changes: z.array(SyncChangeSchema).max(syncActivityLimits.changesKept),
  /** Changes past the kept ones. */
  moreChanges: z.int().nonnegative(),
});
export type SyncRun = z.infer<typeof SyncRunSchema>;

/** Where one tool stands, with the figures the modal's stats show. */
export const SyncToolSchema = z.object({
  tool: InboxSourceSchema,
  state: InboxToolStateSchema,
  /** When its last sync started, worked or not. */
  lastSyncAt: z.iso.datetime().nullable(),
  lastGoodSyncAt: z.iso.datetime().nullable(),
  /** When the failures since its last good sync began; null when its last sync worked. */
  failingSince: z.iso.datetime().nullable(),
  failedInARow: z.int().nonnegative(),
  /** Changes its syncs found since local midnight. */
  changesToday: z.int().nonnegative(),
  lastTwoHours: z.object({ worked: z.int().nonnegative(), total: z.int().nonnegative() }),
});
export type SyncTool = z.infer<typeof SyncToolSchema>;

/** GET /api/sync-activity: every syncing tool, and the newest runs the query asked for. */
export const SyncActivitySchema = z.object({
  tools: z.array(SyncToolSchema),
  runs: z.array(SyncRunSchema).max(syncActivityLimits.shown),
});
export type SyncActivity = z.infer<typeof SyncActivitySchema>;

export const SyncActivityQuerySchema = z.object({
  /** One tool's runs; every tool's when left out. */
  tool: InboxSourceSchema.optional(),
  show: z.enum(['all', 'failed']).default('all'),
});
export type SyncActivityQuery = z.input<typeof SyncActivityQuerySchema>;
