import { createServer, type Server } from 'node:net';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gitEnvironment } from '../agents/agent-environment.ts';
import { useTestRepositories } from '../test/git-repository.ts';
import { createWorktrees } from './worktrees.ts';

// Each test makes real repositories with git; with every test file running at once that can pass 5 seconds.
vi.setConfig({ testTimeout: 15_000 });

const repositories = useTestRepositories();

async function setUp() {
  const repos = await repositories();
  const worktrees = createWorktrees({ env: gitEnvironment(repos.env), root: repos.worktrees, fetchTimeoutMs: 2_000 });
  return { repos, worktrees };
}

const plan = { branch: 'feat/PROJ-1423', base: 'origin/main', remote: true } as const;

/** A local server that accepts a connection and never answers, like a remote waiting for a password. */
async function silentOrigin(): Promise<{ url: string; server: Server }> {
  const server = createServer(() => {
    // Says nothing.
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return { url: `http://127.0.0.1:${String(port)}/web-app.git`, server };
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

describe('preparing a worktree', () => {
  it('AC-2 (Q1): starts from the branch origin/HEAD points at, and names the branch after the ticket', async () => {
    const { repos, worktrees } = await setUp();
    expect(await worktrees.prepare(repos.clone, 'PROJ-1423')).toEqual({
      ok: true,
      plan: { branch: 'feat/PROJ-1423', base: 'origin/main', remote: true },
    });
  });

  it('AC-2 (Q1): with no remote, starts from the checked-out branch, and fetches nothing', async () => {
    const { repos, worktrees } = await setUp();
    await repos.git(repos.clone, 'remote', 'remove', 'origin');
    await repos.git(repos.clone, 'checkout', '-b', 'develop');
    expect(await worktrees.prepare(repos.clone, 'PROJ-1423')).toEqual({
      ok: true,
      plan: { branch: 'feat/PROJ-1423', base: 'develop', remote: false },
    });
  });

  it('AC-2 (Q2): takes the first free name, never one a branch here or on origin already has', async () => {
    const { repos, worktrees } = await setUp();
    await repos.git(repos.clone, 'branch', 'feat/PROJ-1423');
    await repos.git(repos.clone, 'push', 'origin', 'HEAD:refs/heads/feat/PROJ-1423-2');
    await repos.git(repos.clone, 'fetch', 'origin');
    expect(await worktrees.prepare(repos.clone, 'PROJ-1423')).toMatchObject({
      ok: true,
      plan: { branch: 'feat/PROJ-1423-3' },
    });
  });

  it('AC-13: says a folder that is gone or not a git repository is the folder’s problem', async () => {
    const { repos, worktrees } = await setUp();
    expect(await worktrees.prepare(join(repos.root, 'gone'), 'PROJ-1423')).toEqual({
      ok: false,
      problem: { kind: 'folder' },
    });
    const plain = join(repos.root, 'plain');
    await mkdir(plain);
    expect(await worktrees.prepare(plain, 'PROJ-1423')).toEqual({ ok: false, problem: { kind: 'folder' } });
  });
});

describe('making a worktree', () => {
  it('013 AC-4: says the commit the new branch starts from, which the Changes tab compares with', async () => {
    const { repos, worktrees } = await setUp();
    const newest = await repos.commitInOrigin('newer.txt');
    const made = await worktrees.make(repos.clone, join(repos.worktrees, '0123456789abcdef'), plan);
    expect(made.ok && made.startCommit).toBe(newest);
    expect(newest).toMatch(/^[0-9a-f]{40}$/);
  });

  it('AC-2: fetches the default branch first, then makes the branch from it in a new worktree', async () => {
    const { repos, worktrees } = await setUp();
    const newest = await repos.commitInOrigin('newer.txt');
    const path = join(repos.worktrees, '0123456789abcdef');

    const made = await worktrees.make(repos.clone, path, {
      branch: 'feat/PROJ-1423',
      base: 'origin/main',
      remote: true,
    });

    expect(made).toEqual({ ok: true, fetched: true, startCommit: newest });
    expect(await repos.git(path, 'rev-parse', 'HEAD')).toBe(newest);
    expect(await repos.git(path, 'branch', '--show-current')).toBe('feat/PROJ-1423');
    expect(await exists(join(path, 'newer.txt'))).toBe(true);
  });

  it('AC-2: leaves the folder’s own checkout as it was: its branch, files and uncommitted changes', async () => {
    const { repos, worktrees } = await setUp();
    await writeFile(join(repos.clone, 'README.md'), '# changed, not committed\n');
    await writeFile(join(repos.clone, 'scratch.txt'), 'untracked\n');
    const before = await repos.git(repos.clone, 'status', '--porcelain=v1', '--branch');

    await worktrees.make(repos.clone, join(repos.worktrees, '0123456789abcdef'), {
      branch: 'feat/PROJ-1423',
      base: 'origin/main',
      remote: true,
    });

    expect(await repos.git(repos.clone, 'status', '--porcelain=v1', '--branch')).toBe(before);
    expect(await readFile(join(repos.clone, 'README.md'), 'utf8')).toBe('# changed, not committed\n');
  });

  it('AC-2: doesn’t make the new branch track the default branch, so a push can never land on main', async () => {
    const { repos, worktrees } = await setUp();
    const path = join(repos.worktrees, '0123456789abcdef');
    await worktrees.make(repos.clone, path, { branch: 'feat/PROJ-1423', base: 'origin/main', remote: true });
    await expect(repos.git(path, 'rev-parse', '--abbrev-ref', '@{upstream}')).rejects.toThrow();
  });

  it('AC-2: runs none of the repository’s hooks', async () => {
    const { repos, worktrees } = await setUp();
    const marker = join(repos.root, 'hook-ran');
    const hook = join(repos.clone, '.git', 'hooks', 'post-checkout');
    await writeFile(hook, `#!/bin/sh\ntouch "${marker}"\n`, { mode: 0o755 });

    await worktrees.make(repos.clone, join(repos.worktrees, '0123456789abcdef'), {
      branch: 'feat/PROJ-1423',
      base: 'origin/main',
      remote: true,
    });

    expect(await exists(marker)).toBe(false);
  });

  it('AC-2 (Q1a): uses the last fetched default branch when origin can’t be reached', async () => {
    const { repos, worktrees } = await setUp();
    const known = await repos.git(repos.clone, 'rev-parse', 'origin/main');
    await repos.git(repos.clone, 'remote', 'set-url', 'origin', join(repos.root, 'nowhere.git'));
    const path = join(repos.worktrees, '0123456789abcdef');

    expect(
      await worktrees.make(repos.clone, path, { branch: 'feat/PROJ-1423', base: 'origin/main', remote: true }),
    ).toEqual({ ok: true, fetched: false, startCommit: known });
    expect(await repos.git(path, 'rev-parse', 'HEAD')).toBe(known);
  });

  describe('with an origin that never answers', () => {
    let silent: Server | undefined;
    afterEach(() => {
      silent?.close();
    });

    it('AC-2 (Q1a): gives up on the fetch after its time limit and never waits for a password', async () => {
      const { repos } = await setUp();
      const origin = await silentOrigin();
      silent = origin.server;
      await repos.git(repos.clone, 'remote', 'set-url', 'origin', origin.url);
      const worktrees = createWorktrees({ env: gitEnvironment(repos.env), root: repos.worktrees, fetchTimeoutMs: 300 });

      const started = Date.now();
      const made = await worktrees.make(repos.clone, join(repos.worktrees, '0123456789abcdef'), {
        branch: 'feat/PROJ-1423',
        base: 'origin/main',
        remote: true,
      });

      expect(made).toMatchObject({ ok: true, fetched: false });
      expect(Date.now() - started).toBeLessThan(5_000);
    });
  });

  it('AC-2: makes the branch from the local branch when there is no remote', async () => {
    const { repos, worktrees } = await setUp();
    await repos.git(repos.clone, 'remote', 'remove', 'origin');
    const path = join(repos.worktrees, '0123456789abcdef');
    const main = await repos.git(repos.clone, 'rev-parse', 'main');
    expect(await worktrees.make(repos.clone, path, { branch: 'feat/PROJ-1423', base: 'main', remote: false })).toEqual({
      ok: true,
      fetched: false,
      startCommit: main,
    });
    expect(await repos.git(path, 'rev-parse', 'HEAD')).toBe(main);
  });

  it('AC-13: says git couldn’t make the worktree, without git’s own words', async () => {
    const { repos, worktrees } = await setUp();
    const path = join(repos.worktrees, '0123456789abcdef');
    await mkdir(path);
    await writeFile(join(path, 'in-the-way.txt'), 'x');
    expect(
      await worktrees.make(repos.clone, path, { branch: 'feat/PROJ-1423', base: 'origin/main', remote: true }),
    ).toEqual({ ok: false, problem: { kind: 'git', step: 'add' } });
  });
});

describe('Stop while the worktree is being made', () => {
  let silent: Server | undefined;
  afterEach(() => {
    silent?.close();
  });

  it('AC-9: stops a fetch that is still waiting, and makes nothing', async () => {
    const { repos } = await setUp();
    const origin = await silentOrigin();
    silent = origin.server;
    await repos.git(repos.clone, 'remote', 'set-url', 'origin', origin.url);
    const worktrees = createWorktrees({
      env: gitEnvironment(repos.env),
      root: repos.worktrees,
      fetchTimeoutMs: 10_000,
    });
    const stop = new AbortController();
    const path = join(repos.worktrees, '0123456789abcdef');

    const making = worktrees.make(repos.clone, path, plan, stop.signal);
    setTimeout(() => {
      stop.abort();
    }, 200);
    const started = Date.now();

    expect(await making).toEqual({ ok: false, problem: { kind: 'stopped' } });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(await exists(path)).toBe(false);
  });

  it('AC-9: starts nothing when Stop came first', async () => {
    const { repos, worktrees } = await setUp();
    const stop = new AbortController();
    stop.abort();
    expect(await worktrees.prepare(repos.clone, 'PROJ-1423', stop.signal)).toEqual({
      ok: false,
      problem: { kind: 'stopped' },
    });
    const path = join(repos.worktrees, '0123456789abcdef');
    expect(await worktrees.make(repos.clone, path, plan, stop.signal)).toEqual({
      ok: false,
      problem: { kind: 'stopped' },
    });
    expect(await exists(path)).toBe(false);
  });
});

describe('removing a worktree', () => {
  it('AC-10: deletes the worktree and its branch, with Claude’s uncommitted changes', async () => {
    const { repos, worktrees } = await setUp();
    const path = join(repos.worktrees, '0123456789abcdef');
    await worktrees.make(repos.clone, path, plan);
    await writeFile(join(path, 'claude-was-here.ts'), 'export {};\n');

    expect(await worktrees.remove(repos.clone, path, 'feat/PROJ-1423')).toEqual({ ok: true });
    expect(await exists(path)).toBe(false);
    expect(await repos.git(repos.clone, 'branch', '--list', 'feat/PROJ-1423')).toBe('');
    expect(await repos.git(repos.clone, 'worktree', 'list', '--porcelain')).not.toContain(path);
  });

  it('AC-10: carries on when you deleted the worktree yourself, and forgets it', async () => {
    const { repos, worktrees } = await setUp();
    const path = join(repos.worktrees, '0123456789abcdef');
    await worktrees.make(repos.clone, path, plan);
    await rm(path, { recursive: true, force: true });

    expect(await worktrees.remove(repos.clone, path, 'feat/PROJ-1423')).toEqual({ ok: true });
    expect(await repos.git(repos.clone, 'worktree', 'list', '--porcelain')).not.toContain(path);
    expect(await repos.git(repos.clone, 'branch', '--list', 'feat/PROJ-1423')).toBe('');
  });

  it('AC-10: carries on when the branch is already gone, or the worktree was never made', async () => {
    const { repos, worktrees } = await setUp();
    expect(await worktrees.remove(repos.clone, join(repos.worktrees, 'fedcba9876543210'), 'feat/PROJ-9')).toEqual({
      ok: true,
    });
  });

  it('AC-10: deletes the worktree folder when the repository itself is gone', async () => {
    const { repos, worktrees } = await setUp();
    const path = join(repos.worktrees, '0123456789abcdef');
    await worktrees.make(repos.clone, path, plan);
    await rm(repos.clone, { recursive: true, force: true });

    expect(await worktrees.remove(repos.clone, path, 'feat/PROJ-1423')).toEqual({ ok: true });
    expect(await exists(path)).toBe(false);
  });

  it('AC-10: never deletes a folder outside Orynx’s worktrees folder', async () => {
    const { repos, worktrees } = await setUp();
    const elsewhere = join(repos.root, 'not-a-worktree');
    await mkdir(elsewhere);
    await rm(repos.clone, { recursive: true, force: true });

    expect(await worktrees.remove(repos.clone, elsewhere, 'feat/PROJ-1423')).toEqual({
      ok: false,
      problem: { kind: 'git', step: 'remove' },
    });
    expect(await exists(elsewhere)).toBe(true);
  });

  it('AC-10: leaves the folder’s own checkout and its other branches alone', async () => {
    const { repos, worktrees } = await setUp();
    await repos.git(repos.clone, 'branch', 'mine');
    const path = join(repos.worktrees, '0123456789abcdef');
    await worktrees.make(repos.clone, path, plan);
    await worktrees.remove(repos.clone, path, 'feat/PROJ-1423');
    expect(await repos.git(repos.clone, 'branch', '--format=%(refname:short)')).toBe('main\nmine');
  });
});
