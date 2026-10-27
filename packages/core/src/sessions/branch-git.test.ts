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

/** Gives git the name and email the commit is made with, as your ~/.gitconfig would. */
async function withIdentity(repos: { root: string }) {
  await writeFile(
    join(repos.root, '.gitconfig'),
    '[init]\n\tdefaultBranch = main\n[user]\n\tname = Rakesh D\n\temail = you@company.com\n',
  );
}

/** A hook that writes `marker` into the folder above the repositories when it runs. */
async function hook(folder: string, name: string, marker: string) {
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, name), `#!/bin/sh\ntouch "${marker}"\n`, { mode: 0o755 });
}

describe('committing (spec 014, Q6)', () => {
  it('AC-5: commits every file not committed yet in one commit, with your identity and the message as given', async () => {
    const { repos, worktree, git } = await setUp();
    await withIdentity(repos);
    await writeFile(join(worktree, 'README.md'), '# web-app\nchanged\n');
    await writeFile(join(worktree, 'new.ts'), 'new\n');
    const message = 'PROJ-1423: Add bulk archive\n\nCo-Authored-By: Claude <noreply@anthropic.com>';
    const committed = await git.commit(worktree, message);
    expect(committed).toEqual({ ok: true, files: 2, head: await repos.git(worktree, 'rev-parse', 'HEAD') });
    expect(await repos.git(worktree, 'log', '-1', '--format=%an <%ae>%n%B')).toBe(
      `Rakesh D <you@company.com>\n${message}`,
    );
    expect(await repos.git(worktree, 'status', '--porcelain')).toBe('');
  });

  it("AC-5: makes no commit when there's nothing to commit", async () => {
    const { repos, worktree, git } = await setUp();
    await withIdentity(repos);
    const head = await repos.git(worktree, 'rev-parse', 'HEAD');
    expect(await git.commit(worktree, 'Nothing')).toEqual({ ok: true, files: 0, head });
  });

  it('AC-8: says git has no name and email for you, rather than make one up', async () => {
    const { worktree, git } = await setUp();
    await writeFile(join(worktree, 'new.ts'), 'new\n');
    expect(await git.commit(worktree, 'PROJ-1423: Add bulk archive')).toEqual({ ok: false, problem: 'no_identity' });
  });

  it("AC-8: says signing failed when your git settings sign and the signature can't be made", async () => {
    const { repos, worktree, git } = await setUp();
    await withIdentity(repos);
    await repos.git(repos.clone, 'config', 'commit.gpgsign', 'true');
    await repos.git(repos.clone, 'config', 'gpg.program', 'false');
    await writeFile(join(worktree, 'new.ts'), 'new\n');
    expect(await git.commit(worktree, 'PROJ-1423: Add bulk archive')).toEqual({ ok: false, problem: 'signing' });
  });

  it("AC-12: runs none of the repository's hooks, in .git/hooks or where core.hooksPath points inside the worktree", async () => {
    const { repos, worktree, git } = await setUp();
    await withIdentity(repos);
    const marker = join(repos.root, 'a-hook-ran');
    for (const name of ['pre-commit', 'commit-msg', 'post-commit']) {
      await hook(join(repos.clone, '.git', 'hooks'), name, marker);
      await hook(join(worktree, '.husky'), name, marker);
    }
    await repos.git(repos.clone, 'config', 'core.hooksPath', '.husky');
    await writeFile(join(worktree, 'new.ts'), 'new\n');
    // The three hooks under .husky are new files too.
    expect(await git.commit(worktree, 'PROJ-1423: Add bulk archive')).toMatchObject({ ok: true, files: 4 });
    await expect(readFile(marker)).rejects.toThrow();
  });
});

