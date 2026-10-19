import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mergePaths, readLoginPath } from './login-path.ts';

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'devhub-login-path-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** A stand-in for the user's login shell: it gets `-ilc <command>`, like zsh or bash would. */
async function fakeShell(body: string): Promise<string> {
  const path = join(folder, 'shell');
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o755);
  return path;
}

describe('readLoginPath', () => {
  it("AC-10: reads the login shell's PATH, whatever its start-up files print around it", async () => {
    const shell = await fakeShell(
      ['echo "Welcome to your shell"', 'PATH="/opt/homebrew/bin:/usr/bin:/bin"', 'eval "$2"', 'echo "nvm: ready"'].join(
        '\n',
      ),
    );

    expect(await readLoginPath({ shell })).toBe('/opt/homebrew/bin:/usr/bin:/bin');
  });

  it("closes the shell's input, so a start-up file that asks a question can't hold Orynx up", async () => {
    const shell = await fakeShell(['read answer', 'PATH="/opt/homebrew/bin"', 'eval "$2"'].join('\n'));

    expect(await readLoginPath({ shell, timeoutMs: 2000 })).toBe('/opt/homebrew/bin');
  });

  it('gives up on a shell that takes longer than the limit', async () => {
    const shell = await fakeShell('sleep 5');
    const started = Date.now();

    expect(await readLoginPath({ shell, timeoutMs: 200 })).toBeNull();
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('returns nothing for a shell that fails, prints no PATH, or is missing', async () => {
    expect(await readLoginPath({ shell: await fakeShell('exit 1') })).toBeNull();
    expect(await readLoginPath({ shell: await fakeShell('echo "no path here"') })).toBeNull();
    expect(await readLoginPath({ shell: join(folder, 'no-such-shell') })).toBeNull();
    expect(await readLoginPath({ shell: null })).toBeNull();
  });
});

describe('mergePaths', () => {
  it("AC-10, AC-11: adds the login shell's folders after the PATH Orynx was started with", () => {
    expect(mergePaths('/usr/bin:/bin:/usr/sbin:/sbin', '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin')).toBe(
      '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin',
    );
  });

  it('AC-40: keeps a PATH a test put first, such as its fake gh, in front', () => {
    expect(mergePaths('/tmp/e2e/fake-gh:/usr/bin', '/opt/homebrew/bin:/tmp/e2e/fake-gh')).toBe(
      '/tmp/e2e/fake-gh:/usr/bin:/opt/homebrew/bin',
    );
  });

  it('keeps the PATH it was started with when the login shell gave none, and drops empty entries', () => {
    expect(mergePaths('/usr/bin::/bin', null)).toBe('/usr/bin:/bin');
    expect(mergePaths('', '/opt/homebrew/bin')).toBe('/opt/homebrew/bin');
  });
});
