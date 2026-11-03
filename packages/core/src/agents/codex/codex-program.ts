import { execFile } from 'node:child_process';
import { access, constants, stat } from 'node:fs/promises';
import { delimiter, isAbsolute, join } from 'node:path';

/**
 * Finding the Codex already on this computer (spec 052, Q1): Orynx ships none. `DEVHUB_CODEX` names one, or `codex` is
 * looked up on the PATH, which the desktop app takes from your login shell. It must be Codex 0.166 or later, the
 * version Orynx's protocol and sandbox profile were read from.
 */

async function runnable(path: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export interface FindCodexOptions {
  /** `DEVHUB_CODEX`; it must be an absolute path. */
  configured: string | null;
  /** The PATH to look in when nothing is configured. */
  searchPath: string;
}

export async function findCodex({ configured, searchPath }: FindCodexOptions): Promise<string | null> {
  if (configured !== null) return isAbsolute(configured) && (await runnable(configured)) ? configured : null;
  for (const folder of searchPath.split(delimiter)) {
    // A relative PATH entry would be looked up from wherever Orynx runs.
    if (folder === '' || !isAbsolute(folder)) continue;
    const program = join(folder, 'codex');
    if (await runnable(program)) return program;
  }
  return null;
}

/** What `codex --version` says, as `major.minor.patch`; null when it fails or prints something else. */
export function codexVersion(program: string, env: Readonly<Record<string, string>>): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      program,
      ['--version'],
      { env, timeout: 10_000, killSignal: 'SIGKILL', windowsHide: true, maxBuffer: 4096, encoding: 'utf8' },
      (error, stdout) => {
        const version = /^codex-cli (\d+\.\d+\.\d+)/m.exec(stdout);
        resolve(error === null && version !== null ? (version[1] ?? null) : null);
      },
    );
  });
}

/** Codex 0.166 or later. */
export function supportsCodex(version: string): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number);
  return major > 0 || minor >= 166;
}
