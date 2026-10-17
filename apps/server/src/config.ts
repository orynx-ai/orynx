import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { z } from 'zod';
import type { IntegrationId } from '@devhub/contracts';
import type { EnvTokens } from '@devhub/core';

/** The only place that reads process.env (CLAUDE.md rule 9). Every key is in .env.example. */
const EnvSchema = z.object({
  DEVHUB_PORT: z.coerce.number().int().min(1).max(65_535).default(4317),
  DEVHUB_HOME: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DEVHUB_TOKENS_FROM_ENV: z.enum(['true', 'false']).default('false'),
  DEVHUB_JIRA_API_TOKEN: z.string().optional(),
  DEVHUB_GITHUB_TOKEN: z.string().optional(),
  DEVHUB_SLACK_USER_TOKEN: z.string().optional(),
  DEVHUB_KEYCHAIN: z.enum(['os', 'memory']).default('os'),
});

/** Settings read from the shell only, never from `.env`: a file must not decide which program DevHub starts. */
const ShellSchema = z.object({ PATH: z.string().default('') });

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
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`DevHub settings are not valid (see .env.example):\n${problems}`);
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
    ghSearchPath: ShellSchema.parse(env).PATH,
  };
}
