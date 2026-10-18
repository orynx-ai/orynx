import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { gitEnvironment } from '../agents/agent-environment.ts';
import { useTestRepositories } from '../test/git-repository.ts';
import { createBranchGit } from './branch-git.ts';
import { createWorktrees } from './worktrees.ts';

// Each test makes real repositories and a worktree with git, which can pass 5 seconds when every file runs at once.
vi.setConfig({ testTimeout: 20_000 });

const repositories = useTestRepositories();

/** A clone of a bare origin, and a session worktree on feat/PROJ-1423 made from it, as spec 011 makes one. */
async function setUp() {
  const repos = await repositories();
  await repos.commitInOrigin('a.ts');
  const worktree = join(repos.worktrees, '0123456789abcdef');
  const made = await createWorktrees({ env: gitEnvironment(repos.env), root: repos.worktrees }).make(
    repos.clone,
    worktree,
    { branch: 'feat/PROJ-1423', base: 'origin/main', remote: true },
  );
  if (!made.ok) throw new Error('the worktree should be made');
  const git = createBranchGit({ env: gitEnvironment(repos.env) });
  return { repos, worktree, startCommit: made.startCommit, git };
}

const hashOf = async (path: string) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

describe('which repository origin is (spec 014)', () => {
  it('AC-2: names the github.com repository origin points to, as configured', async () => {
    const { repos, worktree, git } = await setUp();
    await repos.git(repos.clone, 'remote', 'set-url', 'origin', 'git@github.com:acme/web-app.git');
    expect(await git.origin(worktree)).toEqual({ ok: true, repository: 'acme/web-app' });
  });

  it('AC-2: or as git expands it, for an address that is short for github.com', async () => {
    const { repos, worktree, git } = await setUp();
    await repos.git(repos.clone, 'config', 'url.git@github.com:.insteadOf', 'gh:');
    await repos.git(repos.clone, 'remote', 'set-url', 'origin', 'gh:acme/web-app.git');
    expect(await git.origin(worktree)).toEqual({ ok: true, repository: 'acme/web-app' });
  });

  it("AC-7: says when there's no origin, it isn't on github.com, or the worktree is gone", async () => {
    const { repos, worktree, git } = await setUp();
    // The test's origin is a folder on disk.
    expect(await git.origin(worktree)).toEqual({ ok: false, problem: 'not_github' });
    await repos.git(repos.clone, 'remote', 'set-url', 'origin', 'https://gitlab.com/acme/web-app.git');
    expect(await git.origin(worktree)).toEqual({ ok: false, problem: 'not_github' });
    await repos.git(repos.clone, 'remote', 'remove', 'origin');
    expect(await git.origin(worktree)).toEqual({ ok: false, problem: 'no_origin' });
    await rm(worktree, { recursive: true, force: true });
    expect(await git.origin(worktree)).toEqual({ ok: false, problem: 'missing' });
  });
});

describe('what the worktree holds (spec 014)', () => {
  it("AC-2: lists the files that aren't committed yet: changed and new, never ignored", async () => {
    const { worktree, git } = await setUp();
    await writeFile(join(worktree, 'README.md'), '# web-app\nchanged\n');
    await mkdir(join(worktree, 'src'));
    await writeFile(join(worktree, 'src', 'new.ts'), 'new\n');
    await writeFile(join(worktree, '.gitignore'), 'dist/\n');
    await mkdir(join(worktree, 'dist'));
    await writeFile(join(worktree, 'dist', 'out.js'), 'built\n');
    expect(await git.uncommitted(worktree)).toEqual(['.gitignore', 'README.md', 'src/new.ts']);
  });

  it('AC-8: lists the files new since the branch started, committed or not', async () => {
    const { repos, worktree, startCommit, git } = await setUp();
    await writeFile(join(worktree, 'committed.ts'), 'one\n');
    await writeFile(join(worktree, 'README.md'), '# web-app\nchanged\n');
    await repos.git(worktree, 'add', '.');
    await repos.git(worktree, 'commit', '-m', 'Claude committed this');
    await writeFile(join(worktree, '.env.local'), 'TOKEN=x\n');
    expect(await git.newFiles(worktree, { commit: startCommit })).toEqual(['.env.local', 'committed.ts']);
    // A session made before spec 013 has only its base's name.
    expect(await git.newFiles(worktree, { base: 'origin/main' })).toEqual(['.env.local', 'committed.ts']);
  });

  it("AC-2: gives the branch's commit subjects, oldest first, and the base's last 20, newest first", async () => {
    const { repos, worktree, startCommit, git } = await setUp();
    for (const subject of ['First change', 'Second change']) {
      await writeFile(join(worktree, `${subject}.ts`), `${subject}\n`);
      await repos.git(worktree, 'add', '.');
      await repos.git(worktree, 'commit', '-m', subject);
    }
    expect(await git.commitsSince(worktree, { commit: startCommit })).toEqual(['First change', 'Second change']);
    expect(await git.baseSubjects(worktree, 'origin/main')).toEqual(['add a.ts', 'first']);
    expect(await git.baseSubjects(worktree, 'origin/no-such-branch')).toEqual([]);
    expect(await git.head(worktree)).toBe(await repos.git(worktree, 'rev-parse', 'HEAD'));
  });

  it("AC-3: reads the repository's pull request template, only as a regular file inside the worktree", async () => {
    const { repos, worktree, git } = await setUp();
    expect(await git.template(worktree)).toBeNull();
    await mkdir(join(worktree, '.github'));
    await writeFile(join(worktree, '.github', 'PULL_REQUEST_TEMPLATE.md'), '## Summary\n\n## Testing\n');
    expect(await git.template(worktree)).toBe('## Summary\n\n## Testing\n');
    // A link to a file outside the worktree is never read.
    await rm(join(worktree, '.github', 'PULL_REQUEST_TEMPLATE.md'));
    await writeFile(join(repos.root, 'outside.md'), 'secret\n');
    await symlink(join(repos.root, 'outside.md'), join(worktree, '.github', 'pull_request_template.md'));
    expect(await git.template(worktree)).toBeNull();
    await mkdir(join(worktree, 'docs'));
    await writeFile(join(worktree, 'docs', 'pull_request_template.md'), 'From docs\n');
    expect(await git.template(worktree)).toBe('From docs\n');
  });

  it('AC-14: reading leaves the index and git status as they were', async () => {
    const { repos, worktree, startCommit, git } = await setUp();
    await writeFile(join(worktree, 'new.ts'), 'new\n');
    // `git status` itself refreshes the index, so it goes first.
    const status = await repos.git(worktree, 'status', '--porcelain');
    // A file whose times changed and text didn't would make a diff refresh the index.
    const later = new Date(Date.now() + 5_000);
    await utimes(join(worktree, 'README.md'), later, later);
    const index = join(repos.clone, '.git', 'worktrees', '0123456789abcdef', 'index');
    const before = await hashOf(index);
    await git.origin(worktree);
    await git.uncommitted(worktree);
    await git.newFiles(worktree, { commit: startCommit });
    await git.commitsSince(worktree, { commit: startCommit });
    await git.template(worktree);
    expect(await hashOf(index)).toBe(before);
    expect(await repos.git(worktree, 'status', '--porcelain')).toBe(status);
  });
});