/** An `ssh` git runs for origin, as `core.sshCommand`: it prints `say` to stderr and fails, after `wait` seconds. */
async function fakeSsh(
  repos: { root: string; clone: string; git: (cwd: string, ...args: string[]) => Promise<string> },
  say: string,
  wait = 0,
) {
  const program = join(repos.root, 'fake-ssh');
  await writeFile(program, `#!/bin/sh\nsleep ${String(wait)}\necho "${say}" >&2\nexit 255\n`, { mode: 0o755 });
  await repos.git(repos.clone, 'config', 'core.sshCommand', program);
  await repos.git(repos.clone, 'remote', 'set-url', 'origin', 'git@github.com:acme/web-app.git');
}

describe('pushing (spec 014, Q6)', () => {
  it('AC-5: pushes the branch to origin under its own name, and changes nothing else there or in your checkout', async () => {
    const { repos, worktree, git } = await setUp();
    await withIdentity(repos);
    const marker = join(repos.root, 'a-hook-ran');
    await hook(join(repos.clone, '.git', 'hooks'), 'pre-push', marker);
    await writeFile(join(worktree, 'new.ts'), 'new\n');
    await git.commit(worktree, 'PROJ-1423: Add bulk archive');
    const mainBefore = await repos.git(repos.origin, 'rev-parse', 'refs/heads/main');
    const checkoutBefore = [
      await repos.git(repos.clone, 'symbolic-ref', 'HEAD'),
      await repos.git(repos.clone, 'status', '--porcelain'),
    ];

    const pushed = await git.push(worktree, 'feat/PROJ-1423');
    const head = await repos.git(worktree, 'rev-parse', 'HEAD');
    expect(pushed).toEqual({ ok: true, head, upToDate: false });
    expect(await repos.git(repos.origin, 'rev-parse', 'refs/heads/feat/PROJ-1423')).toBe(head);
    expect(await repos.git(repos.origin, 'rev-parse', 'refs/heads/main')).toBe(mainBefore);
    expect([
      await repos.git(repos.clone, 'symbolic-ref', 'HEAD'),
      await repos.git(repos.clone, 'status', '--porcelain'),
    ]).toEqual(checkoutBefore);
    await expect(readFile(marker)).rejects.toThrow();
  });

  it('AC-10: says a push with nothing new is up to date', async () => {
    const { repos, worktree, git } = await setUp();
    await withIdentity(repos);
    await writeFile(join(worktree, 'new.ts'), 'new\n');
    await git.commit(worktree, 'PROJ-1423: Add bulk archive');
    await git.push(worktree, 'feat/PROJ-1423');
    expect(await git.push(worktree, 'feat/PROJ-1423')).toMatchObject({ ok: true, upToDate: true });
  });

  it("AC-9: never forces: a branch on origin with a commit the worktree doesn't have is rejected, and kept", async () => {
    const { repos, worktree, git } = await setUp();
    await withIdentity(repos);
    // Someone else pushed to a branch of the same name.
    const other = join(repos.root, 'other');
    await repos.git(repos.root, 'clone', repos.origin, other);
    await repos.git(other, 'checkout', '-b', 'feat/PROJ-1423');
    await writeFile(join(other, 'theirs.ts'), 'theirs\n');
    await repos.git(other, 'add', '.');
    await repos.git(other, 'commit', '-m', 'Their commit');
    await repos.git(other, 'push', 'origin', 'feat/PROJ-1423');
    const theirs = await repos.git(other, 'rev-parse', 'HEAD');

    await writeFile(join(worktree, 'new.ts'), 'new\n');
    await git.commit(worktree, 'PROJ-1423: Add bulk archive');
    expect(await git.push(worktree, 'feat/PROJ-1423')).toEqual({ ok: false, problem: 'rejected' });
    expect(await repos.git(repos.origin, 'rev-parse', 'refs/heads/feat/PROJ-1423')).toBe(theirs);
  });

  it("AC-9: says git couldn't sign in to origin", async () => {
    const { repos, worktree, git } = await setUp();
    await fakeSsh(repos, 'git@github.com: Permission denied (publickey).');
    expect(await git.push(worktree, 'feat/PROJ-1423')).toEqual({ ok: false, problem: 'auth' });
  });

  it('AC-9: gives up on a push that takes too long', async () => {
    const { repos, worktree } = await setUp();
    await fakeSsh(repos, 'never', 5);
    const quick = createBranchGit({ env: gitEnvironment(repos.env), pushTimeoutMs: 300 });
    expect(await quick.push(worktree, 'feat/PROJ-1423')).toEqual({ ok: false, problem: 'timeout' });
  });

  it('AC-9, AC-24: says any other failure without git’s words, which can hold a password', async () => {
    const { repos, worktree, git } = await setUp();
    await repos.git(
      repos.clone,
      'remote',
      'set-url',
      'origin',
      'https://octocat:fake-token-for-tests@127.0.0.1:1/acme/web-app.git',
    );
    const pushed = await git.push(worktree, 'feat/PROJ-1423');
    expect(pushed).toEqual({ ok: false, problem: 'failed' });
    expect(JSON.stringify(pushed)).not.toContain('fake-token-for-tests');
  });
});

