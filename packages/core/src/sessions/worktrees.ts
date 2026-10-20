import { realpath, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';

/**
 * The only file that runs git for a session (spec 011): it makes the branch and the worktree under
 * `<DEVHUB_HOME>/worktrees/` and never touches the folder's own checkout. Every command runs with the
 * environment `gitEnvironment()` builds (no password prompt) and with the repository's hooks switched
 * off, so making a worktree runs nothing the user didn't see. A failure comes back as a problem, never
 * as git's own words, which can hold paths and remote addresses.
 */

/** What a worktree will be: the branch to make, what it starts from, and whether that's on `origin`. */
export interface WorktreePlan {
  branch: string;
  /** `origin/main` for a remote default branch, else the folder's checked-out branch. */
  base: string;
  remote: boolean;
  /**
   * Your pull request's own branch (spec 031): `base` is `origin/<branch>`, and the worktree is a detached HEAD at
   * it, so no branch is made and the folder's own checkout may have that branch.
   */
  detach?: boolean;
}

export type WorktreeProblem =
  /** The folder is gone or isn't a git repository any more. */
  | { kind: 'folder' }
  /** A git command failed; `step` is safe to log. */
  | { kind: 'git'; step: 'prepare' | 'add' | 'remove' }
  /** Stop came while git was working. */
  | { kind: 'stopped' };

export type Prepared = { ok: true; plan: WorktreePlan } | { ok: false; problem: WorktreeProblem };
/** `startCommit` is what the new branch starts from: the Changes tab compares the worktree with it (spec 013, AC-4). */
export type Made = { ok: true; fetched: boolean; startCommit: string } | { ok: false; problem: WorktreeProblem };
export type Removed = { ok: true } | { ok: false; problem: WorktreeProblem };

export interface Worktrees {
  /** Finds the default branch and the first free branch name for this ticket (Q1, Q2). Fast: no network. */
  prepare(repo: string, key: string, signal?: AbortSignal): Promise<Prepared>;
  /**
   * Fetches the default branch when it's on `origin` (Q1a: the last fetched one if that fails), then makes
   * the branch from it in a new worktree at `path`. The branch doesn't track the default branch, so a later
   * push can't land on it.
   */
  make(repo: string, path: string, plan: WorktreePlan, signal?: AbortSignal): Promise<Made>;
  /**
   * Deletes the worktree with whatever is in it, and its branch (AC-10). A worktree or branch that's
   * already gone is fine. When the repository itself is gone, only the worktree folder is deleted, and
   * only when it's inside `root`.
   */
  remove(repo: string, path: string, branch: string | null): Promise<Removed>;
}

export interface WorktreesOptions {
  /** From `gitEnvironment()`. */
  env: Readonly<Record<string, string>>;
  /** `<DEVHUB_HOME>/worktrees`: the only folder whose contents this file ever deletes by itself. */
  root: string;
  /** How long a fetch may take before the last fetched branch is used instead; 20 seconds (Q1a). */
  fetchTimeoutMs?: number;
}

/** How many `feat/<KEY>-n` names to try before giving up. */
const mostBranchNames = 100;

export function createWorktrees({ env, root, fetchTimeoutMs = 20_000 }: WorktreesOptions): Worktrees {
  function git(repo: string, signal?: AbortSignal): SimpleGit {
    return simpleGit({
      baseDir: repo,
      // Hooks are the repository's own programs; making a worktree must not run them.
      config: ['core.hooksPath=/dev/null'],
      unsafe: { allowUnsafeHooksPath: true },
      allowEnvironment: ['GIT_TERMINAL_PROMPT'],
      ...(signal === undefined ? {} : { abort: signal }),
    }).env({ ...env });
  }

  async function isRepository(repo: string): Promise<boolean> {
    try {
      if (!(await stat(repo)).isDirectory()) return false;
      return (await git(repo).raw(['rev-parse', '--is-inside-work-tree'])).trim() === 'true';
    } catch {
      return false;
    }
  }

  /** `symbolic-ref --quiet` prints nothing when the ref isn't symbolic; simple-git doesn't count that as a failure. */
  async function symbolicRef(repo: string, ...args: string[]): Promise<string> {
    return (await git(repo).raw(['symbolic-ref', '--quiet', ...args])).trim();
  }

  async function defaultBase(repo: string): Promise<Omit<WorktreePlan, 'branch'>> {
    const remoteHead = await symbolicRef(repo, 'refs/remotes/origin/HEAD');
    if (remoteHead !== '') return { base: remoteHead.replace(/^refs\/remotes\//, ''), remote: true };
    // No origin/HEAD: the checked-out branch, or the checked-out commit when no branch is.
    const current = await symbolicRef(repo, '--short', 'HEAD');
    return { base: current === '' ? 'HEAD' : current, remote: false };
  }

  async function freeBranch(repo: string, key: string): Promise<string | null> {
    const refs = (await git(repo).raw(['for-each-ref', '--format=%(refname)', 'refs/heads/', 'refs/remotes/origin/']))
      .split('\n')
      .map((ref) => ref.trim());
    const taken = new Set(refs);
    for (let n = 1; n <= mostBranchNames; n++) {
      const name = n === 1 ? `feat/${key}` : `feat/${key}-${String(n)}`;
      if (!taken.has(`refs/heads/${name}`) && !taken.has(`refs/remotes/origin/${name}`)) return name;
    }
    return null;
  }

  return {
    async prepare(repo, key, signal) {
      if (!(await isRepository(repo))) return { ok: false, problem: { kind: 'folder' } };
      if (signal?.aborted) return { ok: false, problem: { kind: 'stopped' } };
      try {
        const base = await defaultBase(repo);
        const branch = await freeBranch(repo, key);
        if (branch === null) return { ok: false, problem: { kind: 'git', step: 'prepare' } };
        return { ok: true, plan: { branch, ...base } };
      } catch {
        return { ok: false, problem: { kind: 'git', step: 'prepare' } };
      }
    },

    async make(repo, path, plan, signal) {
      let fetched = false;
      if (plan.remote) {
        const limit = AbortSignal.timeout(fetchTimeoutMs);
        const either = signal === undefined ? limit : AbortSignal.any([signal, limit]);
        const name = plan.base.replace(/^origin\//, '');
        // A pull request's branch is fetched into its own remote ref, even where the folder fetches only main.
        const what = plan.detach === true ? `+refs/heads/${name}:refs/remotes/origin/${name}` : name;
        try {
          await git(repo, either).raw(['fetch', '--no-tags', 'origin', what]);
          fetched = true;
        } catch {
          // Offline, refused or too slow: the last fetched branch will do (Q1a), unless Stop came.
          if (signal?.aborted) return { ok: false, problem: { kind: 'stopped' } };
        }
      }
      try {
        await git(repo, signal).raw(
          plan.detach === true
            ? ['worktree', 'add', '--detach', path, plan.base]
            : ['worktree', 'add', '--no-track', '-b', plan.branch, path, plan.base],
        );
        const startCommit = (await git(path, signal).raw(['rev-parse', 'HEAD'])).trim();
        return { ok: true, fetched, startCommit };
      } catch {
        return { ok: false, problem: signal?.aborted ? { kind: 'stopped' } : { kind: 'git', step: 'add' } };
      }
    },

    async remove(repo, path, branch) {
      if (!(await isRepository(repo))) {
        if (!(await insideRoot(path))) return { ok: false, problem: { kind: 'git', step: 'remove' } };
        await rm(path, { recursive: true, force: true });
        return { ok: true };
      }
      try {
        // git lists a worktree by its real path.
        const listed = (await git(repo).raw(['worktree', 'list', '--porcelain'])).split('\n');
        if (listed.includes(`worktree ${await realOrSelf(path)}`)) {
          // Twice: also when the worktree is locked.
          await git(repo).raw(['worktree', 'remove', '--force', '--force', path]);
        }
        // A worktree folder you deleted yourself is still listed until it's pruned.
        await git(repo).raw(['worktree', 'prune']);
        if (branch !== null) {
          const branches = await git(repo).raw(['for-each-ref', '--format=%(refname)', `refs/heads/${branch}`]);
          if (branches.trim() !== '') await git(repo).raw(['branch', '-D', branch]);
        }
        return { ok: true };
      } catch {
        return { ok: false, problem: { kind: 'git', step: 'remove' } };
      }
    },
  };

  /** Strictly inside `root`, once symlinks are followed: never `root` itself, never anywhere else. */
  async function insideRoot(path: string): Promise<boolean> {
    const [real, top] = await Promise.all([realOrSelf(path), realOrSelf(root)]);
    const inside = relative(top, real);
    return inside !== '' && !inside.startsWith('..') && !isAbsolute(inside);
  }
}

/** The real path, or the path itself when it doesn't exist (its parent's real path, then). */
async function realOrSelf(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    try {
      return resolve(await realpath(dirname(path)), relative(dirname(path), path));
    } catch {
      return resolve(path);
    }
  }
}
