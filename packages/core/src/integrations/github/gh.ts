import { execFile } from 'node:child_process';
import { access, constants, stat } from 'node:fs/promises';
import { delimiter, join } from 'node:path';

/**
 * The only file in DevHub that starts gh, GitHub's command-line tool (integration-adapter skill). It
 * runs one read-only command, `gh auth token`, and keeps the token only for the call that asked: DevHub
 * never stores a copy (spec 004, Q2). gh's output never leaves this file, and a failure keeps only the
 * exit code.
 */

export type GhProblem =
  /** No executable gh on the search path. */
  | { kind: 'gh_missing' }
  /** gh has no login for github.com. */
  | { kind: 'gh_signed_out' }
  /** gh failed some other way, or printed something that isn't one token. */
  | { kind: 'gh_failed'; exitCode: number | null }
  | { kind: 'gh_timeout' };

export type GhToken = { ok: true; token: string } | { ok: false; problem: GhProblem };

export interface GhCli {
  readonly timeoutMs: number;
  /** Where gh is, found by looking through the search path. gh is never run to find it. */
  find(): Promise<string | null>;
  /** Runs `gh auth token --hostname github.com` from the gh that {@link find} finds. */
  token(): Promise<GhToken>;
}

export interface GhCliOptions {
  /**
   * Folders to look in, joined like PATH. The host passes its PATH; tests pass a folder with a fake gh.
   * Empty finds nothing, so nothing can start the real gh by accident.
   */
  searchPath: string;
  /** How long gh may take; 5 seconds by default (spec 004). */
  timeoutMs?: number;
}

const program = process.platform === 'win32' ? 'gh.exe' : 'gh';
// Spec 002's rule for a token: one line, no spaces, at most 4096 characters.
const oneToken = /^\S{1,4096}$/;
// What gh 2.x says on stderr when it has no login for the host.
const signedOut = /no oauth token/i;

async function isProgram(path: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function createGhCli({ searchPath, timeoutMs = 5000 }: GhCliOptions): GhCli {
  async function find(): Promise<string | null> {
    for (const folder of searchPath.split(delimiter)) {
      if (folder === '') continue;
      const path = join(folder, program);
      if (await isProgram(path)) return path;
    }
    return null;
  }

  function run(path: string): Promise<GhToken> {
    return new Promise((resolve) => {
      execFile(
        path,
        ['auth', 'token', '--hostname', 'github.com'],
        // SIGKILL, so a gh stuck on a prompt can't keep the check waiting. A token is small; more is wrong.
        { timeout: timeoutMs, killSignal: 'SIGKILL', windowsHide: true, maxBuffer: 64 * 1024, encoding: 'utf8' },
        (error, stdout, stderr) => {
          if (error === null) {
            const token = stdout.trim();
            resolve(
              oneToken.test(token) ? { ok: true, token } : { ok: false, problem: { kind: 'gh_failed', exitCode: 0 } },
            );
          } else if (error.killed && error.signal === 'SIGKILL' && error.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
            resolve({ ok: false, problem: { kind: 'gh_timeout' } });
          } else if (signedOut.test(stderr)) {
            resolve({ ok: false, problem: { kind: 'gh_signed_out' } });
          } else {
            const exitCode = typeof error.code === 'number' ? error.code : null;
            resolve({ ok: false, problem: { kind: 'gh_failed', exitCode } });
          }
        },
      );
    });
  }

  return {
    timeoutMs,
    find,
    async token() {
      const path = await find();
      return path === null ? { ok: false, problem: { kind: 'gh_missing' } } : run(path);
    },
  };
}
