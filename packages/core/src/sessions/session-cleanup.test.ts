import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Session } from '@devhub/contracts';
import { makeSession } from '@devhub/contracts/testing';
import { gitEnvironment } from '../agents/agent-environment.ts';
import { useTestRepositories } from '../test/git-repository.ts';
import { createBranchGit } from './branch-git.ts';
import { folderBytes, measureStorage, sessionsToClean } from './session-cleanup.ts';
import { StoredSessionSchema, type StoredSession } from './session-store.ts';
import { createWorktrees } from './worktrees.ts';

// Each test makes real repositories and worktrees with git, which can pass 5 seconds when every file runs at once.
vi.setConfig({ testTimeout: 20_000 });

const repositories = useTestRepositories();
const day = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-10-27T12:00:00.000Z');
const daysAgo = (days: number) => new Date(now - days * day).toISOString();

/** Real repositories, and a way to give each session a worktree of its own, as spec 011 and 031 make them. */
async function setUp() {
  const repos = await repositories();
  await repos.commitInOrigin('a.ts');
  const env = gitEnvironment(repos.env);
  const worktrees = createWorktrees({ env, root: repos.worktrees });
  const git = createBranchGit({ env });
  await repos.git(repos.clone, 'config', 'user.name', 'Test');
  await repos.git(repos.clone, 'config', 'user.email', 'test@example.com');
  let next = 0;

  /** A stored session whose worktree is on its own branch, unless it's your PR's (detached) or has none yet. */
  async function stored(
    session: Partial<Session>,
    worktree: 'own_branch' | 'pull_request' | 'no_branch' = 'own_branch',
  ): Promise<StoredSession> {
    next += 1;
    const id = `00000000000000${String(next).padStart(2, '0')}`;
    const path = join(repos.worktrees, id);
    if (worktree === 'pull_request') await repos.commitInOrigin(`pr-${id}.ts`, 'feat/mine');
    const made = await worktrees.make(
      repos.clone,
      path,
      worktree === 'pull_request'
        ? { branch: 'feat/mine', base: 'origin/feat/mine', remote: true, detach: true }
        : worktree === 'no_branch'
          ? { branch: `unused-${id}`, base: 'origin/main', remote: true, detach: true }
          : { branch: `feat/s-${id}`, base: 'origin/main', remote: true },
    );
    if (!made.ok) throw new Error('the worktree should be made');
    return StoredSessionSchema.parse({
      session: makeSession({
        id,
        state: 'done',
        updatedAt: daysAgo(40),
        pinnedAt: null,
        branch: worktree === 'own_branch' ? `feat/s-${id}` : worktree === 'pull_request' ? 'feat/mine' : null,
        workOn: worktree === 'pull_request' ? 'pull_request' : 'new_branch',
        ...session,
      }),
      repository: { id: '00000000000000aa', path: repos.clone },
      worktree: path,
      startCommit: made.startCommit,
      claudeSessionId: null,
    });
  }

  const commit = async (record: StoredSession, file: string) => {
    const worktree = record.worktree ?? '';
    await writeFile(join(worktree, file), `${file}\n`);
    await repos.git(worktree, 'add', file);
    await repos.git(worktree, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', file);
  };

  const ids = async (records: StoredSession[], days: 7 | 14 | 30 | 90) =>
    (await sessionsToClean(records, days, now, git)).map((record) => record.session.id);

  return { repos, stored, commit, ids, git };
}

describe('which sessions a cleanup run deletes (spec 047, D)', () => {
  it('AC-17: Done, Stopped, PR merged and PR closed sessions older than the choice, by their last update', async () => {
    const { stored, ids } = await setUp();
    const done = await stored({ state: 'done' });
    const stopped = await stored({ state: 'stopped' });
    const merged = await stored({ state: 'pr_merged' });
    const closed = await stored({ state: 'pr_closed' });
    const recent = await stored({ state: 'done', updatedAt: daysAgo(20) });
    const records = [done, stopped, merged, closed, recent];

    expect(await ids(records, 30)).toEqual([done, stopped, merged, closed].map((record) => record.session.id));
    expect(await ids(records, 14)).toHaveLength(5);
    expect(await ids(records, 90)).toEqual([]);
  });

  it('AC-18: never a working, waiting, pinned or PR open session, however old', async () => {
    const { stored, ids } = await setUp();
    const records = [
      await stored({ state: 'working' }),
      await stored({ state: 'needs_you' }),
      await stored({ state: 'pr_open' }),
      await stored({ state: 'done', pinnedAt: daysAgo(50) }),
    ];
    expect(await ids(records, 7)).toEqual([]);
  });

  it('AC-18: keeps one with uncommitted work; commits never pushed are safe on a branch of its own (Q4)', async () => {
    const { stored, commit, ids } = await setUp();
    const changed = await stored({});
    await writeFile(join(changed.worktree ?? '', 'notes.md'), 'mine\n');
    const committed = await stored({});
    await commit(committed, 'b.ts');

    expect(await ids([changed, committed], 30)).toEqual([committed.session.id]);
  });

  it('AC-18: a detached worktree on your PR goes only once origin has its HEAD; one with no branch only unchanged', async () => {
    const { repos, stored, commit, ids } = await setUp();
    const onOrigin = await stored({}, 'pull_request');
    const ahead = await stored({}, 'pull_request');
    await commit(ahead, 'mine.ts');
    const untouched = await stored({}, 'no_branch');
    const branchless = await stored({}, 'no_branch');
    await commit(branchless, 'lost.ts');

    expect(await ids([onOrigin, ahead, untouched, branchless], 30)).toEqual([
      onOrigin.session.id,
      untouched.session.id,
    ]);
    // Pushed, its HEAD is on origin, so nothing would be lost.
    await repos.git(ahead.worktree ?? '', 'push', '-q', 'origin', 'HEAD:refs/heads/feat/mine');
    await repos.git(ahead.worktree ?? '', 'fetch', '-q', 'origin');
    expect(await ids([ahead], 30)).toEqual([ahead.session.id]);
  });

  it('AC-18: a session whose worktree is already gone has nothing to lose; one with none at all goes too', async () => {
    const { stored, ids } = await setUp();
    const gone = { ...(await stored({})), worktree: '/nowhere/0000000000000099' };
    const never = { ...(await stored({})), worktree: null };
    expect(await ids([gone, never], 30)).toEqual([gone.session.id, never.session.id]);
  });
});

describe("a folder's size (spec 047, D)", () => {
  it('adds up the files inside it, never following a link; a missing folder is 0', async () => {
    const { repos } = await setUp();
    const folder = join(repos.worktrees, 'measured');
    await mkdir(join(folder, 'deep', 'er'), { recursive: true });
    await writeFile(join(folder, 'a.txt'), 'x'.repeat(1000));
    await writeFile(join(folder, 'deep', 'er', 'b.txt'), 'y'.repeat(234));
    // A link to the whole clone would count it twice, or forever.
    await symlink(repos.clone, join(folder, 'clone'));

    expect(await folderBytes(folder)).toBe(1234);
    expect(await folderBytes(join(repos.worktrees, 'missing'))).toBe(0);
  });
});

describe('what Settings › Coding agent › Storage shows (spec 047, D)', () => {
  it("AC-16, AC-17: every worktree's size, and for each choice the sessions it would delete now and their size", async () => {
    const { repos, stored, git } = await setUp();
    const month = await stored({ updatedAt: daysAgo(40) });
    const fortnight = await stored({ updatedAt: daysAgo(20) });
    const kept = await stored({ updatedAt: daysAgo(40), pinnedAt: daysAgo(40) });
    const size = async (record: StoredSession) => folderBytes(record.worktree ?? '');

    const storage = await measureStorage([month, fortnight, kept], repos.worktrees, now, git);

    expect(storage.bytes).toBe((await size(month)) + (await size(fortnight)) + (await size(kept)));
    expect(storage.choices).toEqual([
      { days: 7, sessions: 2, bytes: (await size(month)) + (await size(fortnight)) },
      { days: 14, sessions: 2, bytes: (await size(month)) + (await size(fortnight)) },
      { days: 30, sessions: 1, bytes: await size(month) },
      { days: 90, sessions: 0, bytes: 0 },
    ]);
  });

  it('AC-16: is nothing at all before any session has a worktree', async () => {
    const { repos, git } = await setUp();
    expect(await measureStorage([], join(repos.worktrees, 'none-yet'), now, git)).toEqual({
      bytes: 0,
      choices: [
        { days: 7, sessions: 0, bytes: 0 },
        { days: 14, sessions: 0, bytes: 0 },
        { days: 30, sessions: 0, bytes: 0 },
        { days: 90, sessions: 0, bytes: 0 },
      ],
    });
  });
});
