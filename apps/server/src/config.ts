import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { z } from 'zod';
import type { IntegrationId } from '@devhub/contracts';
import { agentEnvironment, gitEnvironment, terminalEnvironment, type EnvTokens } from '@devhub/core';

/** The only place that reads process.env (CLAUDE.md rule 9). Every key is in .env.example. */
const EnvSchema = z.object({
  // 0 asks the OS for a free port: the desktop app's hub (spec 027, Q2).
  DEVHUB_PORT: z.coerce.number().int().min(0).max(65_535).default(4317),
  DEVHUB_HOME: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DEVHUB_TOKENS_FROM_ENV: z.enum(['true', 'false']).default('false'),
  DEVHUB_JIRA_API_TOKEN: z.string().optional(),
  DEVHUB_GITHUB_TOKEN: z.string().optional(),
  DEVHUB_SLACK_USER_TOKEN: z.string().optional(),
  DEVHUB_KEYCHAIN: z.enum(['os', 'memory']).default('os'),
  DEVHUB_SANDBOX: z.enum(['required', 'assume']).default('required'),
  DEVHUB_LAN: z.enum(['true', 'false']).default('false'),
  // ./install.sh sets it in the service it writes (spec 045); unset, the clone was started by hand.
  DEVHUB_SERVICE: z.enum(['launchd', 'systemd']).optional(),
  // A fake releases server in tests; GitHub's releases otherwise.
  DEVHUB_RELEASES_URL: z.url().optional(),
});

/** Settings read from the shell only, never from `.env`: a file must not decide which program DevHub starts. */
const ShellSchema = z.object({
  PATH: z.string().default(''),
  DEVHUB_CLAUDE_CODE: z.string().refine(isAbsolute, 'must be the full path of the program').optional(),
});

/** Which setting holds each tool's token when the `.env` fallback is on (spec 002, Q1). */
export const tokenKeys = {
  jira: 'DEVHUB_JIRA_API_TOKEN',
  github: 'DEVHUB_GITHUB_TOKEN',
  slack: 'DEVHUB_SLACK_USER_TOKEN',
} as const satisfies Record<IntegrationId, keyof z.infer<typeof EnvSchema>>;

export interface ServerConfig {
  port: number;
  /** Folder for runtime.json, the cache, session logs and worktrees. */
  home: string;
  logLevel: z.infer<typeof EnvSchema>['LOG_LEVEL'];
  pretty: boolean;
  /** Where tokens are saved: the OS keychain, or memory for the e2e run (spec 003). */
  keychain: z.infer<typeof EnvSchema>['DEVHUB_KEYCHAIN'];
  tokens: {
    /** DEVHUB_TOKENS_FROM_ENV: the user opted into keeping tokens in `.env`. */
    fromEnv: boolean;
    /** The `.env` tokens by tool. Empty unless `fromEnv` is on, so core never sees an unused one. */
    env: EnvTokens;
    /** Token settings that are set while `fromEnv` is off, so the terminal can say they are ignored. */
    ignored: string[];
  };
  /** Where to look for GitHub's gh (spec 004): the shell's PATH, never one written in `.env`. */
  ghSearchPath: string;
  /**
   * DEVHUB_CLAUDE_CODE from the shell, never from `.env`: the Claude Code to run for the login check
   * instead of the SDK's own (spec 010, Q10). The e2e run sets it to a fake. Null runs the SDK's.
   */
  claudeCode: string | null;
  /**
   * Whether Orynx checks that Claude Code's sandbox can run before giving sessions commands (spec 012,
   * Q2b): `required`, or `assume` for a fake Claude Code, as the e2e run uses. A real Claude Code still
   * refuses to run commands without a sandbox.
   */
  sandbox: z.infer<typeof EnvSchema>['DEVHUB_SANDBOX'];
  /** DEVHUB_LAN: also answer devices on your wifi at https://orynx.local, behind your Orynx password (specs 040, 043). */
  lan: boolean;
  /** How a clone runs (spec 045): the service ./install.sh set up, or null when started by hand. */
  service: 'launchd' | 'systemd' | null;
  /** DEVHUB_RELEASES_URL: where to look for releases instead of GitHub's, or null for GitHub's (spec 045). */
  releasesUrl: string | null;
  /** The part of the shell's environment Claude Code may see (spec 010, AC-10). Nothing from `.env`. */
  agentEnvironment: Record<string, string>;
  /** The same for the git that makes a session's worktree, with your SSH agent and no prompts (spec 011, Q8d). */
  gitEnvironment: Record<string, string>;
  /** What your shells in a session's Terminal get: your whole environment, less Orynx's settings (spec 036). */
  terminalEnvironment: Record<string, string>;
}

