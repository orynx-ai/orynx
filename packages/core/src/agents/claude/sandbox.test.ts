import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sandboxAvailable, sandboxSettings } from './sandbox.ts';

let root: string;
let bothBin: string;
let bwrapOnlyBin: string;
let sandboxExec: string;

async function program(folder: string, name: string, runnable = true): Promise<string> {
  const path = join(folder, name);
  await writeFile(path, '#!/bin/sh\nexit 0\n');
  await chmod(path, runnable ? 0o755 : 0o644);
  return path;
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'devhub-sandbox-'));
  bothBin = join(root, 'both');
  bwrapOnlyBin = join(root, 'bwrap-only');
  await mkdir(bothBin);
  await mkdir(bwrapOnlyBin);
  await program(bothBin, 'bwrap');
  await program(bothBin, 'socat');
  await program(bwrapOnlyBin, 'bwrap');
  await program(bwrapOnlyBin, 'socat', false);
  sandboxExec = await program(root, 'sandbox-exec');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('sandboxAvailable (Q2b)', () => {
  it('AC-20: on macOS, when sandbox-exec is there', async () => {
    expect(await sandboxAvailable({ platform: 'darwin', searchPath: '', sandboxExec })).toBe(true);
    expect(await sandboxAvailable({ platform: 'darwin', searchPath: '', sandboxExec: join(root, 'missing') })).toBe(
      false,
    );
  });

  it('AC-20: on Linux, when bubblewrap and socat are both on the PATH and can run', async () => {
    const searchPath = [join(root, 'nothing-here'), bothBin].join(delimiter);
    expect(await sandboxAvailable({ platform: 'linux', searchPath })).toBe(true);
    expect(await sandboxAvailable({ platform: 'linux', searchPath: bwrapOnlyBin })).toBe(false);
    expect(await sandboxAvailable({ platform: 'linux', searchPath: '' })).toBe(false);
  });

  it('AC-20: never on Windows or anywhere else', async () => {
    for (const platform of ['win32', 'freebsd', 'aix'] as const) {
      expect(await sandboxAvailable({ platform, searchPath: bothBin, sandboxExec })).toBe(false);
    }
  });
});

describe('sandboxSettings (Q2a)', () => {
  const where = {
    worktree: '/Users/dev/.devhub/worktrees/0123456789abcdef',
    devhubHome: '/Users/dev/.devhub',
    home: '/Users/dev',
    temporary: '/var/folders/xy/T',
  };

  it('AC-9: every command runs sandboxed, still asks Orynx, writes only in the worktree and the temporary folder, and has no network', () => {
    expect(sandboxSettings({ ...where, platform: 'darwin' })).toEqual({
      enabled: true,
      failIfUnavailable: true,
      autoAllowBashIfSandboxed: false,
      allowUnsandboxedCommands: true,
      network: {
        allowedDomains: [],
        strictAllowlist: true,
        allowLocalBinding: false,
        allowAllUnixSockets: false,
      },
      filesystem: {
        allowWrite: [where.worktree, where.temporary],
        denyRead: [where.devhubHome, '/Users/dev/Library/Keychains'],
        allowRead: [where.worktree],
      },
    });
  });

  it('AC-9: keeps Orynx’s own folder and the keychain’s files out of reach, re-opening only this worktree', () => {
    const linux = sandboxSettings({ ...where, platform: 'linux', home: '/home/dev', devhubHome: '/home/dev/.devhub' });
    expect(linux.filesystem?.denyRead).toEqual(['/home/dev/.devhub', '/home/dev/.local/share/keyrings']);
    expect(linux.filesystem?.allowRead).toEqual([where.worktree]);
  });
});
