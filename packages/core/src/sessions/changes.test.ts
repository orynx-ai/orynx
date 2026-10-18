import { createHash } from 'node:crypto';
import { link, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { gitEnvironment } from '../agents/agent-environment.ts';
import { useTestRepositories } from '../test/git-repository.ts';
import { createChangesReader, type ListedChanges } from './changes.ts';
import { createWorktrees } from './worktrees.ts';

// Each test makes real repositories and a worktree with git, which can pass 5 seconds when every file runs at once.
vi.setConfig({ testTimeout: 20_000 });

const repositories = useTestRepositories();

/** A clone whose origin has `a.ts` to `d.ts`, and a session worktree made from it, as spec 011 makes one. */
async function setUp() {
  const repos = await repositories();
  for (const file of ['a.ts', 'b.ts', 'c.ts', 'd.ts']) await repos.commitInOrigin(file);
  const worktree = join(repos.worktrees, '0123456789abcdef');
  const made = await createWorktrees({ env: gitEnvironment(repos.env), root: repos.worktrees }).make(
    repos.clone,
    worktree,
    { branch: 'feat/PROJ-1423', base: 'origin/main', remote: true },
  );
  if (!made.ok) throw new Error('the worktree should be made');
  const reader = createChangesReader({ env: gitEnvironment(repos.env) });
  return { repos, worktree, startCommit: made.startCommit, reader };
}

const file = (
  path: string,
  added: number,
  removed: number,
  more: Partial<{ binary: boolean; renamedFrom: string }> = {},
) => ({
  path,
  added,
  removed,
  binary: more.binary ?? false,
  renamedFrom: more.renamedFrom ?? null,
});

function changesOf(listed: ListedChanges) {
  if (!listed.ok) throw new Error(`the changes should be read, not ${listed.problem}`);
  return listed.changes;
}
const filesOf = (listed: ListedChanges) => changesOf(listed).files;

const hashOf = async (path: string) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

describe('listing a worktree’s changes', () => {
  it('AC-4: lists what Claude committed, left uncommitted, added and deleted, and what a command changed, but not ignored files', async () => {
    const { repos, worktree, startCommit, reader } = await setUp();
    await writeFile(join(worktree, 'a.ts'), 'committed\n');
    await repos.git(worktree, 'commit', '-am', 'Claude committed this');
    await writeFile(join(worktree, 'b.ts'), 'b.ts\nleft uncommitted\n');
    await writeFile(join(worktree, 'new.ts'), 'one\ntwo\nthree');
    await rm(join(worktree, 'c.ts'));
    await writeFile(join(worktree, 'd.ts'), 'reformatted\n');
    await writeFile(join(worktree, '.gitignore'), 'dist/\n');
    await mkdir(join(worktree, 'dist'));
    await writeFile(join(worktree, 'dist', 'out.js'), 'built\n');

    expect(await reader.list(worktree, { commit: startCommit }, [])).toEqual({
      ok: true,
      changes: {
        state: 'ready',
        files: [
          file('.gitignore', 1, 0),
          file('a.ts', 1, 1),
          file('b.ts', 1, 0),
          file('c.ts', 0, 1),
          file('d.ts', 1, 1),
          file('new.ts', 3, 0),
        ],
        moreFiles: 0,
        added: 7,
        removed: 3,
      },
    });
  });

  it('AC-4, Q5: puts the files in the order Claude first changed them, then the others by path', async () => {
    const { worktree, startCommit, reader } = await setUp();
    for (const name of ['a.ts', 'b.ts', 'd.ts']) await writeFile(join(worktree, name), 'changed\n');
    await writeFile(join(worktree, 'new.ts'), 'new\n');
    const listed = await reader.list(worktree, { commit: startCommit }, ['new.ts', 'd.ts', 'gone.ts', 'd.ts']);
    expect(filesOf(listed).map((one) => one.path)).toEqual(['new.ts', 'd.ts', 'a.ts', 'b.ts']);
  });

  it('AC-4: shows nothing when nothing has changed yet', async () => {
    const { worktree, startCommit, reader } = await setUp();
    expect(await reader.list(worktree, { commit: startCommit }, [])).toEqual({
      ok: true,
      changes: { state: 'ready', files: [], moreFiles: 0, added: 0, removed: 0 },
    });
  });

  it('AC-5: says where a file Claude renamed came from', async () => {
    const { repos, worktree, startCommit, reader } = await setUp();
    await repos.git(worktree, 'mv', 'a.ts', 'renamed.ts');
    const listed = await reader.list(worktree, { commit: startCommit }, []);
    expect(filesOf(listed)).toEqual([file('renamed.ts', 0, 0, { renamedFrom: 'a.ts' })]);
  });

  it('AC-5: lists a binary file without counts, tracked or new', async () => {
    const { repos, worktree, startCommit, reader } = await setUp();
    await writeFile(join(worktree, 'logo.png'), Buffer.from([0x89, 0x50, 0x00, 0x01]));
    await repos.git(worktree, 'add', 'logo.png');
    await repos.git(worktree, 'commit', '-m', 'logo');
    await writeFile(join(worktree, 'icon.png'), Buffer.from([0x00, 0xff, 0x00]));
    const listed = await reader.list(worktree, { commit: startCommit }, []);
    expect(filesOf(listed)).toEqual([
      file('icon.png', 0, 0, { binary: true }),
      file('logo.png', 0, 0, { binary: true }),
    ]);
  });

  it('AC-24: never reads a new file that is a link, or that leads outside the worktree', async () => {
    const { repos, worktree, startCommit, reader } = await setUp();
    const outside = join(repos.root, 'secret.txt');
    await writeFile(outside, 'a secret\n');
    await symlink(outside, join(worktree, 'link.txt'));
    await link(outside, join(worktree, 'hard.txt'));
    const listed = await reader.list(worktree, { commit: startCommit }, []);
    expect(filesOf(listed)).toEqual([
      file('hard.txt', 0, 0, { binary: true }),
      file('link.txt', 0, 0, { binary: true }),
    ]);
  });

  it('AC-5, Q5: lists 300 files and says how many more there are, in good time', async () => {
    const { worktree, startCommit, reader } = await setUp();
    await mkdir(join(worktree, 'many'));
    await Promise.all(
      Array.from({ length: 350 }, (_, n) =>
        writeFile(join(worktree, 'many', `f${String(n).padStart(3, '0')}.txt`), 'x\n'),
      ),
    );
    const started = Date.now();
    const listed = await reader.list(worktree, { commit: startCommit }, []);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(changesOf(listed)).toMatchObject({
      moreFiles: 50,
      added: 300,
      removed: 0,
    });
    expect(filesOf(listed)).toHaveLength(300);
  });

  it('AC-4: leaves the worktree’s index, files and status as they were', async () => {
    const { repos, worktree, startCommit, reader } = await setUp();
    await writeFile(join(worktree, 'b.ts'), 'changed\n');
    await writeFile(join(worktree, 'new.ts'), 'new\n');
    const gitDir = await repos.git(worktree, 'rev-parse', '--git-dir');
    const status = await repos.git(worktree, 'status', '--porcelain=v1');
    // Rewrite a file git has cached with the same text, more than a second after the index was written: its
    // times change and its text doesn't, which is what makes a plain `git diff` rewrite the index.
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await writeFile(join(worktree, 'a.ts'), 'a.ts\n');
    const index = await hashOf(join(gitDir, 'index'));

    await reader.list(worktree, { commit: startCommit }, []);

    expect(await hashOf(join(gitDir, 'index'))).toBe(index);
    expect(await repos.git(worktree, 'status', '--porcelain=v1')).toBe(status);
  });

  it('finds the start from the base for a session made before spec 013, which kept no start commit', async () => {
    const { worktree, startCommit, reader } = await setUp();
    await writeFile(join(worktree, 'b.ts'), 'changed\n');
    expect(await reader.list(worktree, { base: 'origin/main' }, [])).toEqual(
      await reader.list(worktree, { commit: startCommit }, []),
    );
  });

  it('AC-6, AC-7: says the worktree is missing, or that git failed, without git’s words', async () => {
    const { repos, worktree, startCommit, reader } = await setUp();
    expect(await reader.list(join(repos.worktrees, 'not-there'), { commit: startCommit }, [])).toEqual({
      ok: false,
      problem: 'missing',
    });
    expect(await reader.list(worktree, { commit: 'f'.repeat(40) }, [])).toEqual({ ok: false, problem: 'git' });
    await rm(worktree, { recursive: true, force: true });
    expect(await reader.list(worktree, { commit: startCommit }, [])).toEqual({ ok: false, problem: 'missing' });
  });
});
