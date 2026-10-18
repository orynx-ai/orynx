import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';

/** The account the fake Claude Code is signed in with. It must never show up in a log or an event. */
export const claudeEmail = 'fake-claude-user@company.example';
export const claudeOrganisation = 'Fake Claude Organisation';

/** What `claude auth status --json` prints: the fields DevHub reads, and some it doesn't. */
export function authStatus(fields: Record<string, unknown> = {}): string {
  const status = {
    loggedIn: true,
    authMethod: 'claude.ai',
    apiProvider: 'firstParty',
    analyticsDisabled: false,
    projectsDirectory: '/Users/you/.claude/projects',
    configDirectory: '/Users/you/.claude',
    email: claudeEmail,
    orgId: '00000000-0000-4000-8000-000000000000',
    orgName: claudeOrganisation,
    subscriptionType: 'enterprise',
    ...fields,
  };
  return `${JSON.stringify(status, null, 2)}\n`;
}

/** What the fake Claude Code does when it runs. */
export type FakeClaudeBehaviour =
  /** Signed in with a claude.ai company login. */
  | { kind: 'signed_in' }
  /** What Claude Code 2.x prints with no login: the JSON, then exit 1. */
  | { kind: 'signed_out' }
  /** Prints exactly this and exits with this code. */
  | { kind: 'prints'; stdout: string; exitCode: number }
  /** Prints nothing on stdout and exits with this code. */
  | { kind: 'crashes'; exitCode: number; stderr: string }
  /** Ends by a signal, as a crash in the program itself does, so there's no exit code. */
  | { kind: 'killed' }
  | { kind: 'slow' };

function output(behaviour: FakeClaudeBehaviour): { stdout: string; script: string } {
  switch (behaviour.kind) {
    case 'signed_in':
      return { stdout: authStatus(), script: 'cat "$here/stdout.txt"' };
    case 'signed_out':
      return {
        stdout: authStatus({
          loggedIn: false,
          authMethod: 'none',
          email: undefined,
          orgId: undefined,
          orgName: undefined,
        }),
        script: 'cat "$here/stdout.txt"\nexit 1',
      };
    case 'prints':
      return { stdout: behaviour.stdout, script: `cat "$here/stdout.txt"\nexit ${String(behaviour.exitCode)}` };
    case 'crashes':
      return { stdout: '', script: `echo '${behaviour.stderr}' >&2\nexit ${String(behaviour.exitCode)}` };
    case 'killed':
      return { stdout: '', script: 'kill -SEGV $$' };
    case 'slow':
      // exec, so the kill that ends a slow check ends the sleep too.
      return { stdout: '', script: 'exec sleep 30' };
  }
}

/** The one fake program every test folder links to. */
const sharedClaude = join(import.meta.dirname, 'fake-claude', 'claude');

/** For a Claude Code that is never found, so never runs anywhere. */
export const unusedWorkFolder = '/nonexistent/orynx-claude-check';

export interface FakeClaudeFolder {
  /** The fake program, to pass as the program DevHub runs. */
  program: string;
  /** A folder that doesn't exist yet, inside this test's own temp folder, for the check to run in. */
  workFolder: string;
  /** The folder the last run started in, with symlinks resolved. Null when it never ran. */
  lastWorkFolder(): Promise<string | null>;
  /** Says how the fake behaves from its next run on. */
  install(behaviour: FakeClaudeBehaviour): Promise<void>;
  /** The arguments of each run so far, one array per run. Empty when it never ran. */
  runs(): Promise<string[][]>;
  /** The environment of the last run, without the variables the shell sets itself. Null when it never ran. */
  lastEnvironment(): Promise<Record<string, string> | null>;
}

/** Set by sh itself, not passed in by DevHub. */
const setByShell = new Set(['PWD', 'OLDPWD', 'SHLVL', '_']);

/**
 * Claude Code is an outside program, so tests fake it the honest way, as `fake-gh.ts` does gh: a real
 * executable in a temp folder that DevHub starts like the real one. Each test gets a fresh folder,
 * removed afterwards, and a symlink to one shared script.
 */
export function useFakeClaudeFolder(): () => Promise<FakeClaudeFolder> {
  const folders: string[] = [];
  afterEach(async () => {
    await Promise.all(folders.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  return async () => {
    const dir = await mkdtemp(join(tmpdir(), 'devhub-fake-claude-'));
    folders.push(dir);
    const program = join(dir, 'claude');
    return {
      program,
      workFolder: join(dir, 'work', 'claude-check'),
      async lastWorkFolder() {
        const text = await readFile(join(dir, 'pwd.log'), 'utf8').catch(() => null);
        return text === null ? null : text.trim();
      },
      async install(behaviour) {
        const { stdout, script } = output(behaviour);
        await writeFile(join(dir, 'stdout.txt'), stdout);
        await writeFile(join(dir, 'behaviour.sh'), `${script}\n`);
        await symlink(sharedClaude, program).catch((error: unknown) => {
          if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
        });
      },
      async runs() {
        const text = await readFile(join(dir, 'runs.log'), 'utf8').catch(() => '');
        return text
          .split('\n')
          .filter((line) => line !== '')
          .map((line) => line.split(' '));
      },
      async lastEnvironment() {
        const text = await readFile(join(dir, 'env.log'), 'utf8').catch(() => null);
        if (text === null) return null;
        const env: Record<string, string> = {};
        for (const line of text.split('\n')) {
          const at = line.indexOf('=');
          if (at <= 0) continue;
          const name = line.slice(0, at);
          if (!setByShell.has(name)) env[name] = line.slice(at + 1);
        }
        return env;
      },
    };
  };
}