/** The `.env` next to `.env.example` at the repo root. The same path from `src/` (dev) and `dist/` (start). */
export const repoEnvFile = fileURLToPath(new URL('../../../.env', import.meta.url));

export interface EnvFile {
  text: string;
  /** Group or other users on this computer can read the file. */
  othersCanRead: boolean;
  /** One of the token settings has a value, whether or not DEVHUB_TOKENS_FROM_ENV is on. */
  holdsTokens: boolean;
}

/** Reads a `.env` file, or returns undefined when there is none. */
export function readEnvFile(path: string): EnvFile | undefined {
  try {
    const text = readFileSync(path, 'utf8');
    const settings = parseEnv(text);
    return {
      text,
      othersCanRead: (statSync(path).mode & 0o044) !== 0,
      holdsTokens: Object.values(tokenKeys).some((key) => (settings[key] ?? '') !== ''),
    };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function withoutEmpty(settings: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined && value !== ''));
}

/**
 * Removes the token settings from this process's environment once `loadConfig` has read them, so
 * no child process (git today, Claude later) inherits a token.
 */
export function forgetTokenSettings(env: NodeJS.ProcessEnv = process.env): void {
  for (const key of Object.values(tokenKeys)) Reflect.deleteProperty(env, key);
}

/**
 * Settings from the shell, then from the `.env` file's text. A variable set in the shell wins
 * over the file, and an empty value counts as not set, like the blank lines in .env.example.
 */
export function loadConfig({
  env = process.env,
  envFile,
}: { env?: NodeJS.ProcessEnv; envFile?: string } = {}): ServerConfig {
  const parsed = EnvSchema.safeParse({ ...withoutEmpty(parseEnv(envFile ?? '')), ...withoutEmpty(env) });
  const shell = ShellSchema.safeParse(withoutEmpty(env));
  if (!parsed.success || !shell.success) {
    const issues = [...(parsed.error?.issues ?? []), ...(shell.error?.issues ?? [])];
    const problems = issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Orynx settings are not valid (see .env.example):\n${problems}`);
  }
  const settings = parsed.data;
  const fromEnv = settings.DEVHUB_TOKENS_FROM_ENV === 'true';
  const tokens: EnvTokens = {};
  const ignored: string[] = [];
  for (const [tool, key] of Object.entries(tokenKeys) as [IntegrationId, (typeof tokenKeys)[IntegrationId]][]) {
    const value = settings[key];
    if (value === undefined) continue;
    if (fromEnv) tokens[tool] = value;
    else ignored.push(key);
  }
  return {
    port: settings.DEVHUB_PORT,
    home: settings.DEVHUB_HOME ?? join(homedir(), '.devhub'),
    logLevel: settings.LOG_LEVEL,
    pretty: settings.NODE_ENV === 'development',
    keychain: settings.DEVHUB_KEYCHAIN,
    tokens: { fromEnv, env: tokens, ignored },
    ghSearchPath: shell.data.PATH,
    claudeCode: shell.data.DEVHUB_CLAUDE_CODE ?? null,
    sandbox: settings.DEVHUB_SANDBOX,
    lan: settings.DEVHUB_LAN === 'true',
    service: settings.DEVHUB_SERVICE ?? null,
    releasesUrl: settings.DEVHUB_RELEASES_URL ?? null,
    agentEnvironment: agentEnvironment(env),
    gitEnvironment: gitEnvironment(env),
    terminalEnvironment: terminalEnvironment(env),
  };
}
