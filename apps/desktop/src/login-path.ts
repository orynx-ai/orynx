import { spawn } from 'node:child_process';
import { delimiter } from 'node:path';

// The login shell's start-up files may print banners; the PATH is what sits between these two.
const start = '__ORYNX_PATH_START__';
const end = '__ORYNX_PATH_END__';

export interface LoginPathOptions {
  /** The user's login shell (`os.userInfo().shell`), or null when the system names none. */
  shell: string | null;
  timeoutMs?: number;
}

/**
 * The PATH the user's terminal would have. An app opened from Finder gets only the system's folders, so
 * gh, node and pnpm from Homebrew or nvm would be missing (spec 027, AC-10). Null when the shell fails,
 * takes longer than the limit or prints no PATH. The limit is 10 seconds: a zsh with nvm took 0.8 s warm
 * but over 5 s on its first start after login.
 */
export function readLoginPath({ shell, timeoutMs = 10_000 }: LoginPathOptions): Promise<string | null> {
  if (shell === null) return Promise.resolve(null);
  return new Promise((resolve) => {
    // stdin closed: a start-up file that asks a question gets no answer instead of waiting for one.
    // detached: the shell leads its own process group, so the limit also stops what its start-up files ran.
    const child = spawn(shell, ['-ilc', `printf '%s%s%s' '${start}' "$PATH" '${end}'`], {
      stdio: ['ignore', 'pipe', 'ignore'],
      detached: true,
    });
    const timer = setTimeout(() => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
      } catch {
        // Already gone.
      }
      resolve(null);
    }, timeoutMs);
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      output += chunk;
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const found = new RegExp(`${start}(.*?)${end}`, 's').exec(output)?.[1];
      resolve(code === 0 && found !== undefined && found !== '' ? found : null);
    });
  });
}

/** The PATH Orynx was started with, then every login-shell folder not already in it. */
export function mergePaths(started: string, login: string | null): string {
  const folders = [...started.split(delimiter), ...(login ?? '').split(delimiter)].filter((folder) => folder !== '');
  return [...new Set(folders)].join(delimiter);
}
