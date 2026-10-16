import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

/** The only place that reads process.env (CLAUDE.md rule 9). Every key is in .env.example. */
const EnvSchema = z.object({
  DEVHUB_PORT: z.coerce.number().int().min(1).max(65_535).default(4317),
  DEVHUB_HOME: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export interface ServerConfig {
  port: number;
  /** Folder for runtime.json, the cache, session logs and worktrees. */
  home: string;
  logLevel: z.infer<typeof EnvSchema>['LOG_LEVEL'];
  pretty: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`DevHub settings are not valid (see .env.example):\n${problems}`);
  }
  const { DEVHUB_PORT, DEVHUB_HOME, LOG_LEVEL, NODE_ENV } = parsed.data;
  return {
    port: DEVHUB_PORT,
    home: DEVHUB_HOME === undefined || DEVHUB_HOME === '' ? join(homedir(), '.devhub') : DEVHUB_HOME,
    logLevel: LOG_LEVEL,
    pretty: NODE_ENV === 'development',
  };
}
