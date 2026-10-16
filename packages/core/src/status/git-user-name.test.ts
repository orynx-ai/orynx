import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readGitUserName } from './git-user-name.ts';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'devhub-git-name-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function configFile(contents: string): Promise<string> {
  const file = join(dir, 'gitconfig');
  await writeFile(file, contents);
  return file;
}

describe('readGitUserName', () => {
  it('AC-16: reads user.name from git config', async () => {
    const file = await configFile('[user]\n\tname = Ada Lovelace\n');
    expect(await readGitUserName({ configFile: file })).toBe('Ada Lovelace');
  });

  it('AC-16: gives null when git has no name', async () => {
    const file = await configFile('[core]\n\tautocrlf = false\n');
    expect(await readGitUserName({ configFile: file })).toBeNull();
  });

  it('AC-16: gives null when the name is only spaces', async () => {
    const file = await configFile('[user]\n\tname = "   "\n');
    expect(await readGitUserName({ configFile: file })).toBeNull();
  });

  it('gives null instead of failing when git is not installed', async () => {
    expect(await readGitUserName({ git: join(dir, 'no-such-git') })).toBeNull();
  });
});
