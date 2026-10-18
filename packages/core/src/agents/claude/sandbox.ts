import { access, constants, stat } from 'node:fs/promises';
import { delimiter, isAbsolute, join } from 'node:path';
import type { SandboxSettings } from '@anthropic-ai/claude-agent-sdk';

/**
 * Claude Code's own sandbox, which every command in a session runs in (spec 012, Q2a). A command's text
 * can't be trusted: an allow-listed `npm test` runs whatever Claude wrote into the tests. So the sandbox,
 * not the text, keeps a command from Orynx's session token (`runtime.json`), its keychain items, the
 * network (Orynx on 127.0.0.1 too) and every folder but the worktree. Where it can't run, a session gets
 * no commands at all (Q2b).
 */

export interface SandboxCheck {
  platform: NodeJS.Platform;
  /** The PATH to look for bubblewrap and socat in, from the host's environment. */
  searchPath: string;
  /** Where macOS keeps `sandbox-exec`. */
  sandboxExec?: string;
}

async function runnable(path: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function onPath(name: string, searchPath: string): Promise<boolean> {
  for (const folder of searchPath.split(delimiter)) {
    // A relative PATH entry would be looked up from wherever Orynx runs.
    if (folder === '' || !isAbsolute(folder)) continue;
    if (await runnable(join(folder, name))) return true;
  }
  return false;
}

/** Whether Claude Code's sandbox can run here: Seatbelt on macOS, bubblewrap and socat on Linux, nothing else. */
export async function sandboxAvailable({
  platform,
  searchPath,
  sandboxExec = '/usr/bin/sandbox-exec',
}: SandboxCheck): Promise<boolean> {
  if (platform === 'darwin') return runnable(sandboxExec);
  if (platform === 'linux') return (await onPath('bwrap', searchPath)) && (await onPath('socat', searchPath));
  return false;
}

export interface SandboxPlaces {
  platform: NodeJS.Platform;
  /** The session's worktree: the only folder a command may write to, besides the temporary one. */
  worktree: string;
  /** DEVHUB_HOME: `runtime.json` with the session token, `settings.json`, the sessions, the cache. */
  devhubHome: string;
  /** The person's home folder, where the keychain's files are. */
  home: string;
  /** The temporary folder, which tools such as test runners need. */
  temporary: string;
}

/** Where the OS keeps the keychain's own files. */
function keychainFolder(platform: NodeJS.Platform, home: string): string {
  return platform === 'darwin' ? join(home, 'Library', 'Keychains') : join(home, '.local', 'share', 'keyrings');
}

/**
 * The SDK's `sandbox` option for one session. Every command still comes to Orynx's `canUseTool`
 * (`autoAllowBashIfSandboxed: false`), and nothing runs unsandboxed by surprise (`failIfUnavailable`).
 * A command may ask to run outside the sandbox, which always asks you (Q3), so an allowed network
 * command can run once.
 */
export function sandboxSettings({ platform, worktree, devhubHome, home, temporary }: SandboxPlaces): SandboxSettings {
  return {
    enabled: true,
    failIfUnavailable: true,
    autoAllowBashIfSandboxed: false,
    allowUnsandboxedCommands: true,
    network: {
      allowedDomains: [],
      strictAllowlist: true,
      allowLocalBinding: false,
      allowAllUnixSockets: false,
    },
    filesystem: {
      allowWrite: [worktree, temporary],
      // The worktree is under DEVHUB_HOME, so it alone is opened again.
      denyRead: [devhubHome, keychainFolder(platform, home)],
      allowRead: [worktree],
    },
  };
}
