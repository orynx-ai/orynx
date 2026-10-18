import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import type { StartPoint } from './changes.ts';
import { githubRepository } from './github-remote.ts';

/**
 * The git a pull request needs (spec 014): which repository `origin` is, what the worktree holds, and later the
 * commit and the push. Every call runs with the repository's hooks off, as everywhere Orynx runs git (spec 011),
 * because a hook is a program from the repository that Claude could have written. Reads write nothing: no index
 * refresh, no locks. git's output never leaves this file, because it can hold the remote's address, password and
 * all; callers get facts and problem names.
 */

export type OriginProblem = 'missing' | 'no_origin' | 'not_github' | 'git';
export type Origin = { ok: true; repository: string } | { ok: false; problem: OriginProblem };

export interface BranchGit {
  /** The github.com repository `origin` names, as configured or as git expands it (AC-2, AC-7). */
  origin(worktree: string): Promise<Origin>;
  /** Files not committed yet: changed ones and new ones git doesn't ignore, by path. */
  uncommitted(worktree: string): Promise<string[]>;
  /** Files new since the branch started, committed or not, by path: the secret check reads these (Q6). */
  newFiles(worktree: string, start: StartPoint): Promise<string[]>;
  /** The subjects of the commits on the branch since it started, oldest first. */
  commitsSince(worktree: string, start: StartPoint): Promise<string[]>;
  /** The last 20 commit subjects on `base`, newest first; none when git doesn't know it. */
  baseSubjects(worktree: string, base: string): Promise<string[]>;
  /** The repository's pull request template, read only as a regular file inside the worktree; null when none. */
  template(worktree: string): Promise<string | null>;
  /** The commit the worktree is on. */
  head(worktree: string): Promise<string>;
}

export interface BranchGitOptions {
  /** From `gitEnvironment()`. */
  env: Readonly<Record<string, string>>;
  /** How long one read may take; 10 seconds. */
  timeoutMs?: number;
}

/** Where GitHub looks for a pull request template, in its order. */
const templateFolders = ['.github', '', 'docs'];
const templateName = /^pull_request_template\.md$/i;
/** A template bigger than this isn't read. */
const mostTemplateBytes = 64 * 1024;

/** git's NUL-separated lists, without the empty end. */
function paths(output: string): string[] {
  return output.split('\0').filter((path) => path !== '');
}

function lines(output: string): string[] {
  return output.split('\n').filter((line) => line !== '');
}

export function createBranchGit({ env, timeoutMs = 10_000 }: BranchGitOptions): BranchGit {
  function git(worktree: string): SimpleGit {
    return simpleGit({
      baseDir: worktree,
      // A diff rewrites the index when a file's times changed and its text didn't, unless told not to (spec 013).
      config: ['core.hooksPath=/dev/null', 'diff.autoRefreshIndex=false'],
      unsafe: { allowUnsafeHooksPath: true },
      allowEnvironment: ['GIT_TERMINAL_PROMPT'],
      abort: AbortSignal.timeout(timeoutMs),
      // git's own words in English, so a failure can be told apart (task 9).
    }).env({ ...env, LC_ALL: 'C' });
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

  async function startOf(worktree: string, start: StartPoint): Promise<string> {
    if ('commit' in start) return start.commit;
    const found = (await read(worktree, ['merge-base', 'HEAD', start.base])).trim();
    if (found === '') throw new Error('no merge base');
    return found;
  }

  async function untracked(worktree: string): Promise<string[]> {
    return paths(await read(worktree, ['ls-files', '--others', '--exclude-standard', '-z']));
  }

  /** A file's text when it's a regular file inside the worktree with one link, small enough; null otherwise. */
  async function readInside(worktree: string, path: string): Promise<string | null> {
    try {
      const found = await lstat(path);
      if (!found.isFile() || found.nlink > 1 || found.size > mostTemplateBytes) return null;
      const inside = relative(await realpath(worktree), await realpath(path));
      if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) return null;
      return await readFile(path, 'utf8');
    } catch {
      return null;
    }
  }

  return {
    async origin(worktree) {
      if (!(await isWorktree(worktree))) return { ok: false, problem: 'missing' };
      try {
        // `config --get` exits quietly with nothing when there's no origin, which simple-git doesn't count as failing.
        const configured = (await read(worktree, ['config', '--get', 'remote.origin.url'])).trim();
        if (configured === '') return { ok: false, problem: 'no_origin' };
        const expanded = (await read(worktree, ['remote', 'get-url', 'origin'])).trim();
        const repository = githubRepository(configured) ?? githubRepository(expanded);
        return repository === null ? { ok: false, problem: 'not_github' } : { ok: true, repository };
      } catch {
        return { ok: false, problem: 'git' };
      }
    },

    async uncommitted(worktree) {
      const [changed, added] = await Promise.all([
        read(worktree, ['diff', '--name-only', '-z', '--no-ext-diff', 'HEAD', '--']).then(paths),
        untracked(worktree),
      ]);
      return [...new Set([...changed, ...added])].sort();
    },

    async newFiles(worktree, start) {
      const commit = await startOf(worktree, start);
      const [committed, added] = await Promise.all([
        read(worktree, ['diff', '--name-only', '-z', '--no-ext-diff', '--diff-filter=A', commit, '--']).then(paths),
        untracked(worktree),
      ]);
      return [...new Set([...committed, ...added])].sort();
    },

    async commitsSince(worktree, start) {
      const commit = await startOf(worktree, start);
      return lines(await read(worktree, ['log', '--reverse', '--format=%s', `${commit}..HEAD`, '--']));
    },

    async baseSubjects(worktree, base) {
      try {
        return lines(await read(worktree, ['log', '-20', '--format=%s', base, '--']));
      } catch {
        return [];
      }
    },

    async template(worktree) {
      for (const folder of templateFolders) {
        const where = join(worktree, folder);
        let names: string[];
        try {
          names = await readdir(where);
        } catch {
          continue;
        }
        for (const name of names.filter((entry) => templateName.test(entry)).sort()) {
          const text = await readInside(worktree, join(where, name));
          if (text !== null) return text;
        }
      }
      return null;
    },

    async head(worktree) {
      return (await read(worktree, ['rev-parse', 'HEAD'])).trim();
    },
  };
}