describe('pushing from your pull request’s branch (spec 031)', () => {
  /** A detached worktree at origin's fix/content-list, as a session on your pull request makes one. */
  async function setUpPull() {
    const repos = await repositories();
    await repos.commitInOrigin('fix.txt', 'fix/content-list');
    const worktree = join(repos.worktrees, '0123456789abcdef');
    const made = await createWorktrees({ env: gitEnvironment(repos.env), root: repos.worktrees }).make(
      repos.clone,
      worktree,
      { branch: 'fix/content-list', base: 'origin/fix/content-list', remote: true, detach: true },
    );
    if (!made.ok) throw new Error('the worktree should be made');
    await withIdentity(repos);
    return { repos, worktree, git: createBranchGit({ env: gitEnvironment(repos.env) }) };
  }

  it('AC-16: pushes the detached HEAD to the pull request’s branch, and nothing else', async () => {
    const { repos, worktree, git } = await setUpPull();
    const mainBefore = await repos.git(repos.origin, 'rev-parse', 'refs/heads/main');
    await writeFile(join(worktree, 'review.ts'), 'fixed\n');
    await git.commit(worktree, 'Answer the review');

    const head = await repos.git(worktree, 'rev-parse', 'HEAD');
    expect(await git.push(worktree, 'fix/content-list', { detached: true })).toEqual({
      ok: true,
      head,
      upToDate: false,
    });
    expect(await repos.git(repos.origin, 'rev-parse', 'refs/heads/fix/content-list')).toBe(head);
    expect(await repos.git(repos.origin, 'rev-parse', 'refs/heads/main')).toBe(mainBefore);
    expect(await repos.git(repos.clone, 'branch', '--list', 'fix/content-list')).toBe('');
  });

  it('AC-17: never forces: when someone pushed to the branch since, it is rejected and theirs is kept', async () => {
    const { repos, worktree, git } = await setUpPull();
    const theirs = await repos.commitInOrigin('theirs.ts', 'fix/content-list');
    await writeFile(join(worktree, 'review.ts'), 'fixed\n');
    await git.commit(worktree, 'Answer the review');

    expect(await git.push(worktree, 'fix/content-list', { detached: true })).toEqual({
      ok: false,
      problem: 'rejected',
    });
    expect(await repos.git(repos.origin, 'rev-parse', 'refs/heads/fix/content-list')).toBe(theirs);
  });
});

