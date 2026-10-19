import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

/** The only place in the desktop host that reads process.env (CLAUDE.md rule 9). Every key is in .env.example. */
const EnvSchema = z.object({
  DEVHUB_HOME: z.string().optional(),
  // A fake releases server in tests; GitHub Releases otherwise.
  DEVHUB_UPDATES_URL: z.url().optional(),
  PATH: z.string().default(''),
});

export interface DesktopConfig {
  /** DEVHUB_HOME, as the hub reads it: runtime.json and the log live here. */
  home: string;
  /** Where to look for updates, or null for this repo's GitHub Releases. */
  updatesUrl: string | null;
  /** The PATH the app was started with: from Finder, only the system's folders. */
  path: string;
  /** The whole environment, for the hub to read with its own config. */
  env: Record<string, string>;
}

function withoutEmpty(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== ''),
  );
}

export function loadConfig({ env = process.env }: { env?: NodeJS.ProcessEnv } = {}): DesktopConfig {
  const parsed = EnvSchema.safeParse(withoutEmpty(env));
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Orynx settings are not valid (see .env.example):\n${problems}`);
  }
  return {
    home: parsed.data.DEVHUB_HOME ?? join(homedir(), '.devhub'),
    updatesUrl: parsed.data.DEVHUB_UPDATES_URL ?? null,
    path: parsed.data.PATH,
    env: withoutEmpty(env),
  };
}
