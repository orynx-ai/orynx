import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import type { ChangedFile, FileDiff, SessionChanges } from '@devhub/contracts';
import { parseUnifiedDiff } from './unified-diff.ts';

/**
 * What differs in a session's worktree from the commit its branch started from (spec 013, Q4): Claude's
 * commits, its uncommitted edits, new files git doesn't track yet (ignored ones left out), and changes a
 * command or you made. Read-only: no git call writes the worktree's index (`diff.autoRefreshIndex=false`,
 * `--no-optional-locks`), runs a hook, or goes on past its time limit. A new file is read straight from disk,
 * because git would need one process for each, and only when it's a regular file inside the worktree, so a
 * link Claude made can't show a file from anywhere else (AC-24).
 */

export type ReadyChanges = Extract<SessionChanges, { state: 'ready' }>;

/**
 * The commit the branch started from, with the base it came from when that base can be merged in later; or, for a
 * session made before spec 013, the base alone to find it from.
 */
export type StartPoint = { commit: string; base?: string } | { base: string };

/**
 * A session's start point. The base goes with the commit unless it's the session's own branch on origin (your pull
 * request's, spec 031), which our own push moves on.
 */
export function sessionStartPoint(
  startCommit: string | null,
  base: string | null,
  branch: string | null,
): StartPoint | null {
  if (startCommit === null) return base === null ? null : { base };
  return base === null || base === `origin/${branch ?? ''}` ? { commit: startCommit } : { commit: startCommit, base };
}

/**
 * The commit a session's changes count from. Once Claude merged or rebased its base in, that's where the base and the
 * branch meet, so what the base brought isn't counted as the session's, as GitHub's pull request shows it (the user's
 * report, 22 Oct 2026). `read` runs git in the worktree.
 */
export async function startCommitOf(read: (args: string[]) => Promise<string>, start: StartPoint): Promise<string> {
  if (!('commit' in start)) {
    const found = (await read(['merge-base', 'HEAD', start.base])).trim();
    if (found === '') throw new Error('no merge base');
    return found;
  }
  if (start.base === undefined) return start.commit;
  const met = (await read(['merge-base', 'HEAD', start.base]).catch(() => '')).trim();
  if (met === '' || met === start.commit) return start.commit;
  const after = await read(['merge-base', '--is-ancestor', start.commit, met]).then(
    () => true,
    () => false,
  );
  return after ? met : start.commit;
}

export type ListedChanges = { ok: true; changes: ReadyChanges } | { ok: false; problem: 'missing' | 'git' };

/** One file's diff, or why there isn't one: `not_listed` is any path that isn't a changed file (AC-24). */
export type ReadDiff = { ok: true; diff: FileDiff } | { ok: false; problem: 'missing' | 'git' | 'not_listed' };

export interface ChangesReader {
  /** `order` is the files Claude first changed, in order: they come first, then the rest by path (Q5). */
  list(worktree: string, start: StartPoint, order: readonly string[]): Promise<ListedChanges>;
  /** Only a path git lists as changed is ever read, so nothing outside the worktree can be (AC-24). */
  fileDiff(worktree: string, start: StartPoint, path: string): Promise<ReadDiff>;
}

export interface ChangesReaderOptions {
  /** From `gitEnvironment()`. */
  env: Readonly<Record<string, string>>;
  /** How long one git call may take; 10 seconds. */
  timeoutMs?: number;
  /** How many files are listed; 300 (Q5). */
  mostFiles?: number;
}

/** git's own test for a binary file: a NUL byte in its first 8,000 bytes. */
const sniffBytes = 8_000;
/** A new file bigger than this isn't read, and shows as not shown. */
const mostNewFileBytes = 16 * 1024 * 1024;

const numstatEntry = /^(\d+|-)\t(\d+|-)\t(.*)$/s;

/** `git diff --numstat -z`: counts then a path, or counts, nothing, then the old and new paths of a rename. */
function readNumstat(output: string): ChangedFile[] {
  const tokens = output.split('\0');
  const files: ChangedFile[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const entry = numstatEntry.exec(tokens[i] ?? '');
    if (entry === null) continue;
    const [, added = '-', removed = '-', path = ''] = entry;
    const binary = added === '-' || removed === '-';
    const counts = { added: binary ? 0 : Number(added), removed: binary ? 0 : Number(removed), binary };
    if (path !== '') {
      files.push({ path, ...counts, renamedFrom: null });
      continue;
    }
    const from = tokens[i + 1] ?? '';
    const to = tokens[i + 2] ?? '';
    i += 2;
    if (to !== '') files.push({ path: to, ...counts, renamedFrom: from === '' ? null : from });
  }
  return files;
}

/**
 * A new file's bytes, or null when it can't or mustn't be read: a link, a folder (another repository inside
 * this one), a file linked from elsewhere, one too big, one that leads outside the worktree, or a binary one.
 */
async function readNewFile(worktree: string, path: string): Promise<Buffer | null> {
  try {
    const full = join(worktree, path);
    const found = await lstat(full);
    if (!found.isFile() || found.nlink > 1 || found.size > mostNewFileBytes) return null;
    const inside = relative(await realpath(worktree), await realpath(full));
    if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) return null;
    const bytes = await readFile(full);
    return bytes.subarray(0, sniffBytes).includes(0) ? null : bytes;
  } catch {
    // Gone since git listed it.
    return null;
  }
}

/** A new file's lines, as git counts them for a file added whole; binary when it isn't read. */
async function countNewFile(worktree: string, path: string): Promise<ChangedFile> {
  const bytes = await readNewFile(worktree, path);
  if (bytes === null) return { path, added: 0, removed: 0, binary: true, renamedFrom: null, created: true };
  let lines = 0;
  for (const byte of bytes) if (byte === 0x0a) lines += 1;
  if (bytes.length > 0 && bytes.at(-1) !== 0x0a) lines += 1;
  return { path, added: lines, removed: 0, binary: false, renamedFrom: null, created: true };
}

