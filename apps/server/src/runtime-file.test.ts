import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, removeRuntimeFile, runtimeFilePath, writeRuntimeFile } from './runtime-file.ts';

let home: string;

beforeEach(async () => {
  home = join(await mkdtemp(join(tmpdir(), 'devhub-runtime-')), 'home');
});

afterEach(async () => {
  await rm(join(home, '..'), { recursive: true, force: true });
});

describe('runtime file', () => {
  it('writes port, token and pid where only this user can read them', async () => {
    const path = await writeRuntimeFile(home, { port: 4317, token: 'tok', pid: 42 });

    expect(path).toBe(runtimeFilePath(home));
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ port: 4317, token: 'tok', pid: 42 });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(home)).mode & 0o777).toBe(0o700);
  });

  it('is removed on shutdown, and removing twice is fine', async () => {
    await writeRuntimeFile(home, { port: 1, token: 't', pid: 1 });

    await removeRuntimeFile(home);
    await removeRuntimeFile(home);

    await expect(stat(runtimeFilePath(home))).rejects.toThrow();
  });
});

describe('createSessionToken', () => {
  it('makes a different, URL-safe token every start', () => {
    const first = createSessionToken();
    const second = createSessionToken();

    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
