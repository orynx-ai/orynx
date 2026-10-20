import { describe, expect, it } from 'vitest';
import type { Inbox } from '@devhub/contracts';
import { openInboxCache } from './inbox-cache.ts';
import { createSyncActivityService } from './sync-activity-service.ts';

const now = Date.parse('2026-10-20T13:00:00.000Z');
const failing: Inbox['tools'] = {
  jira: { state: 'failed', problem: { kind: 'rejected' }, lastSyncedAt: '2026-10-20T12:00:00.000Z' },
  github: { state: 'not_connected' },
};
const keepAll = { after: '2026-01-01T00:00:00.000Z' };
const change = {
  kind: 'new',
  ref: 'PROJ-7',
  title: 'Rate-limit the export',
  url: 'https://acme.atlassian.net/browse/PROJ-7',
};

function setup(states: Inbox['tools'] = failing) {
  const cache = openInboxCache(':memory:');
  const log = (tool: 'jira' | 'github', startedAt: string, problem: unknown = null, changes: unknown[] = []) => {
    cache.logSync(
      {
        tool,
        startedAt,
        tookMs: 300,
        worked: problem === null,
        changed: changes.length,
        data: { problem, changes, moreChanges: 0 },
      },
      keepAll,
    );
  };
  const service = createSyncActivityService({ cache, states: () => Promise.resolve(states), now: () => now });
  return { cache, log, service };
}

describe('sync activity service (spec 035)', () => {
  it('AC-5, AC-9, AC-10: says where each tool stands, with its figures from the log', async () => {
    const { log, service } = setup();
    log('jira', '2026-10-18T12:00:00.000Z', null, [change]);
    log('jira', '2026-10-20T12:00:00.000Z', null, [change]);
    log('jira', '2026-10-20T12:42:00.000Z', { kind: 'rejected' });
    log('jira', '2026-10-20T12:47:00.000Z', { kind: 'rejected' });

    const { tools } = await service.read({ show: 'all' });

    expect(tools).toEqual([
      {
        tool: 'jira',
        state: failing.jira,
        lastSyncAt: '2026-10-20T12:47:00.000Z',
        lastGoodSyncAt: '2026-10-20T12:00:00.000Z',
        failingSince: '2026-10-20T12:42:00.000Z',
        failedInARow: 2,
        changesToday: 1,
        lastTwoHours: { worked: 1, total: 3 },
      },
      {
        tool: 'github',
        state: { state: 'not_connected' },
        lastSyncAt: null,
        lastGoodSyncAt: null,
        failingSince: null,
        failedInARow: 0,
        changesToday: 0,
        lastTwoHours: { worked: 0, total: 0 },
      },
    ]);
  });

  it('AC-17: holds every tool’s runs, newest first, with their changes', async () => {
    const { log, service } = setup();
    log('jira', '2026-10-20T12:00:00.000Z', null, [change]);
    log('github', '2026-10-20T12:30:00.000Z', { kind: 'no_answer' });

    const { runs } = await service.read({ show: 'all' });

    expect(runs).toEqual([
      {
        id: '2',
        tool: 'github',
        startedAt: '2026-10-20T12:30:00.000Z',
        tookMs: 300,
        problem: { kind: 'no_answer' },
        changes: [],
        moreChanges: 0,
      },
      {
        id: '1',
        tool: 'jira',
        startedAt: '2026-10-20T12:00:00.000Z',
        tookMs: 300,
        problem: null,
        changes: [change],
        moreChanges: 0,
      },
    ]);
  });

  it('AC-18: one tool’s runs, or its failed ones alone', async () => {
    const { log, service } = setup();
    log('jira', '2026-10-20T12:00:00.000Z');
    log('jira', '2026-10-20T12:10:00.000Z', { kind: 'rejected' });
    log('github', '2026-10-20T12:20:00.000Z');

    const ids = async (query: Parameters<typeof service.read>[0]) =>
      (await service.read(query)).runs.map((run) => run.id);

    expect(await ids({ tool: 'jira', show: 'all' })).toEqual(['2', '1']);
    expect(await ids({ show: 'failed' })).toEqual(['2']);
  });

  it('leaves out a run it can’t make sense of, rather than failing', async () => {
    const { cache, service } = setup();
    cache.logSync(
      {
        tool: 'jira',
        startedAt: '2026-10-20T12:00:00.000Z',
        tookMs: 1,
        worked: true,
        changed: 0,
        data: 'from a newer Orynx',
      },
      keepAll,
    );

    expect((await service.read({ show: 'all' })).runs).toEqual([]);
  });
});
