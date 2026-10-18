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

describe('reading one file’s diff', () => {
  /** A worktree whose start commit holds `long.ts`, 20 numbered lines. */
  async function withLongFile() {
    const set = await setUp();
    const long = Array.from({ length: 20 }, (_, n) => `line ${String(n + 1)}`).join('\n');
    await writeFile(join(set.worktree, 'long.ts'), `${long}\n`);
    await set.repos.git(set.worktree, 'add', 'long.ts');
    await set.repos.git(set.worktree, 'commit', '-m', 'long');
    const commit = await set.repos.git(set.worktree, 'rev-parse', 'HEAD');
    return { ...set, start: { commit } };
  }

  it('AC-3: shows 3 lines around each change, numbered, with a hunk header between changes far apart', async () => {
    const { worktree, start, reader } = await withLongFile();
    const lines = Array.from({ length: 20 }, (_, n) => `line ${String(n + 1)}`);
    lines[1] = 'line two';
    lines[17] = 'line eighteen';
    await writeFile(join(worktree, 'long.ts'), `${lines.join('\n')}\n`);

    const read = await reader.fileDiff(worktree, start, 'long.ts');
    expect(read).toEqual({
      ok: true,
      diff: {
        path: 'long.ts',
        lines: [
          { kind: 'hunk', text: '@@ -1,5 +1,5 @@' },
          { kind: 'context', number: 1, text: 'line 1' },
          { kind: 'removed', number: 2, text: 'line 2' },
          { kind: 'added', number: 2, text: 'line two' },
          { kind: 'context', number: 3, text: 'line 3' },
          { kind: 'context', number: 4, text: 'line 4' },
          { kind: 'context', number: 5, text: 'line 5' },
          { kind: 'hunk', text: '@@ -15,6 +15,6 @@ line 14' },
          { kind: 'context', number: 15, text: 'line 15' },
          { kind: 'context', number: 16, text: 'line 16' },
          { kind: 'context', number: 17, text: 'line 17' },
          { kind: 'removed', number: 18, text: 'line 18' },
          { kind: 'added', number: 18, text: 'line eighteen' },
          { kind: 'context', number: 19, text: 'line 19' },
          { kind: 'context', number: 20, text: 'line 20' },
        ],
        binary: false,
        renamedFrom: null,
        cut: false,
      },
    });
  });

  it('AC-4: shows a new file as added lines from 1, and a deleted one as removed lines', async () => {
    const { worktree, start, reader } = await withLongFile();
    await writeFile(join(worktree, 'new.ts'), 'one\ntwo\n');
    await rm(join(worktree, 'a.ts'));
    const added = await reader.fileDiff(worktree, start, 'new.ts');
    expect(added.ok && added.diff.lines).toEqual([
      { kind: 'hunk', text: '@@ -0,0 +1,2 @@' },
      { kind: 'added', number: 1, text: 'one' },
      { kind: 'added', number: 2, text: 'two' },
    ]);
    const deleted = await reader.fileDiff(worktree, start, 'a.ts');
    expect(deleted.ok && deleted.diff.lines.slice(1)).toEqual([{ kind: 'removed', number: 1, text: 'a.ts' }]);
  });

  it('AC-5: says where a renamed file came from, and shows its change', async () => {
    const { repos, worktree, start, reader } = await withLongFile();
    await repos.git(worktree, 'mv', 'long.ts', 'longer.ts');
    await writeFile(join(worktree, 'longer.ts'), `${await readFile(join(worktree, 'longer.ts'), 'utf8')}line 21\n`);
    await repos.git(worktree, 'add', 'longer.ts');
    const read = await reader.fileDiff(worktree, start, 'longer.ts');
    expect(read.ok && read.diff).toMatchObject({ renamedFrom: 'long.ts', binary: false });
    expect(read.ok && read.diff.lines.at(-1)).toEqual({ kind: 'added', number: 21, text: 'line 21' });
  });

  it('AC-5: says a binary file, tracked or new, has no lines to show', async () => {
    const { repos, worktree, start, reader } = await withLongFile();
    await writeFile(join(worktree, 'logo.png'), Buffer.from([0x89, 0x00]));
    await repos.git(worktree, 'add', 'logo.png');
    await writeFile(join(worktree, 'icon.png'), Buffer.from([0x00, 0x01]));
    for (const path of ['logo.png', 'icon.png']) {
      expect(await reader.fileDiff(worktree, start, path)).toEqual({
        ok: true,
        diff: { path, lines: [], binary: true, renamedFrom: null, cut: false },
      });
    }
  });

  it('AC-5, Q5: stops a long new file after 2,000 lines and says so', async () => {
    const { worktree, start, reader } = await withLongFile();
    await writeFile(join(worktree, 'big.txt'), Array.from({ length: 2_500 }, (_, n) => `row ${String(n)}`).join('\n'));
    const read = await reader.fileDiff(worktree, start, 'big.txt');
    expect(read.ok && read.diff.lines).toHaveLength(2_000);
    expect(read.ok && read.diff.cut).toBe(true);
  });

  it('AC-24: answers only for a changed file, never one outside the worktree or behind a link', async () => {
    const { repos, worktree, start, reader } = await withLongFile();
    await writeFile(join(worktree, 'b.ts'), 'changed\n');
    await writeFile(join(repos.root, 'devhub', 'runtime.json'), '{"token":"secret"}\n');
    await symlink(join(repos.root, 'devhub', 'runtime.json'), join(worktree, 'runtime-link.json'));
    for (const path of ['../../runtime.json', join(worktree, 'b.ts'), 'README.md', 'nowhere.ts', '.git/config']) {
      expect(await reader.fileDiff(worktree, start, path)).toEqual({ ok: false, problem: 'not_listed' });
    }
    expect(await reader.fileDiff(worktree, start, 'runtime-link.json')).toEqual({
      ok: true,
      diff: { path: 'runtime-link.json', lines: [], binary: true, renamedFrom: null, cut: false },
    });
  });

  it('AC-6, AC-7: says the worktree is missing, or that git failed', async () => {
    const { repos, worktree, reader } = await withLongFile();
    expect(await reader.fileDiff(join(repos.worktrees, 'gone'), { commit: 'f'.repeat(40) }, 'a.ts')).toEqual({
      ok: false,
      problem: 'missing',
    });
    expect(await reader.fileDiff(worktree, { commit: 'f'.repeat(40) }, 'a.ts')).toEqual({ ok: false, problem: 'git' });
  });
});
