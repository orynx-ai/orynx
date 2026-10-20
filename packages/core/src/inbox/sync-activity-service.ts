import type { z } from 'zod';
import {
  syncActivityLimits,
  SyncRunSchema,
  type Inbox,
  type SyncActivity,
  type SyncActivityQuerySchema,
} from '@devhub/contracts';
import type { InboxCache, InboxTool } from './inbox-cache.ts';

/** The sync log behind the Sync activity modal (spec 035). Reading it asks no tool. */
export interface SyncActivityService {
  read(query: z.output<typeof SyncActivityQuerySchema>): Promise<SyncActivity>;
}

export interface SyncActivityServiceOptions {
  cache: InboxCache;
  /** Where each tool stands, as Home's lines say it. */
  states: () => Promise<Inbox['tools']>;
  /** The clock, in milliseconds. */
  now?: () => number;
}

const tools = ['jira', 'github'] as const satisfies readonly InboxTool[];

export function createSyncActivityService({
  cache,
  states,
  now = Date.now,
}: SyncActivityServiceOptions): SyncActivityService {
  return {
    async read({ tool, show }) {
      const state = await states();
      const at = now();
      // "Today" is the computer's own day: the server and the page run on the same one.
      const midnight = new Date(at);
      midnight.setHours(0, 0, 0, 0);
      const since = { today: midnight.toISOString(), twoHours: new Date(at - 2 * 3_600_000).toISOString() };
      const runs = cache.syncRuns({
        ...(tool === undefined ? {} : { tool }),
        failedOnly: show === 'failed',
        limit: syncActivityLimits.shown,
      });
      return {
        tools: tools.map((each) => ({ tool: each, state: state[each], ...cache.syncFigures(each, since) })),
        // A run from an older shape is left out rather than failing the whole log.
        runs: runs.flatMap(({ data, ...run }) => {
          const parsed = SyncRunSchema.safeParse({ ...run, ...(typeof data === 'object' ? data : {}) });
          return parsed.success ? [parsed.data] : [];
        }),
      };
    },
  };
}
