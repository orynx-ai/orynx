import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { findSdkClaudeCode } from './claude-code.ts';

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
