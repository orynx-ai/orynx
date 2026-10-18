import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';

/** What a fake picker does when it runs, as the real ones do. */
export type FakePickerBehaviour =
  | { kind: 'picks'; stdout: string }
  | { kind: 'cancels'; stderr?: string }
  | { kind: 'fails'; exitCode: number; stderr: string }
  | { kind: 'slow' };

function body(behaviour: FakePickerBehaviour): string {
  switch (behaviour.kind) {
    case 'picks':
      return `printf '%s' '${behaviour.stdout}'`;
    case 'cancels':
      return behaviour.stderr === undefined ? 'exit 1' : `echo '${behaviour.stderr}' >&2\nexit 1`;
    case 'fails':
      return `echo '${behaviour.stderr}' >&2\nexit ${String(behaviour.exitCode)}`;
    case 'slow':
      // exec, so the kill that closes a slow picker ends the sleep too.
      return 'exec sleep 30';
  }
}

const sharedPicker = join(import.meta.dirname, 'fake-picker', 'picker');

export interface FakePickerFolder {
  /** The folder, to pass as the picker's search path. */
  dir: string;
  /** Puts pickers with these names into the folder, each behaving as asked. */
  install(names: readonly string[], behaviour: FakePickerBehaviour): Promise<void>;
  /** Each run so far: the program's name, then its arguments. */
  runs(): Promise<string[]>;
}

/**
 * The folder pickers are outside programs, so tests fake them the honest way: real executables in a temp
 * folder that Orynx finds and starts like the real ones, never a real dialog on the screen.
 */
export function useFakePickerFolder(): () => Promise<FakePickerFolder> {
  const folders: string[] = [];
  afterEach(async () => {
    await Promise.all(folders.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  return async () => {
    const dir = await mkdtemp(join(tmpdir(), 'devhub-fake-picker-'));
    folders.push(dir);
    return {
      dir,
      async install(names, behaviour) {
        await writeFile(join(dir, 'behaviour.sh'), `${body(behaviour)}\n`);
        for (const name of names) {
          await symlink(sharedPicker, join(dir, name)).catch((error: unknown) => {
            if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
          });
        }
      },
      async runs() {
        const text = await readFile(join(dir, 'runs.log'), 'utf8').catch(() => '');
        return text.split('\n').filter((line) => line !== '');
      },
    };
  };
}
