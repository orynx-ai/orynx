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

/** git has no name and email for you, signing the commit failed, or the commit failed another way (Q6). */
export type CommitProblem = 'no_identity' | 'signing' | 'commit_failed';
/** `files` is how many Orynx committed; 0, and no commit, when everything was committed already. */
export type Committed = { ok: true; files: number; head: string } | { ok: false; problem: CommitProblem };

/**
 * git couldn't sign in to origin, origin has commits the worktree doesn't (never forced), the push took too long,
 * or it failed another way (Q6, Q11d).
 */
export type PushProblem = 'auth' | 'rejected' | 'timeout' | 'failed';
export type Pushed = { ok: true; head: string; upToDate: boolean } | { ok: false; problem: PushProblem };

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
  /** Where origin's `branch` was at the last fetch or push, from this computer; null when git doesn't know. */
  onOrigin(worktree: string, branch: string): Promise<string | null>;
  /**
   * Commits everything not committed yet (`add -A`, so ignored files stay out) in one commit with `message`, made
   * with your git name, email and signing (Q6). git never makes up a name: without one it's `no_identity`.
   */
  commit(worktree: string, message: string): Promise<Committed>;
  /**
   * Pushes `branch` to origin under the same name, and only it: never forced, so a branch on origin with commits
   * the worktree doesn't have stays as it is (`rejected`). Your own git login signs in, never asking for a password.
   * `detached`: the worktree has no branch of its own (your pull request's, spec 031), so its HEAD goes to `branch`.
   */
  push(worktree: string, branch: string, options?: { detached?: boolean }): Promise<Pushed>;
}

export interface BranchGitOptions {
  /** From `gitEnvironment()`. */
  env: Readonly<Record<string, string>>;
  /** How long one read may take; 10 seconds. */
  timeoutMs?: number;
  /** How long a commit may take, signing included; 60 seconds. */
  commitTimeoutMs?: number;
  /** How long a push may take; 2 minutes. */
  pushTimeoutMs?: number;
}

/** git's words when it has no name or email to commit with, in English (`LC_ALL=C`). */
const noIdentity = /please tell me who you are|empty ident name|unable to auto-detect email|no email was given/i;
/** git's words when a signature couldn't be made, by gpg, ssh or x509. */
const signingFailed = /failed to sign|signing failed|gpg failed|error: load key|ssh-keygen/i;

/** git's words when origin refused the push because it has commits this branch doesn't. */
const rejected = /\[rejected\]|non-fast-forward|fetch first/i;
/** git's words when it couldn't sign in to origin, or origin won't say the repository is there. */
const notSignedIn =
  /authentication failed|permission denied|could not read username|terminal prompts disabled|host key verification failed|repository not found|access denied|the requested url returned error: 403/i;

/** The words a git failure carries, read only to name the problem, then dropped. */
function wordsOf(error: unknown): string {
  return error instanceof Error ? error.message : '';
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

export function createBranchGit({
  env,
  timeoutMs = 10_000,
  commitTimeoutMs = 60_000,
  pushTimeoutMs = 120_000,
}: BranchGitOptions): BranchGit {
  function git(
    worktree: string,
    config: readonly string[] = [],
    signal: AbortSignal = AbortSignal.timeout(timeoutMs),
  ): SimpleGit {
    return simpleGit({
      baseDir: worktree,
      // A diff rewrites the index when a file's times changed and its text didn't, unless told not to (spec 013).
      config: ['core.hooksPath=/dev/null', 'diff.autoRefreshIndex=false', ...config],
      unsafe: { allowUnsafeHooksPath: true },
      allowEnvironment: ['GIT_TERMINAL_PROMPT'],
      abort: signal,
      // git's own words in English, so a failure can be told apart.
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

    async onOrigin(worktree, branch) {
      try {
        const commit = (
          await read(worktree, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`])
        ).trim();
        return commit === '' ? null : commit;
      } catch {
        return null;
      }
    },

    async commit(worktree, message) {
      try {
        await git(worktree).raw(['add', '-A']);
        const staged = paths(await git(worktree).raw(['diff', '--cached', '--name-only', '-z', '--no-ext-diff']));
        if (staged.length > 0) {
          // Your own name only: never one git makes up from this computer's name (Q6).
          await git(worktree, ['user.useConfigOnly=true'], AbortSignal.timeout(commitTimeoutMs)).raw([
            'commit',
            '--no-verify',
            '--quiet',
            '-m',
            message,
          ]);
        }
        return { ok: true, files: staged.length, head: (await read(worktree, ['rev-parse', 'HEAD'])).trim() };
      } catch (error) {
        const words = wordsOf(error);
        if (noIdentity.test(words)) return { ok: false, problem: 'no_identity' };
        if (signingFailed.test(words)) return { ok: false, problem: 'signing' };
        return { ok: false, problem: 'commit_failed' };
      }
    },

    async push(worktree, branch, { detached = false } = {}) {
      const signal = AbortSignal.timeout(pushTimeoutMs);
      const ref = `refs/heads/${branch}`;
      const from = detached ? 'HEAD' : ref;
      try {
        // The branch named on both sides, so nothing else on origin can change; no `--force`, ever.
        const said = await git(worktree, [], signal).raw([
          'push',
          '--porcelain',
          '--no-verify',
          'origin',
          `${from}:${ref}`,
        ]);
        const head = (await read(worktree, ['rev-parse', 'HEAD'])).trim();
        return { ok: true, head, upToDate: /^=\t/m.test(said) };
      } catch (error) {
        if (signal.aborted) return { ok: false, problem: 'timeout' };
        const words = wordsOf(error);
        if (rejected.test(words)) return { ok: false, problem: 'rejected' };
        if (notSignedIn.test(words)) return { ok: false, problem: 'auth' };
        return { ok: false, problem: 'failed' };
      }
    },
  };
}
