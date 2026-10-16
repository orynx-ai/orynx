import { execFile } from 'node:child_process';

export interface GitUserNameOptions {
  /** Read this config file instead of the user's global git config (tests). */
  configFile?: string;
  /** The git binary; `git` on the PATH by default. */
  git?: string;
  timeoutMs?: number;
}

/**
 * The name the user gave git (`git config --global user.name`), for the sidebar footer
 * until a Jira or GitHub connection knows better. Any failure means "no name", never an error.
 */
export function readGitUserName(options: GitUserNameOptions = {}): Promise<string | null> {
  const scope = options.configFile === undefined ? ['--global'] : ['--file', options.configFile];
  return new Promise((resolve) => {
    execFile(
      options.git ?? 'git',
      ['config', ...scope, '--get', 'user.name'],
      // SIGKILL, so a git that ignores SIGTERM cannot leave the status waiting forever.
      { timeout: options.timeoutMs ?? 2000, killSignal: 'SIGKILL', windowsHide: true },
      (error, stdout) => {
        const name = error === null ? stdout.trim() : '';
        resolve(name === '' ? null : name);
      },
    );
  });
}
