import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
      return 'sleep 30';
    case 'prints':
      return `printf '%s' '${behaviour.stdout}'`;
  }
}

export interface FakeGhFolder {
  /** The folder, to pass as gh's search path. */
  dir: string;
  /** Writes an executable `gh` script into the folder that behaves as asked. */
  install(behaviour: FakeGhBehaviour): Promise<void>;
  /** The arguments of each run so far, one array per run. Empty when gh never ran. */
  runs(): Promise<string[][]>;
}

/**
 * gh is an outside program, so tests fake it the honest way: a real executable in a temp folder that
 * DevHub finds and starts like the real one. Each test gets a fresh folder, removed afterwards.
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
        const script = join(dir, 'gh');
        // Each run appends its arguments as one line, so a test can see what DevHub asked gh.
        await writeFile(script, `#!/bin/sh\necho "$*" >> '${log}'\n${body(behaviour)}\n`);
        await chmod(script, 0o755);
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