/** A new file's diff: every line added, numbered from 1, as git would show it. */
async function newFileDiff(worktree: string, path: string): Promise<FileDiff> {
  const bytes = await readNewFile(worktree, path);
  if (bytes === null) return { path, lines: [], binary: true, renamedFrom: null, cut: false };
  const text = bytes.toString('utf8');
  if (text === '') return { path, lines: [], binary: false, renamedFrom: null, cut: false };
  const rows = (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n');
  const patch = [`@@ -0,0 +1,${String(rows.length)} @@`, ...rows.map((row) => `+${row}`)].join('\n');
  return { path, ...parseUnifiedDiff(patch), renamedFrom: null };
}

/** What changed, from git: the start commit, the tracked files git counted, and the new files it lists. */
type Scan =
  | { ok: true; commit: string; tracked: Map<string, ChangedFile>; untracked: Set<string> }
  | { ok: false; problem: 'missing' | 'git' };

export function createChangesReader({ env, timeoutMs = 10_000, mostFiles = 300 }: ChangesReaderOptions): ChangesReader {
  function git(worktree: string): SimpleGit {
    return simpleGit({
      baseDir: worktree,
      // Hooks are the repository's own programs; reading the changes must run none of them. A diff rewrites
      // the index when a file's times changed and its text didn't, unless told not to (`--no-optional-locks`
      // doesn't stop that one).
      config: ['core.hooksPath=/dev/null', 'diff.autoRefreshIndex=false'],
      unsafe: { allowUnsafeHooksPath: true },
      allowEnvironment: ['GIT_TERMINAL_PROMPT'],
      abort: AbortSignal.timeout(timeoutMs),
    }).env({ ...env });
  }

  /** Runs git without taking the locks it would take to write the index as it reads. */
  function read(worktree: string, args: string[]): Promise<string> {
    return git(worktree).raw(['--no-optional-locks', ...args]);
  }

  async function isWorktree(worktree: string): Promise<boolean> {
    try {
      if (!(await stat(worktree)).isDirectory()) return false;
      return (await read(worktree, ['rev-parse', '--is-inside-work-tree'])).trim() === 'true';
    } catch {
      return false;
    }
  }

  function startOf(worktree: string, start: StartPoint): Promise<string> {
    return startCommitOf((args) => read(worktree, args), start);
  }

  async function scan(worktree: string, start: StartPoint): Promise<Scan> {
    if (!(await isWorktree(worktree))) return { ok: false, problem: 'missing' };
    try {
      const commit = await startOf(worktree, start);
      const since = ['-z', '-M', '--no-ext-diff', '--no-textconv', commit, '--'];
      const [counted, added, untracked] = await Promise.all([
        read(worktree, ['diff', '--numstat', ...since]).then(readNumstat),
        // What git calls added since the start, committed or staged, for the New file pill (spec 048).
        read(worktree, ['diff', '--name-only', '--diff-filter=A', ...since]).then((out) => new Set(out.split('\0'))),
        read(worktree, ['ls-files', '--others', '--exclude-standard', '-z']).then((out) =>
          out.split('\0').filter((path) => path !== ''),
        ),
      ]);
      const tracked = counted.map((file) => (added.has(file.path) ? { ...file, created: true } : file));
      const byPath = new Map(tracked.map((file) => [file.path, file]));
      return { ok: true, commit, tracked: byPath, untracked: new Set(untracked.filter((path) => !byPath.has(path))) };
    } catch {
      return { ok: false, problem: 'git' };
    }
  }

  return {
    async list(worktree, start, order) {
      const found = await scan(worktree, start);
      if (!found.ok) return found;
      const byPath = new Map<string, ChangedFile | null>(found.tracked);
      for (const path of found.untracked) byPath.set(path, null);
      const first = [...new Set(order)].filter((path) => byPath.has(path));
      const rest = [...byPath.keys()].filter((path) => !first.includes(path)).sort((a, b) => (a < b ? -1 : 1));
      const listed = [...first, ...rest].slice(0, mostFiles);
      const files = await Promise.all(
        listed.map((path) => {
          const known = byPath.get(path);
          return known === undefined || known === null ? countNewFile(worktree, path) : Promise.resolve(known);
        }),
      );
      return {
        ok: true,
        changes: {
          state: 'ready',
          files,
          moreFiles: byPath.size - files.length,
          added: files.reduce((sum, file) => sum + file.added, 0),
          removed: files.reduce((sum, file) => sum + file.removed, 0),
        },
      };
    },

    async fileDiff(worktree, start, path) {
      const found = await scan(worktree, start);
      if (!found.ok) return found;
      if (found.untracked.has(path)) return { ok: true, diff: await newFileDiff(worktree, path) };
      const file = found.tracked.get(path);
      if (file === undefined) return { ok: false, problem: 'not_listed' };
      const { renamedFrom } = file;
      if (file.binary) return { ok: true, diff: { path, lines: [], binary: true, renamedFrom, cut: false } };
      // Both paths of a rename, so git can still see it as one.
      const paths = renamedFrom === null ? [path] : [renamedFrom, path];
      try {
        const patch = await read(worktree, [
          'diff',
          '-U3',
          '-M',
          '--no-ext-diff',
          '--no-textconv',
          found.commit,
          '--',
          ...paths,
        ]);
        const parsed = parseUnifiedDiff(patch);
        return { ok: true, diff: { path, ...parsed, renamedFrom: renamedFrom ?? parsed.renamedFrom } };
      } catch {
        return { ok: false, problem: 'git' };
      }
    },
  };
}
