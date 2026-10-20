import { describe, expect, it } from 'vitest';
import {
  apiRoutes,
  InboxRefreshQuerySchema,
  SyncActivityQuerySchema,
  SyncActivitySchema,
  SyncRunSchema,
} from './index.ts';
import { makeSyncActivity, makeSyncChange, makeSyncRun, makeSyncTool } from './testing.ts';

describe('sync activity (spec 035)', () => {
  it('AC-32: a run carries when it started, how long it took, its problem and what changed', () => {
    const run = makeSyncRun({
      tool: 'jira',
      problem: { kind: 'rejected' },
      changes: [makeSyncChange({ kind: 'removed', ref: 'PROJ-1', url: 'https://acme.atlassian.net/browse/PROJ-1' })],
      moreChanges: 3,
    });
    expect(SyncRunSchema.parse(run)).toEqual(run);
    expect(SyncActivitySchema.parse(makeSyncActivity({ tools: [makeSyncTool()], runs: [run] })).runs).toEqual([run]);
  });

  it('AC-16: a run keeps at most 50 changes and counts the rest', () => {
    const changes = Array.from({ length: 51 }, () => makeSyncChange());
    expect(SyncRunSchema.safeParse(makeSyncRun({ changes: changes.slice(0, 50) })).success).toBe(true);
    expect(SyncRunSchema.safeParse({ ...makeSyncRun(), changes }).success).toBe(false);
  });

  it('AC-37: a change links to a Jira site or github.com only', () => {
    const elsewhere = { ...makeSyncRun(), changes: [{ ...makeSyncChange(), url: 'https://example.com/x' }] };
    expect(SyncRunSchema.safeParse(elsewhere).success).toBe(false);
  });

  it('AC-18: the query picks a tool and failed runs only, and defaults to every run of every tool', () => {
    expect(SyncActivityQuerySchema.parse({})).toEqual({ show: 'all' });
    expect(SyncActivityQuerySchema.parse({ tool: 'github', show: 'failed' })).toEqual({
      tool: 'github',
      show: 'failed',
    });
    expect(SyncActivityQuerySchema.safeParse({ tool: 'slack' }).success).toBe(false);
  });

  it('AC-20: Refresh can name one tool', () => {
    expect(InboxRefreshQuerySchema.parse({})).toEqual({});
    expect(InboxRefreshQuerySchema.parse({ tool: 'jira' })).toEqual({ tool: 'jira' });
    expect(apiRoutes.syncActivity).toBe('/api/sync-activity');
  });
});
