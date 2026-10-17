import type { EnvFile, ServerConfig } from './config.ts';

export interface Notice {
  level: 'info' | 'warn';
  message: string;
}

/**
 * What the terminal says at start about where tokens come from (spec 002, Q4). It names settings,
 * never their values.
 */
export function tokenNotices(
  tokens: Pick<ServerConfig['tokens'], 'fromEnv' | 'ignored'>,
  envFile: EnvFile | undefined,
): Notice[] {
  const notices: Notice[] = tokens.ignored.map((key) => ({
    level: 'warn',
    message: `${key} is set but not used. To use tokens from .env, set DEVHUB_TOKENS_FROM_ENV=true.`,
  }));
  if (tokens.fromEnv) {
    notices.push({ level: 'info', message: 'Tokens: OS keychain first, then .env (DEVHUB_TOKENS_FROM_ENV is on).' });
  }
  // A token in a readable file is exposed whether or not DevHub uses it.
  if (envFile?.othersCanRead === true && envFile.holdsTokens) {
    notices.push({
      level: 'warn',
      message: '.env holds tokens and other users on this computer can read it. Run: chmod 600 .env',
    });
  }
  return notices;
}
