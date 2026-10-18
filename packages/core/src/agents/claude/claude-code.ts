import { execFile } from 'node:child_process';
import { access, constants, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import type { ClaudeLogin } from '@devhub/contracts';
import { agentEnvironment } from '../agent-environment.ts';
import { readAuthStatus } from './map.ts';

/**
 * The only file in DevHub that starts Claude Code (spec 010): the copy that ships inside
 * `@anthropic-ai/claude-agent-sdk`, never a `claude` found on the PATH (Q2c). It runs one read-only
 * command, `auth status --json`, which reads the login on this computer and sends no prompt. Its
 * output never leaves this file: a failure keeps only its kind and exit code (AC-6).
 */

export type ClaudeCodeProblem =
  /** No program at the path, or one that can't be run. */
  | { kind: 'missing' }
  /** It exited with an error and printed no answer DevHub can read. */
  | { kind: 'failed'; exitCode: number | null }
  /** It exited 0 but printed something that isn't the expected JSON. */
  | { kind: 'unreadable' }
  | { kind: 'timeout' };

export type ClaudeCodeAnswer =
  { ok: true; login: Exclude<ClaudeLogin, { state: 'error' }> } | { ok: false; problem: ClaudeCodeProblem };

export interface ClaudeCode {
  readonly timeoutMs: number;
  /** The program, if it's there and can be run. It's never run to find out. */
  find(): Promise<string | null>;
  /** Runs `<program> auth status --json`. */
  authStatus(): Promise<ClaudeCodeAnswer>;
}

export interface ClaudeCodeOptions {
  /**
   * The program to run, as an absolute path: the host passes the SDK's own ({@link findSdkClaudeCode})
   * and the e2e run a fake. Null finds nothing, so nothing can start the real Claude Code by accident.
   */
  program: string | null;
  /** The host's environment. Only {@link agentEnvironment}'s allow list of it reaches the program. */
  env: Readonly<Record<string, string | undefined>>;
  /**
   * Where the check runs: a folder only you can open, made with mode 0700 when it's missing. Never a
   * shared one such as `/tmp`, where another account could leave `.claude` settings that change the
   * answer. The host passes {@link claudeWorkFolder}.
   */
  workFolder: string;
  /** How long the check may take; 10 seconds by default (spec 010). */
  timeoutMs?: number;
}

const sdkPackage = '@anthropic-ai/claude-agent-sdk';

export interface SdkTarget {
  platform?: NodeJS.Platform | (string & {});
  arch?: string;
}

/**
 * Where the SDK's own Claude Code is for this computer, looked up the way the SDK looks it up: in the
 * platform package it installs beside itself (`@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`).
 * Nothing is run. Null when no package for this platform is installed.
 */
export function findSdkClaudeCode({ platform = process.platform, arch = process.arch }: SdkTarget = {}): string | null {
  // pnpm keeps the platform package beside the SDK, not beside core, so look from the SDK's folder.
  const fromSdk = createRequire(createRequire(import.meta.url).resolve(sdkPackage));
  const ext = platform === 'win32' ? '.exe' : '';
  const packages =
    platform === 'linux'
      ? [`${sdkPackage}-linux-${arch}`, `${sdkPackage}-linux-${arch}-musl`]
      : [`${sdkPackage}-${platform}-${arch}`];
  for (const name of packages) {
    try {
      return fromSdk.resolve(`${name}/claude${ext}`);
    } catch {
      // Not installed for this platform: try the next.
    }
  }
  return null;
}

async function isProgram(path: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** `<DEVHUB_HOME>/claude-check`: Orynx's own folder for the login check to run in. */
export function claudeWorkFolder(home: string): string {
  return join(home, 'claude-check');
}

export function createClaudeCode({ program, env, workFolder, timeoutMs = 10_000 }: ClaudeCodeOptions): ClaudeCode {
  // The check needs no analytics, and nothing else Claude Code would send on its own, so it sends none.
  const programEnv = { ...agentEnvironment(env), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };

  async function find(): Promise<string | null> {
    // A relative path would be looked up from wherever DevHub runs.
    if (program === null || !isAbsolute(program)) return null;
    return (await isProgram(program)) ? program : null;
  }

  function run(path: string): Promise<ClaudeCodeAnswer> {
    return new Promise((resolve) => {
      const fail = (problem: ClaudeCodeProblem) => {
        resolve({ ok: false, problem });
      };
      try {
        execFile(
          path,
          ['auth', 'status', '--json'],
          {
            env: programEnv,
            // Not DevHub's folder or a repository's: Claude Code reads the .claude settings where it runs.
            cwd: workFolder,
            // SIGKILL, so a program stuck on a prompt can't keep the check waiting. An answer is under 1 KB.
            timeout: timeoutMs,
            killSignal: 'SIGKILL',
            windowsHide: true,
            maxBuffer: 64 * 1024,
            encoding: 'utf8',
          },
          (error, stdout) => {
            if (error === null) {
              const login = readAuthStatus(stdout, 0);
              if (login === null) fail({ kind: 'unreadable' });
              else resolve({ ok: true, login });
            } else if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
              fail({ kind: 'unreadable' });
            } else if (error.killed && error.signal === 'SIGKILL') {
              fail({ kind: 'timeout' });
            } else if (error.code === 'ENOENT' || error.code === 'EACCES') {
              // The program went away, or stopped being runnable, after find() looked.
              fail({ kind: 'missing' });
            } else if (typeof error.code === 'number') {
              // Signed out is exit 1 with the JSON; any other exit, or exit 1 without it, failed.
              const login = readAuthStatus(stdout, error.code);
              if (login === null) fail({ kind: 'failed', exitCode: error.code });
              else resolve({ ok: true, login });
            } else {
              fail({ kind: 'failed', exitCode: null });
            }
          },
        );
      } catch {
        // Some files can't be started at all, such as one with no #! line or a build for another
        // processor (ENOEXEC, EBADARCH): execFile throws those at once instead of calling back.
        fail({ kind: 'missing' });
      }
    });
  }

  return {
    timeoutMs,
    find,
    async authStatus() {
      const path = await find();
      if (path === null) return { ok: false, problem: { kind: 'missing' } };
      try {
        await mkdir(workFolder, { recursive: true, mode: 0o700 });
      } catch {
        return { ok: false, problem: { kind: 'failed', exitCode: null } };
      }
      return run(path);
    },
  };
}
