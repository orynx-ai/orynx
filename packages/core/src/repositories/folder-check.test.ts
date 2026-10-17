import { existsSync, realpathSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkFolder, displayPath, folderIdentity } from './folder-check.ts';

let root: string;
let home: string;
let devhubHome: string;
let repo: string;

beforeAll(async () => {
  // The real path: on macOS the temporary folder sits behind a symlink (/var → /private/var).
  root = await realpath(await mkdtemp(join(tmpdir(), 'devhub-folders-')));
  home = join(root, 'home');
  devhubHome = join(home, '.devhub');
  repo = join(home, 'code', 'app');
  await mkdir(join(repo, '.git'), { recursive: true });
  await mkdir(join(repo, 'src'));
  await mkdir(join(home, 'code', 'worktree'), { recursive: true });
  await writeFile(join(home, 'code', 'worktree', '.git'), 'gitdir: /somewhere/.git/worktrees/worktree\n');
  await mkdir(join(home, 'plain'));
  await writeFile(join(home, 'notes.txt'), 'not a folder');
  await symlink(repo, join(home, 'link'));
  await mkdir(join(devhubHome, 'worktrees', 'session-1'), { recursive: true });
  await writeFile(join(devhubHome, 'worktrees', 'session-1', '.git'), 'gitdir: x\n');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function check(typed: string) {
  return checkFolder(typed, { home, devhubHome });
}

describe('checkFolder', () => {
  it("AC-6: accepts a repository's top folder, typed with ~ or in full, and answers with its real path", async () => {
    expect(await check('~/code/app')).toEqual({ ok: true, path: repo, identity: await folderIdentity(repo) });
    expect(await check(`${repo}/`)).toMatchObject({ ok: true, path: repo });
    expect(await check(`  ${home}/code/app/../app  `)).toMatchObject({ ok: true, path: repo });
  });

  it('AC-6: follows a symlink to the folder it points at, which keeps its own identity', async () => {
    expect(await check('~/link')).toEqual({ ok: true, path: repo, identity: await folderIdentity(repo) });
  });

  it('AC-6: accepts a git worktree, whose .git is a file', async () => {
    expect(await check('~/code/worktree')).toMatchObject({ ok: true, path: join(home, 'code', 'worktree') });
  });

  it('AC-7: refuses an empty field', async () => {
    for (const typed of ['', '   ']) expect(await check(typed)).toEqual({ ok: false, problem: { kind: 'empty' } });
  });

  it('AC-7: refuses a path that is not a full path, or holds a line break', async () => {
    for (const typed of ['code/app', './app', '~someone/app', `${repo}\n`, `${home}/a\nb`, `${home}/a\0b`]) {
      expect(await check(typed), JSON.stringify(typed)).toEqual({ ok: false, problem: { kind: 'not_full_path' } });
    }
  });

  it('AC-7: says nothing is there, including below a file', async () => {
    expect(await check('~/missing')).toEqual({ ok: false, problem: { kind: 'missing' } });
    expect(await check('~/notes.txt/app')).toEqual({ ok: false, problem: { kind: 'missing' } });
  });

  it('AC-7: says a file is a file', async () => {
    expect(await check('~/notes.txt')).toEqual({ ok: false, problem: { kind: 'file' } });
  });

  it('AC-7: refuses a folder that is not a git repository', async () => {
    expect(await check('~/plain')).toEqual({ ok: false, problem: { kind: 'not_repository' } });
  });

  it("AC-7: names the repository's top folder when the folder is inside one", async () => {
    expect(await check('~/code/app/src')).toEqual({ ok: false, problem: { kind: 'inside_repository', top: repo } });
  });

  it("AC-7: refuses DevHub's own folder and anything in it, worktrees included", async () => {
    for (const typed of ['~/.devhub', '~/.devhub/worktrees/session-1']) {
      expect(await check(typed), typed).toEqual({ ok: false, problem: { kind: 'inside_devhub' } });
    }
  });

  // macOS reaches every folder under /private also through /System/Volumes/Data, and realpath keeps
  // whichever spelling it was given. Only the folder's identity on disk tells the two apart.
  it.runIf(process.platform === 'darwin' && existsSync(`/System/Volumes/Data${realpathSync(tmpdir())}`))(
    "AC-7: knows DevHub's folder by its identity on disk, not by how its path is spelled",
    async () => {
      expect(await check(`/System/Volumes/Data${devhubHome}/worktrees/session-1`)).toEqual({
        ok: false,
        problem: { kind: 'inside_devhub' },
      });
    },
  );

  it('AC-7: says nothing is there for a symlink loop or a name too long for the disk', async () => {
    await symlink(join(home, 'loop-b'), join(home, 'loop-a'));
    await symlink(join(home, 'loop-a'), join(home, 'loop-b'));

    expect(await check('~/loop-a')).toEqual({ ok: false, problem: { kind: 'missing' } });
    expect(await check(`~/${'a'.repeat(300)}`)).toEqual({ ok: false, problem: { kind: 'missing' } });
  });

  it.skipIf(process.getuid?.() === 0)("AC-7: says when DevHub can't read the folder", async () => {
    const locked = join(home, 'locked');
    await mkdir(join(locked, '.git'), { recursive: true });
    await chmod(locked, 0o000);
    try {
      expect(await check('~/locked')).toEqual({ ok: false, problem: { kind: 'unreadable' } });
    } finally {
      await chmod(locked, 0o700);
    }
  });
});

describe('displayPath', () => {
  it('AC-6: shows the home folder as ~', () => {
    expect(displayPath(home, home)).toBe('~');
    expect(displayPath(repo, home)).toBe('~/code/app');
  });

  it('leaves a path outside the home folder as it is, even one that starts with the same letters', () => {
    expect(displayPath('/opt/code/app', home)).toBe('/opt/code/app');
    expect(displayPath(`${home}-other/app`, home)).toBe(`${home}-other/app`);
  });
});
