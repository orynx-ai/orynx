import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeSession, makeSessionApproval } from '@devhub/contracts/testing';
import { openFileSessionStore, sessionsFolder } from './file-session-store.ts';
import { listSessions, type StoredSession } from './session-store.ts';

let home: string;
const now = () => Date.parse('2026-10-18T12:00:00.000Z');

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'devhub-sessions-'));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function record(overrides: Partial<StoredSession['session']> = {}, id = '0123456789abcdef'): StoredSession {
  return {
    session: makeSession({ id, ...overrides }),
    repository: { id: '00000000000000aa', path: '/Users/you/code/web-app' },
    worktree: join(home, 'worktrees', id),
    startCommit: null,
    claudeSessionId: null,
    approvalLog: [],
  };
}

const mode = async (path: string) => (await stat(path)).mode & 0o777;

describe('the file session store', () => {
  it('AC-1: keeps a new session in <DEVHUB_HOME>/sessions/<id>/session.json, only you can read', async () => {
    const store = await openFileSessionStore(home, { now });
    await store.create(record());

    const folder = join(sessionsFolder(home), '0123456789abcdef');
    expect(await mode(sessionsFolder(home))).toBe(0o700);
    expect(await mode(folder)).toBe(0o700);
    expect(await mode(join(folder, 'session.json'))).toBe(0o600);
    expect(JSON.parse(await readFile(join(folder, 'session.json'), 'utf8'))).toEqual(record());
    expect(await store.get('0123456789abcdef')).toEqual(record());
  });

  it('AC-3: saves the brief as brief.md beside it', async () => {
    const store = await openFileSessionStore(home, { now });
    await store.create(record());
    await store.writeBrief('0123456789abcdef', 'Jira ticket PROJ-1423 (Story): Add bulk archive\n\nNo description.');
    const brief = join(sessionsFolder(home), '0123456789abcdef', 'brief.md');
    expect(await readFile(brief, 'utf8')).toBe('Jira ticket PROJ-1423 (Story): Add bulk archive\n\nNo description.');
    expect(await mode(brief)).toBe(0o600);
  });

  it('AC-4: applies one session’s changes in order, even when they come at once, and leaves no half-written file', async () => {
    const store = await openFileSessionStore(home, { now });
    // Done, so reopening the store below doesn't add the step a restart adds to a Working session.
    await store.create(record({ state: 'done', activities: [] }));

    await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map((file) =>
        store.update('0123456789abcdef', (current) => ({
          ...current,
          session: {
            ...current.session,
            activities: [...current.session.activities, { id: file, state: 'done', kind: 'explore', files: [file] }],
          },
        })),
      ),
    );

    const saved = await openFileSessionStore(home, { now });
    expect((await saved.get('0123456789abcdef'))?.session.activities.map((activity) => activity.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
    expect(await readdir(join(sessionsFolder(home), '0123456789abcdef'))).toEqual(['session.json']);
  });

  it('answers null for a session it doesn’t have, and never reads outside its folder', async () => {
    const store = await openFileSessionStore(home, { now });
    expect(await store.get('fedcba9876543210')).toBeNull();
    expect(await store.get('../../etc')).toBeNull();
    expect(await store.update('fedcba9876543210', (current) => current)).toBeNull();
  });

  it('AC-1: lists every session’s summary', async () => {
    const store = await openFileSessionStore(home, { now });
    await store.create(record({ title: 'One' }, '0000000000000001'));
    await store.create(record({ title: 'Two' }, '0000000000000002'));
    expect((await store.list()).map((session) => session.title).sort()).toEqual(['One', 'Two']);
  });

  it('AC-14: turns a session that was Working when Orynx stopped into Stopped, with the step that says so', async () => {
    const first = await openFileSessionStore(home, { now });
    await first.create(
      record({
        state: 'working',
        step: 'build',
        activities: [{ id: 'step-1', state: 'running', kind: 'edit', files: ['src/a.ts'] }],
      }),
    );
    await first.create(record({ state: 'done', endedAt: '2026-10-18T11:00:00.000Z' }, '0000000000000002'));

    const reopened = await openFileSessionStore(home, { now });

    const stopped = await reopened.get('0123456789abcdef');
    expect(stopped?.session).toMatchObject({
      state: 'stopped',
      step: 'build',
      endedAt: '2026-10-18T12:00:00.000Z',
      updatedAt: '2026-10-18T12:00:00.000Z',
      activities: [
        { id: 'step-1', state: 'done', kind: 'edit', files: ['src/a.ts'] },
        { id: 'step-2', state: 'done', kind: 'interrupted' },
      ],
    });
    expect((await reopened.get('0000000000000002'))?.session.state).toBe('done');
    // And it's on disk, so a second restart doesn't add the step again.
    const again = await openFileSessionStore(home, { now });
    expect((await again.get('0123456789abcdef'))?.session.activities).toHaveLength(2);
  });

  it('012 AC-21: a session waiting for you when Orynx stopped has its calls closed, unanswered, and their steps gone', async () => {
    const first = await openFileSessionStore(home, { now });
    const approval = makeSessionApproval({ id: 'approval-1', askedAt: '2026-10-18T11:59:00.000Z' });
    await first.create({
      ...record({
        state: 'needs_you',
        step: 'test',
        approvals: [approval],
        activities: [
          { id: 'step-1', state: 'done', kind: 'edit', files: ['src/a.ts'] },
          {
            id: 'step-2',
            state: 'running',
            kind: 'waiting',
            approvalId: 'approval-1',
            about: 'command',
            text: 'Run the content list tests',
          },
        ],
      }),
      approvalLog: [
        {
          id: 'approval-1',
          about: 'command',
          text: 'npm test -- content-list',
          askedAt: '2026-10-18T11:59:00.000Z',
          answer: null,
          by: null,
          answeredAt: null,
        },
      ],
    });

    const reopened = await openFileSessionStore(home, { now });

    const stopped = await reopened.get('0123456789abcdef');
    expect(stopped?.session).toMatchObject({
      state: 'stopped',
      approvals: [],
      activities: [
        { id: 'step-1', state: 'done', kind: 'edit', files: ['src/a.ts'] },
        { id: 'step-2', state: 'done', kind: 'interrupted' },
      ],
    });
    expect(stopped?.approvalLog).toEqual([
      {
        id: 'approval-1',
        about: 'command',
        text: 'npm test -- content-list',
        askedAt: '2026-10-18T11:59:00.000Z',
        answer: null,
        by: 'closed',
        answeredAt: '2026-10-18T12:00:00.000Z',
      },
    ]);
  });

  it('012: reads a session saved before approvals existed, as having none', async () => {
    const folder = join(sessionsFolder(home), '0123456789abcdef');
    await mkdir(folder, { recursive: true });
    const { approvalLog: _log, session, ...older } = record({ state: 'done' });
    const { approvals: _approvals, ...olderSession } = session;
    await writeFile(join(folder, 'session.json'), JSON.stringify({ ...older, session: olderSession }));

    const store = await openFileSessionStore(home, { now });

    const read = await store.get('0123456789abcdef');
    expect(read?.session.approvals).toEqual([]);
    expect(read?.approvalLog).toEqual([]);
  });

  it('013: reads a session saved by spec 012, with its working time from when it started to when it ended', async () => {
    const folder = join(sessionsFolder(home), '0123456789abcdef');
    await mkdir(folder, { recursive: true });
    const {
      startCommit: _commit,
      session,
      ...older
    } = record({
      state: 'done',
      startedAt: '2026-10-16T09:56:00.000Z',
      endedAt: '2026-10-16T10:00:12.000Z',
    });
    const { ticket: _t, followUp: _f, worktreePath: _w, workedMs: _m, runStartedAt: _r, ...olderSession } = session;
    await writeFile(join(folder, 'session.json'), JSON.stringify({ ...older, session: olderSession }));

    const read = await (await openFileSessionStore(home, { now })).get('0123456789abcdef');
    expect(read?.session).toMatchObject({
      ticket: null,
      followUp: { kind: 'open' },
      worktreePath: null,
      workedMs: 252_000,
      runStartedAt: null,
    });
    expect(read?.startCommit).toBeNull();
  });

  it('013 AC-9: reads a session’s brief back, and nothing for one it has none for', async () => {
    const store = await openFileSessionStore(home, { now });
    await store.create(record());
    expect(await store.readBrief('0123456789abcdef')).toBeNull();
    await store.writeBrief('0123456789abcdef', 'Jira ticket PROJ-1423 (Story): Add bulk archive\n\nNo description.');
    expect(await store.readBrief('0123456789abcdef')).toBe(
      'Jira ticket PROJ-1423 (Story): Add bulk archive\n\nNo description.',
    );
    expect(await store.readBrief('../../etc')).toBeNull();
  });

  it('skips a session it can’t read, and anything that isn’t a session’s folder', async () => {
    const store = await openFileSessionStore(home, { now });
    await store.create(record());
    await mkdir(join(sessionsFolder(home), 'fedcba9876543210'), { recursive: true });
    await writeFile(join(sessionsFolder(home), 'fedcba9876543210', 'session.json'), '{ not json');
    await mkdir(join(sessionsFolder(home), 'not-a-session'), { recursive: true });
    await writeFile(join(sessionsFolder(home), 'stray.txt'), 'x');

    const reopened = await openFileSessionStore(home, { now });
    expect((await reopened.list()).map((session) => session.id)).toEqual(['0123456789abcdef']);
  });

  it('starts empty when there is no sessions folder yet', async () => {
    expect(await (await openFileSessionStore(join(home, 'fresh'), { now })).list()).toEqual([]);
  });
});

describe('listSessions', () => {
  it('AC-10: leaves out sessions discarded more than 7 days ago when asked for recent ones', async () => {
    const store = await openFileSessionStore(home, { now });
    await store.create(record({ title: 'Working' }, '0000000000000001'));
    await store.create(
      record(
        { title: 'Discarded 6 days ago', state: 'stopped', discardedAt: '2026-10-12T12:00:00.000Z' },
        '0000000000000002',
      ),
    );
    await store.create(
      record(
        { title: 'Discarded 8 days ago', state: 'stopped', discardedAt: '2026-10-10T11:59:00.000Z' },
        '0000000000000003',
      ),
    );

    const recent = await listSessions(store, { recent: true, now });
    expect(recent.map((session) => session.title).sort()).toEqual(['Discarded 6 days ago', 'Working']);
    expect(await listSessions(store, { now })).toHaveLength(3);
  });

  it('AC-1: answers summaries only, newest first', async () => {
    const store = await openFileSessionStore(home, { now });
    await store.create(record({ title: 'Older', updatedAt: '2026-10-18T10:00:00.000Z' }, '0000000000000001'));
    await store.create(record({ title: 'Newer', updatedAt: '2026-10-18T11:00:00.000Z' }, '0000000000000002'));
    const listed = await listSessions(store, { limit: 1, now });
    expect(listed).toEqual([
      {
        id: '0000000000000002',
        title: 'Newer',
        state: 'working',
        source: { kind: 'jira', key: 'PROJ-1423' },
        updatedAt: '2026-10-18T11:00:00.000Z',
      },
    ]);
  });
});
