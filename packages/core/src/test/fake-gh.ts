import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';

/** A token the fake gh hands out. It must never show up in a log, a response or an event. */
export const ghToken = 'fake-gh-token-for-tests';

/** What the fake gh does when it runs: print a token, or behave like a gh that can't give one. */
export type FakeGhBehaviour =
  | { kind: 'signed_in'; token?: string }
  /** What gh 2.x prints and does when it has no login for the host. */
  | { kind: 'signed_out' }
  | { kind: 'fails'; exitCode: number; stderr: string }
  | { kind: 'slow' }
  /** Exits 0 but prints something that isn't one token. */
  | { kind: 'prints'; stdout: string };

function body(behaviour: FakeGhBehaviour): string {
  switch (behaviour.kind) {
    case 'signed_in':
      return `printf '%s\\n' '${behaviour.token ?? ghToken}'`;
    case 'signed_out':
      return "echo 'no oauth token found for github.com' >&2\nexit 1";
    case 'fails':
      return `echo '${behaviour.stderr}' >&2\nexit ${String(behaviour.exitCode)}`;
    case 'slow':
      // exec, so the kill that ends a slow gh ends the sleep too.
      return 'exec sleep 30';
    case 'prints':
      return `printf '%s' '${behaviour.stdout}'`;
  }
}

/** The one fake gh program every test folder links to. */
const sharedGh = join(import.meta.dirname, 'fake-gh', 'gh');

export interface FakeGhFolder {
  /** The folder, to pass as gh's search path. */
  dir: string;
  /** Puts a `gh` into the folder that behaves as asked. Call it again to change how it behaves. */
  install(behaviour: FakeGhBehaviour): Promise<void>;
  /** The arguments of each run so far, one array per run. Empty when gh never ran. */
  runs(): Promise<string[][]>;
}

/**
 * gh is an outside program, so tests fake it the honest way: a real executable in a temp folder that
 * DevHub finds and starts like the real one. Each test gets a fresh folder, removed afterwards.
 *
 * The `gh` in each folder is a symlink to one shared script. macOS checks every new program the first
 * time it runs, one at a time, about 0.2 s each: a fresh script per test made a parallel run wait for
 * seconds, past gh's timeout.
 */
export function useFakeGhFolder(): () => Promise<FakeGhFolder> {
  const folders: string[] = [];
  afterEach(async () => {
    await Promise.all(folders.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  return async () => {
    const dir = await mkdtemp(join(tmpdir(), 'devhub-fake-gh-'));
    folders.push(dir);
    const log = join(dir, 'runs.log');
    return {
      dir,
      async install(behaviour) {
        await writeFile(join(dir, 'behaviour.sh'), `${body(behaviour)}\n`);
        await symlink(sharedGh, join(dir, 'gh')).catch((error: unknown) => {
          if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
        });
      },
      async runs() {
        let text: string;
        try {
          text = await readFile(log, 'utf8');
        } catch {
          return [];
        }
        return text
          .split('\n')
          .filter((line) => line !== '')
          .map((line) => line.split(' '));
      },
    };
  };
}
