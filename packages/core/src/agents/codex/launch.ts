import { join } from 'node:path';
import { keychainFolder } from '../claude/sandbox.ts';

/**
 * How Orynx starts `codex app-server` (spec 052): `-c` overrides, which sit above `~/.codex/config.toml`, so none of
 * your Codex settings decides what a session may do (Q3).
 *
 * - `untrusted`, answered by you: every command no exec-policy rule allows, and every edit, comes to Orynx first.
 * - The `orynx` profile hides `DEVHUB_HOME` (all but the worktree), the keychain and `~/.codex` from commands, and
 *   writes only in the worktree and the temporary folder, with no network. A profile that denies a read can never be
 *   left: Codex keeps even an allowed escalation inside it (spec 052, part C).
 * - No hooks, notify command, web search, sub-agents, analytics or update check.
 *
 * MCP servers merge rather than override, so the adapter turns off each one `config/read` lists.
 */

/** A TOML basic string: JSON's escapes are TOML's, so a quote in a path can't end the string. */
const toml = (text: string) => JSON.stringify(text);

/** For any app-server Orynx starts. */
const always = [
  ['approval_policy', toml('untrusted')],
  ['approvals_reviewer', toml('user')],
  ['features.hooks', 'false'],
  ['features.multi_agent', 'false'],
  ['notify', '[]'],
  ['web_search', toml('disabled')],
  ['analytics.enabled', 'false'],
  ['check_for_update_on_startup', 'false'],
] as const;

function args(pairs: readonly (readonly [string, string])[]): string[] {
  return ['app-server', ...pairs.flatMap(([key, value]) => ['-c', `${key}=${value}`])];
}

/** The login check's app-server, which runs nothing. */
export const codexCheckArgs: readonly string[] = args(always);

export interface CodexPlaces {
  platform: NodeJS.Platform;
  /** Where Codex works: the session's worktree, or for an Ask the folder it reads. */
  worktree: string;
  devhubHome: string;
  home: string;
  temporary: string;
  /** An Ask: its folder is only read, since it may be your own checkout. */
  readOnly?: boolean;
}

export function codexSessionArgs({ platform, worktree, devhubHome, home, temporary, readOnly }: CodexPlaces): string[] {
  // The more specific entry wins, so the worktree under DEVHUB_HOME is opened again.
  const filesystem = [
    [':root', 'read'],
    [devhubHome, 'deny'],
    [keychainFolder(platform, home), 'deny'],
    [join(home, '.codex'), 'deny'],
    [worktree, readOnly === true ? 'read' : 'write'],
    [temporary, 'write'],
  ]
    .map(([path = '', access = '']) => `${toml(path)}=${toml(access)}`)
    .join(',');
  return args([
    ...always,
    ['default_permissions', toml('orynx')],
    ['permissions.orynx.filesystem', `{${filesystem}}`],
    ['permissions.orynx.network.enabled', 'false'],
  ]);
}