describe('nothing would be lost by removing the worktree (spec 047)', () => {
  /** A session's worktree with one commit, ignoring dist/, pushed as its pull request's head. */
  async function pushed() {
    const set = await setUp();
    await withIdentity(set.repos);
    await writeFile(join(set.worktree, 'new.ts'), 'new\n');
    await writeFile(join(set.worktree, '.gitignore'), 'dist/\n');
    await set.git.commit(set.worktree, 'PROJ-1423: Add bulk archive');
    await set.git.push(set.worktree, 'feat/PROJ-1423');
    return { ...set, head: await set.repos.git(set.worktree, 'rev-parse', 'HEAD') };
  }

  it("AC-12: is true at its pull request's head, merged or squashed, even once GitHub deletes the branch", async () => {
    const { repos, worktree, git, head } = await pushed();
    expect(await git.nothingToLose(worktree, [head])).toBe(true);
    await repos.git(repos.origin, 'branch', '-D', 'feat/PROJ-1423');
    expect(await git.nothingToLose(worktree, [head])).toBe(true);
  });

  it("AC-12: is true when the worktree is older than its pull request's head on that branch", async () => {
    const { repos, worktree, git } = await pushed();
    const later = await repos.commitInOrigin('reviewer.ts', 'feat/PROJ-1423');
    await repos.git(worktree, 'fetch', '-q', 'origin');
    expect(await git.nothingToLose(worktree, [later])).toBe(true);
  });

  it('AC-13: is false with a changed or new file; an ignored one is not work', async () => {
    const { worktree, git, head } = await pushed();
    await mkdir(join(worktree, 'dist'));
    await writeFile(join(worktree, 'dist', 'out.js'), 'built\n');
    expect(await git.nothingToLose(worktree, [head])).toBe(true);
    await writeFile(join(worktree, 'notes.md'), 'mine\n');
    expect(await git.nothingToLose(worktree, [head])).toBe(false);
    await rm(join(worktree, 'notes.md'));
    await writeFile(join(worktree, 'new.ts'), 'changed\n');
    expect(await git.nothingToLose(worktree, [head])).toBe(false);
  });

  it('AC-13: is false with a commit the pull request never got', async () => {
    const { worktree, git, head } = await pushed();
    await writeFile(join(worktree, 'more.ts'), 'more\n');
    await git.commit(worktree, 'PROJ-1423: One more');
    expect(await git.nothingToLose(worktree, [head])).toBe(false);
  });

  it("AC-13: is false when git doesn't know the commit to compare with: it can't tell, so the worktree stays", async () => {
    const { worktree, git } = await pushed();
    expect(await git.nothingToLose(worktree, ['f'.repeat(40)])).toBe(false);
    expect(await git.nothingToLose(worktree, ['--all'])).toBe(false);
  });

  it("AC-18: with no pull request, compares with origin's branch, as of the last push", async () => {
    const { worktree, git } = await pushed();
    const onOrigin = 'refs/remotes/origin/feat/PROJ-1423';
    expect(await git.nothingToLose(worktree, [onOrigin])).toBe(true);
    await writeFile(join(worktree, 'more.ts'), 'more\n');
    await git.commit(worktree, 'PROJ-1423: Not pushed');
    expect(await git.nothingToLose(worktree, [onOrigin])).toBe(false);
  });

  it('AC-18: with nothing to compare with, only files not committed count: the branch keeps its commits', async () => {
    const { worktree, git } = await pushed();
    await writeFile(join(worktree, 'more.ts'), 'more\n');
    await git.commit(worktree, 'PROJ-1423: Not pushed');
    expect(await git.nothingToLose(worktree, [])).toBe(true);
    await writeFile(join(worktree, 'notes.md'), 'mine\n');
    expect(await git.nothingToLose(worktree, [])).toBe(false);
  });

  it("AC-18: a worktree that's gone has nothing to lose; a folder git can't read keeps what's in it", async () => {
    const { repos, worktree, git, head } = await pushed();
    const broken = join(repos.root, 'not-a-worktree');
    await mkdir(broken);
    await writeFile(join(broken, 'work.ts'), 'work\n');
    expect(await git.nothingToLose(broken, [head])).toBe(false);
    await rm(worktree, { recursive: true, force: true });
    expect(await git.nothingToLose(worktree, [head])).toBe(true);
  });

  it('AC-20: an empty folder, as a delete that failed halfway leaves one, has nothing to lose', async () => {
    const { repos, git, head } = await pushed();
    const emptied = join(repos.worktrees, 'emptied');
    await mkdir(emptied);
    expect(await git.nothingToLose(emptied, [head])).toBe(true);
  });
});
