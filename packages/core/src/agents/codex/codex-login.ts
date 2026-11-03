import { mkdir } from 'node:fs/promises';
import { z } from 'zod';
import type { CodexLogin } from '@devhub/contracts';
import type { EventBus } from '../../events/event-bus.ts';
import { createCheckedStatus } from '../../integrations/checked-status.ts';
import { startAppServer } from './app-server.ts';
import { codexVersion, supportsCodex } from './codex-program.ts';

/**
 * Codex's login, which Orynx only reads (spec 052), as it reads Claude's (spec 010): `account/read` in a short
 * `codex app-server` that sends no prompt and uses no quota. Asked at most once every 2 minutes, and at once by Check
 * again; a changed answer publishes `status.changed`. The email stays in memory, in the last answer.
 */
export interface CodexLoginService {
  /** Settings › Coding agent's Codex card. */
  read(): Promise<CodexLogin>;
  /** Check again: asks Codex now, or shares the check that's already running. */
  checkNow(): Promise<CodexLogin>;
  /** Whether sessions can start on Codex: signed in, whichever way. */
  connected(): Promise<boolean>;
}

/** Why a check failed: its kind alone, never what Codex printed, which can hold the account. */
export type CodexCheckProblem = { kind: 'failed' } | { kind: 'unreadable' };

export interface CodexLoginOptions {
  /** The Codex `findCodex()` found; null when there's none. */
  program: string | null;
  /** Codex's own environment allow list, the only one it gets. */
  env: Readonly<Record<string, string>>;
  /** `app-server` and Orynx's overrides, as a session starts it. */
  args: readonly string[];
  /** `<DEVHUB_HOME>/codex-check`, made 0700: not a repository's folder, whose `.codex` Codex would read. */
  workFolder: string;
  events: EventBus;
  onProblem?: (problem: CodexCheckProblem) => void;
  /** How long the whole check may take; 10 seconds. */
  timeoutMs?: number;
  /** The clock, in milliseconds. */
  now?: () => number;
}

/** `account/read`'s answer, as far as the card needs it. */
const AccountAnswerSchema = z.object({
  account: z.union([z.null(), z.looseObject({ type: z.string(), email: z.string().nullish() })]),
  requiresOpenaiAuth: z.boolean(),
});

const error: CodexLogin = { state: 'error' };

function loginFrom(answer: z.infer<typeof AccountAnswerSchema>): CodexLogin {
  const { account } = answer;
  if (account === null) return answer.requiresOpenaiAuth ? { state: 'signed_out' } : signedIn('other', null);
  if (account.type === 'chatgpt') return signedIn('chatgpt', account.email ?? null);
  return signedIn(account.type === 'apiKey' ? 'api_key' : 'other', null);
}

function signedIn(method: 'chatgpt' | 'api_key' | 'other', email: string | null): CodexLogin {
  return { state: 'signed_in', method, email: email === '' ? null : email };
}

export function createCodexLogin(options: CodexLoginOptions): CodexLoginService {
  const { program, env, args, workFolder, timeoutMs = 10_000 } = options;

  async function check(): Promise<CodexLogin> {
    if (program === null) return { state: 'not_installed' };
    const version = await codexVersion(program, env);
    if (version === null || !supportsCodex(version)) return { state: 'not_installed' };
    await mkdir(workFolder, { recursive: true, mode: 0o700 });
    const server = await startAppServer({ program, args, cwd: workFolder, env, startTimeoutMs: timeoutMs });
    try {
      const answer = AccountAnswerSchema.safeParse(
        await server.request('account/read', { refreshToken: false }, timeoutMs),
      );
      if (answer.success) return loginFrom(answer.data);
      options.onProblem?.({ kind: 'unreadable' });
      return error;
    } finally {
      await server.close(1_000);
    }
  }

  const checked = createCheckedStatus<undefined, CodexLogin>({
    // One login per computer, so one key.
    keyOf: () => 'codex',
    // A check that throws is a failed one: the card must still answer.
    check: () =>
      check().catch((): CodexLogin => {
        options.onProblem?.({ kind: 'failed' });
        return error;
      }),
    events: options.events,
    // Nothing settles or forgets this answer: there is no Connect or Disconnect.
    forgotten: error,
    now: options.now ?? Date.now,
  });

  return {
    read: () => checked.get(undefined),
    checkNow: () => checked.checkNow(undefined),
    async connected() {
      return (await checked.get(undefined)).state === 'signed_in';
    },
  };
}
