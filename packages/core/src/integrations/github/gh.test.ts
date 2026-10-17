import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ghToken, useFakeGhFolder } from '../../test/fake-gh.ts';
import { createGhCli } from './gh.ts';

const fakeGhFolder = useFakeGhFolder();

describe.skipIf(process.platform === 'win32')('gh runner', () => {
  it('AC-2: finds gh on the search path without running it', async () => {
    const empty = await fakeGhFolder();
    const folder = await fakeGhFolder();
    await folder.install({ kind: 'signed_in' });

    const gh = createGhCli({ searchPath: [empty.dir, folder.dir].join(delimiter) });

    expect(await gh.find()).toBe(join(folder.dir, 'gh'));
    expect(await folder.runs()).toEqual([]);
  });

  it('AC-2: finds nothing when no folder on the path has an executable gh', async () => {
    const folder = await fakeGhFolder();
    // A gh that can't be run, and a folder called gh, are not gh.
    await writeFile(join(folder.dir, 'gh'), '#!/bin/sh\n');
    await chmod(join(folder.dir, 'gh'), 0o644);
    const other = await fakeGhFolder();
    await mkdir(join(other.dir, 'gh'));

    const gh = createGhCli({ searchPath: [folder.dir, '', join(folder.dir, 'missing'), other.dir].join(delimiter) });

    expect(await gh.find()).toBeNull();
  });

  it('AC-20: an empty search path never finds gh, so nothing can start the real one', async () => {
    const gh = createGhCli({ searchPath: '' });

    expect(await gh.find()).toBeNull();
    expect(await gh.token()).toEqual({ ok: false, problem: { kind: 'gh_missing' } });
  });

  it('AC-3: asks gh for the github.com token and hands it back trimmed', async () => {
    const folder = await fakeGhFolder();
    await folder.install({ kind: 'signed_in' });
    const gh = createGhCli({ searchPath: folder.dir });

    expect(await gh.token()).toEqual({ ok: true, token: ghToken });
    expect(await folder.runs()).toEqual([['auth', 'token', '--hostname', 'github.com']]);
  });

  it('AC-4: says gh is missing when it is not on the path', async () => {
    const folder = await fakeGhFolder();
    const gh = createGhCli({ searchPath: folder.dir });

    expect(await gh.token()).toEqual({ ok: false, problem: { kind: 'gh_missing' } });
  });

  it('AC-4: says gh is signed out when it has no login for github.com', async () => {
    const folder = await fakeGhFolder();
    await folder.install({ kind: 'signed_out' });
    const gh = createGhCli({ searchPath: folder.dir });

    expect(await gh.token()).toEqual({ ok: false, problem: { kind: 'gh_signed_out' } });
  });

  it('AC-4, AC-17: keeps only the exit code when gh fails another way, never what it printed', async () => {
    const folder = await fakeGhFolder();
    await folder.install({ kind: 'fails', exitCode: 4, stderr: 'secret-looking output from gh' });
    const gh = createGhCli({ searchPath: folder.dir });

    const answer = await gh.token();

    expect(answer).toEqual({ ok: false, problem: { kind: 'gh_failed', exitCode: 4 } });
    expect(JSON.stringify(answer)).not.toContain('secret-looking');
  });

  it('AC-4: gives up on a gh that takes too long, and stops it', async () => {
    const folder = await fakeGhFolder();
    await folder.install({ kind: 'slow' });
    const gh = createGhCli({ searchPath: folder.dir, timeoutMs: 200 });

    const started = Date.now();
    expect(await gh.token()).toEqual({ ok: false, problem: { kind: 'gh_timeout' } });
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('AC-17: stops a gh that prints far more than a token, and keeps none of it', async () => {
    const folder = await fakeGhFolder();
    await folder.install({ kind: 'prints', stdout: 'a'.repeat(70_000) });
    const gh = createGhCli({ searchPath: folder.dir });

    expect(await gh.token()).toEqual({ ok: false, problem: { kind: 'gh_failed', exitCode: null } });
  });

  it('waits 5 seconds for gh by default', () => {
    expect(createGhCli({ searchPath: '' }).timeoutMs).toBe(5000);
  });

  it.each([
    ['nothing', ''],
    ['two lines', 'fake-one\nfake-two'],
    ['a space inside', 'fake one'],
    ['too long a token', 'a'.repeat(4097)],
  ])('AC-4, AC-17: treats %s on its output as a failure, and never keeps the output', async (_, stdout) => {
    const folder = await fakeGhFolder();
    await folder.install({ kind: 'prints', stdout });
    const gh = createGhCli({ searchPath: folder.dir });

    const answer = await gh.token();

    expect(answer).toEqual({ ok: false, problem: { kind: 'gh_failed', exitCode: 0 } });
  });
});
