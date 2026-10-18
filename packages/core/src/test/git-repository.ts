import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach } from 'vitest';

const run = promisify(execFile);

/** Where git usually lives on macOS and Linux; tests never read the shell's own PATH (env-policy gate). */
export const gitSearchPath = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'].join(':');

/**
 * Real git repositories in a temporary folder, for the code that makes session worktrees (spec 011).
 * Never a real repository: each test gets a bare `origin` and a clone of it, and git reads no global or
 * system settings, so your own hooks, signing or aliases can't change a result.
 */
export interface TestRepositories {
  /** The temporary folder that holds everything; also the HOME the code under test gets. */
  root: string;
  /** A clone with `main` checked out, one commit, and `origin/HEAD` pointing at `origin/main`. */
  clone: string;
  /** The bare repository the clone fetches from. */
  origin: string;
  /** Where worktrees go, like `<DEVHUB_HOME>/worktrees`. */
  worktrees: string;
  /** The environment the code under test runs git with. */
  env: Record<string, string>;
  /** Runs git in `cwd` with the same isolated settings, and gives its output, trimmed. */
  git(cwd: string, ...args: string[]): Promise<string>;
  /** Adds a commit to `origin`'s `main` that the clone hasn't fetched yet, and gives its id. */
  commitInOrigin(file: string): Promise<string>;
}

export function useTestRepositories(): () => Promise<TestRepositories> {
  const made: string[] = [];
  afterEach(async () => {
    await Promise.all(made.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  return async () => {
    // Real paths, because macOS's temporary folder is a symlink and git reports real paths.
    const root = await realpath(await mkdtemp(join(tmpdir(), 'devhub-git-')));
    made.push(root);
    const env = {
      PATH: gitSearchPath,
      HOME: root,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    };
    await writeFile(join(root, '.gitconfig'), '[init]\n\tdefaultBranch = main\n');

    const git = async (cwd: string, ...args: string[]) => (await run('git', args, { cwd, env })).stdout.trim();

    const origin = join(root, 'origin.git');
    const seed = join(root, 'seed');
    const clone = join(root, 'web-app');
    const worktrees = join(root, 'devhub', 'worktrees');
    await mkdir(worktrees, { recursive: true });
    await git(root, 'init', '--bare', origin);
    await git(root, 'clone', origin, seed);
    await writeFile(join(seed, 'README.md'), '# web-app\n');
    await git(seed, 'add', '.');
    await git(seed, 'commit', '-m', 'first');
    await git(seed, 'push', 'origin', 'main');
    await git(root, 'clone', origin, clone);

    async function commitInOrigin(file: string) {
      await writeFile(join(seed, file), `${file}\n`);
      await git(seed, 'add', '.');
      await git(seed, 'commit', '-m', `add ${file}`);
      await git(seed, 'push', 'origin', 'main');
      return git(seed, 'rev-parse', 'HEAD');
    }

    return { root, clone, origin, worktrees, env, git, commitInOrigin };
  };
}
