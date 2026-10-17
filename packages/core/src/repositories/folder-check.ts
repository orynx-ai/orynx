import { constants } from 'node:fs';
import { access, lstat, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';

/** Why a typed path can't be added to Settings › Repositories (spec 005, AC-7). */
export type FolderProblem =
  | { kind: 'empty' }
  /** Not a full path: relative, `~someone`, or holding a line break or NUL. */
  | { kind: 'not_full_path' }
  | { kind: 'missing' }
  | { kind: 'file' }
  | { kind: 'unreadable' }
  | { kind: 'not_repository' }
  /** `top` is the real path of the repository's top folder. */
  | { kind: 'inside_repository'; top: string }
  /** DevHub's own folder holds the session worktrees; Claude never works on them as a repository. */
  | { kind: 'inside_devhub' };

export type FolderCheck = { ok: true; path: string } | { ok: false; problem: FolderProblem };

export interface FolderCheckOptions {
  /** The person's home folder, for `~`. */
  home: string;
  /** DEVHUB_HOME, which can never be added. */
  devhubHome: string;
}

const lineBreakOrNul = /[\0\n\r]/;

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

/** The real path, or the path as given when it doesn't exist yet. */
async function realOrSame(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

function isWithin(path: string, folder: string): boolean {
  return path === folder || path.startsWith(folder.endsWith(sep) ? folder : folder + sep);
}

/** Whether `folder` holds `.git`: a folder in a plain clone, a file in a worktree. */
async function hasGit(folder: string): Promise<boolean> {
  try {
    await lstat(join(folder, '.git'));
    return true;
  } catch (error) {
    if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR') return false;
    throw error;
  }
}

/**
 * Checks a typed path with the file system only: nothing runs in the folder, not git and not a script
 * (spec 005, "Adding a folder runs nothing in it"). A good folder comes back as its real path.
 */
export async function checkFolder(typed: string, { home, devhubHome }: FolderCheckOptions): Promise<FolderCheck> {
  const text = typed.trim();
  if (text === '') return { ok: false, problem: { kind: 'empty' } };
  if (lineBreakOrNul.test(typed)) return { ok: false, problem: { kind: 'not_full_path' } };

  const expanded = text === '~' ? home : text.startsWith('~/') ? join(home, text.slice(2)) : text;
  if (!isAbsolute(expanded)) return { ok: false, problem: { kind: 'not_full_path' } };

  let path: string;
  try {
    path = await realpath(resolve(expanded));
  } catch (error) {
    const code = errorCode(error);
    if (code === 'ENOENT' || code === 'ENOTDIR') return { ok: false, problem: { kind: 'missing' } };
    if (code === 'EACCES' || code === 'EPERM') return { ok: false, problem: { kind: 'unreadable' } };
    throw error;
  }

  if (!(await stat(path)).isDirectory()) return { ok: false, problem: { kind: 'file' } };
  if (isWithin(path, await realOrSame(devhubHome))) return { ok: false, problem: { kind: 'inside_devhub' } };

  try {
    await access(path, constants.R_OK | constants.X_OK);
    if (await hasGit(path)) return { ok: true, path };
  } catch {
    return { ok: false, problem: { kind: 'unreadable' } };
  }

  for (let folder = dirname(path); ; folder = dirname(folder)) {
    if (await hasGit(folder).catch(() => false))
      return { ok: false, problem: { kind: 'inside_repository', top: folder } };
    if (dirname(folder) === folder) return { ok: false, problem: { kind: 'not_repository' } };
  }
}

/** A path as Settings shows it, with `~` for the home folder. `home` must be a real path too. */
export function displayPath(path: string, home: string): string {
  if (path === home) return '~';
  return isWithin(path, home) ? `~${path.slice(home.endsWith(sep) ? home.length - 1 : home.length)}` : path;
}
