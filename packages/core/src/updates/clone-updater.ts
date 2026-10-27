import { execFile, spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, sep } from 'node:path';
import { promisify } from 'node:util';
import type { RunningVersion, UpdateProgress } from '@devhub/contracts';
import type { UpdateHost } from './update-service.ts';
import { readDescribe } from './versions.ts';

const run = promisify(execFile);

/** How a clone runs: as the service `./install.sh` set up, or started by hand with `pnpm start` (null). */
export type CloneService = 'launchd' | 'systemd' | null;

export interface CloneUpdaterOptions {
  /** The clone the hub was built from. */
  folder: string;
  service: CloneService;
  /** DEVHUB_HOME, where `update.log` goes. */
  home: string;
  /** What git and `./install.sh` run with: your environment, without Orynx's own settings. */
  env: Readonly<Record<string, string>>;
  /** Your home folder, which the page shows as `~`. The OS's by default. */
  userHome?: string;
}

/**
 * The update, in a shell of its own: everything it prints goes to the log, replacing the last one, and it has no
 * terminal, so a step that would ask for a password fails instead of waiting for one (Risks).
 */
const script = 'exec >"$1" 2>&1 </dev/null; git pull --ff-only && exec ./install.sh';

/**
 * What starts the update apart from the hub, so the service's restart at the end of `./install.sh` doesn't stop it
 * (Risks): its own process group on macOS, where launchd stops the job's group, and a unit of its own on Linux,
 * where systemd stops the whole of the hub's. `--wait` keeps systemd-run until it ends, with its exit code.
 */
export function runnerCommand({
  service,
  folder,
  log,
  env,
}: {
  service: CloneService;
  folder: string;
  log: string;
  env: Readonly<Record<string, string>>;
}): [string, string[]] {
  const shell = ['-c', script, 'orynx-update', log];
  if (service !== 'systemd') return ['/bin/sh', shell];
  const setenv = Object.entries(env).map(([name, value]) => `--setenv=${name}=${value}`);
  return [
    'systemd-run',
    ['--user', '--collect', '--quiet', '--wait', `--working-directory=${folder}`, ...setenv, '/bin/sh', ...shell],
  ];
}

/** A folder as people read it: `~/Code/orynx` rather than `/Users/you/Code/orynx`. */
function shown(path: string, home: string): string {
  return path === home || path.startsWith(`${home}${sep}`) ? `~${path.slice(home.length)}` : path;
}

/**
 * An installed clone's updates (spec 045, Q3): its version from git, then on Update `git pull --ff-only` and
 * `./install.sh`, refused while the clone has changes of its own or a branch that can't fast-forward (AC-27). A
 * clone started by hand only shows the commands (AC-30).
 */
export async function createCloneUpdater({
  folder,
  service,
  home,
  env,
  userHome = homedir(),
}: CloneUpdaterOptions): Promise<UpdateHost> {
  // No prompt can be answered from here: git fails instead of waiting for a password.
  const gitEnv = { ...env, GIT_TERMINAL_PROMPT: '0' };
  const git = async (args: string[], timeout = 10_000) =>
    (await run('git', args, { cwd: folder, env: gitEnv, timeout, killSignal: 'SIGKILL' })).stdout;
  const log = join(home, 'update.log');
  const listeners = new Set<() => void>();
  let update: UpdateProgress = { state: 'idle' };

  function set(next: UpdateProgress): void {
    update = next;
    for (const listener of listeners) listener();
  }

  const described = await git(['describe', '--tags', '--match', 'v*', '--long']).catch(() =>
    git(['rev-parse', '--short', 'HEAD']).catch(() => ''),
  );
  const running: RunningVersion = readDescribe(described) ?? { release: null, commits: 0, commit: null };

  return {
    kind: service === null ? 'by_hand' : 'service',
    folder: shown(folder, userHome),
    running,
    state: () => ({ action: service === null ? 'commands' : 'update', update }),

    async update() {
      if (service === null) return;
      if ((await git(['status', '--porcelain', '--untracked-files=no'])).trim() !== '') {
        set({ state: 'refused', reason: 'changes' });
        return;
      }
      try {
        await git(['fetch', '--quiet'], 60_000);
      } catch (error) {
        const said = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
        await writeFile(log, `git fetch failed.\n${said}`);
        set({ state: 'failed', log: shown(log, userHome) });
        return;
      }
      const fastForward = await git(['merge-base', '--is-ancestor', 'HEAD', '@{upstream}']).then(
        () => true,
        () => false,
      );
      if (!fastForward) {
        set({ state: 'refused', reason: 'diverged' });
        return;
      }

      set({ state: 'updating' });
      const runEnv = { ...gitEnv, DEVHUB_HOME: home };
      const [program, args] = runnerCommand({ service, folder, log, env: runEnv });
      const runner = spawn(program, args, { cwd: folder, env: runEnv, detached: true, stdio: 'ignore' });
      const failed = () => {
        set({ state: 'failed', log: shown(log, userHome) });
      };
      runner.once('error', failed);
      // A success restarts the service, which ends this hub; the old one never restarts itself after a failure.
      runner.once('exit', (code) => {
        if (code !== 0) failed();
      });
      runner.unref();
    },

    restart: () => Promise.resolve(),

    watch(changed) {
      listeners.add(changed);
      return () => listeners.delete(changed);
    },
  };
}
