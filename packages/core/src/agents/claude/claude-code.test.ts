import { constants } from 'node:fs';
import { access, chmod, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { authStatus, claudeEmail, claudeOrganisation, useFakeClaudeFolder } from '../../test/fake-claude.ts';
import { createClaudeCode, findSdkClaudeCode } from './claude-code.ts';

describe('findSdkClaudeCode', () => {
  it('Q2: finds the Claude Code that ships in the SDK for this computer, without running it', async () => {
    const program = findSdkClaudeCode();

    expect(program).not.toBeNull();
    const ext = process.platform === 'win32' ? '.exe' : '';
    expect(program?.replaceAll('\\', '/')).toMatch(
      new RegExp(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}(-musl)?/claude${ext}$`),
    );
    expect((await stat(program ?? '')).isFile()).toBe(true);
    await expect(access(program ?? '', constants.X_OK)).resolves.toBeUndefined();
  });

  it('Q2: finds nothing for a computer the SDK ships no Claude Code for', () => {
    expect(findSdkClaudeCode({ platform: 'aix', arch: 'ppc64' })).toBeNull();
    // Linux has two builds, for glibc and for musl; the SDK ships neither for this processor.
    expect(findSdkClaudeCode({ platform: 'linux', arch: 'riscv64' })).toBeNull();
  });
});

const fakeClaudeFolder = useFakeClaudeFolder();
/** The shell's own variables a test passes in; tests never read process.env (CLAUDE.md rule 9). */
const shell = { PATH: '/usr/bin:/bin', HOME: '/Users/you' };

describe.skipIf(process.platform === 'win32')('Claude Code runner', () => {
  it('AC-10: runs exactly `auth status --json`, and never a prompt', async () => {
    const folder = await fakeClaudeFolder();
    await folder.install({ kind: 'signed_in' });

    await createClaudeCode({ program: folder.program, env: shell }).authStatus();

    expect(await folder.runs()).toEqual([['auth', 'status', '--json']]);
  });

  it('AC-1, AC-2: answers signed in with the claude.ai account', async () => {
    const folder = await fakeClaudeFolder();
    await folder.install({ kind: 'signed_in' });

    expect(await createClaudeCode({ program: folder.program, env: shell }).authStatus()).toEqual({
      ok: true,
      login: { state: 'signed_in', method: 'claude_ai', email: claudeEmail, organisation: claudeOrganisation },
    });
  });

  it('AC-4: answers signed out when Claude Code prints loggedIn false and exits 1', async () => {
    const folder = await fakeClaudeFolder();
    await folder.install({ kind: 'signed_out' });

    expect(await createClaudeCode({ program: folder.program, env: shell }).authStatus()).toEqual({
      ok: true,
      login: { state: 'signed_out' },
    });
  });

  it("AC-10: the program gets only the short environment, never DevHub's, with nonessential traffic off", async () => {
    const folder = await fakeClaudeFolder();
    await folder.install({ kind: 'signed_in' });
    const env = {
      ...shell,
      CLAUDE_CONFIG_DIR: '/tmp/empty-claude',
      DEVHUB_GITHUB_TOKEN: 'fake-token-for-tests',
      DEVHUB_JIRA_API_TOKEN: 'fake-token-for-tests',
      DEVHUB_HOME: '/Users/you/.devhub',
      NODE_OPTIONS: '--require ./steal.js',
    };

    await createClaudeCode({ program: folder.program, env }).authStatus();

    expect(await folder.lastEnvironment()).toEqual({
      ...shell,
      CLAUDE_CONFIG_DIR: '/tmp/empty-claude',
      // Set by DevHub: the check needs no analytics or other traffic Claude Code would send.
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    });
  });

  it('AC-6, AC-12: finds no program when none was given, and starts nothing', async () => {
    const claude = createClaudeCode({ program: null, env: shell });

    expect(await claude.find()).toBeNull();
    expect(await claude.authStatus()).toEqual({ ok: false, problem: { kind: 'missing' } });
  });

  it("AC-6: a path with nothing at it, a folder, a file that can't run and a relative path are missing", async () => {
    const folder = await fakeClaudeFolder();
    const notRunnable = join(folder.program, '..', 'not-runnable');
    await writeFile(notRunnable, '#!/bin/sh\n');
    await chmod(notRunnable, 0o644);

    for (const program of [folder.program, join(folder.program, '..'), notRunnable, 'claude']) {
      expect(await createClaudeCode({ program, env: shell }).authStatus()).toEqual({
        ok: false,
        problem: { kind: 'missing' },
      });
    }
    expect(await folder.runs()).toEqual([]);
  });

  it('AC-6: a program that crashes is failed, with its exit code', async () => {
    const folder = await fakeClaudeFolder();
    await folder.install({ kind: 'crashes', exitCode: 3, stderr: 'Segmentation fault' });

    expect(await createClaudeCode({ program: folder.program, env: shell }).authStatus()).toEqual({
      ok: false,
      problem: { kind: 'failed', exitCode: 3 },
    });
  });

  it('AC-6: a program that ends by a signal is failed, with no exit code', async () => {
    const folder = await fakeClaudeFolder();
    await folder.install({ kind: 'killed' });

    expect(await createClaudeCode({ program: folder.program, env: shell }).authStatus()).toEqual({
      ok: false,
      problem: { kind: 'failed', exitCode: null },
    });
  });

  it('AC-6: exit 1 with no JSON is failed, not signed out', async () => {
    const folder = await fakeClaudeFolder();
    await folder.install({
      kind: 'prints',
      stdout: 'Not logged in. Run claude auth login to authenticate.\n',
      exitCode: 1,
    });

    expect(await createClaudeCode({ program: folder.program, env: shell }).authStatus()).toEqual({
      ok: false,
      problem: { kind: 'failed', exitCode: 1 },
    });
  });

  it("AC-6: exit 0 with something that isn't the expected JSON is unreadable, never signed in", async () => {
    const folder = await fakeClaudeFolder();
    await folder.install({ kind: 'prints', stdout: authStatus({ loggedIn: 'yes' }), exitCode: 0 });

    expect(await createClaudeCode({ program: folder.program, env: shell }).authStatus()).toEqual({
      ok: false,
      problem: { kind: 'unreadable' },
    });
  });

  it('AC-6: more output than an answer could need is unreadable', async () => {
    const folder = await fakeClaudeFolder();
    await folder.install({ kind: 'prints', stdout: 'x'.repeat(200 * 1024), exitCode: 0 });

    expect(await createClaudeCode({ program: folder.program, env: shell }).authStatus()).toEqual({
      ok: false,
      problem: { kind: 'unreadable' },
    });
  });

  it('AC-6: a program that runs too long is stopped and is a timeout', async () => {
    const folder = await fakeClaudeFolder();
    await folder.install({ kind: 'slow' });
    const started = Date.now();

    expect(await createClaudeCode({ program: folder.program, env: shell, timeoutMs: 300 }).authStatus()).toEqual({
      ok: false,
      problem: { kind: 'timeout' },
    });
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('AC-6: waits 10 seconds by default', () => {
    expect(createClaudeCode({ program: null, env: shell }).timeoutMs).toBe(10_000);
  });
});
