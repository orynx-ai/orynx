import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openLogFile } from './log-file.ts';

let home: string;

beforeEach(async () => {
  home = join(await mkdtemp(join(tmpdir(), 'devhub-desktop-log-')), 'home');
});

afterEach(async () => {
  await rm(join(home, '..'), { recursive: true, force: true });
});

async function launch(line: string): Promise<void> {
  const log = await openLogFile(home);
  await new Promise<void>((done) => log.end(`${line}\n`, done));
}

describe('openLogFile', () => {
  it("AC-21: keeps this launch's log in logs/orynx.log and the last one in orynx.old.log, for this user only", async () => {
    await launch('first launch');
    await launch('second launch');
    await launch('third launch');

    const logs = join(home, 'logs');
    expect(await readFile(join(logs, 'orynx.log'), 'utf8')).toBe('third launch\n');
    expect(await readFile(join(logs, 'orynx.old.log'), 'utf8')).toBe('second launch\n');
    expect((await stat(logs)).mode & 0o777).toBe(0o700);
    expect((await stat(join(logs, 'orynx.log'))).mode & 0o777).toBe(0o600);
    expect((await stat(join(logs, 'orynx.old.log'))).mode & 0o777).toBe(0o600);
  });
});
