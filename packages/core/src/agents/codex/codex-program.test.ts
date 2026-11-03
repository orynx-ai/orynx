import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useFakeCodex } from '../../test/fake-codex.ts';
import { codexVersion, findCodex, supportsCodex } from './codex-program.ts';

const fakeCodex = useFakeCodex();

describe.skipIf(process.platform === 'win32')('finding Codex (spec 052)', () => {
  it('AC-1: takes the program DEVHUB_CODEX names, when it is an absolute path that runs', async () => {
    const fake = await fakeCodex();
    expect(await findCodex({ configured: fake.program, searchPath: '' })).toBe(fake.program);
    expect(await findCodex({ configured: 'codex', searchPath: dirname(fake.program) })).toBeNull();
    expect(await findCodex({ configured: '/nonexistent/codex', searchPath: dirname(fake.program) })).toBeNull();
  });

  it('AC-1: otherwise finds `codex` on the PATH, skipping folders that are relative or hold none', async () => {
    const fake = await fakeCodex();
    const searchPath = ['.', '/nonexistent', dirname(fake.program), '/usr/bin'].join(':');
    expect(await findCodex({ configured: null, searchPath })).toBe(fake.program);
    expect(await findCodex({ configured: null, searchPath: '/nonexistent:/usr/sbin' })).toBeNull();
  });

  it('AC-2: reads the version `codex --version` prints, running nothing else', async () => {
    const fake = await fakeCodex();
    const env = { PATH: '/usr/bin:/bin' };
    expect(await codexVersion(fake.program, env)).toBe('0.166.0');
    await fake.printsVersion('codex-cli 0.170.2-alpha.1\n');
    expect(await codexVersion(fake.program, env)).toBe('0.170.2');
    await fake.printsVersion('Codex is great\n');
    expect(await codexVersion(fake.program, env)).toBeNull();
    expect((await fake.runs()).map((run) => run.args)).toEqual([['--version'], ['--version'], ['--version']]);
  });

  it('AC-2: needs Codex 0.166 or later', () => {
    expect(['0.166.0', '0.166.3', '0.200.0', '1.0.0'].map(supportsCodex)).toEqual([true, true, true, true]);
    expect(['0.165.9', '0.99.0', '0.1.0'].map(supportsCodex)).toEqual([false, false, false]);
  });
});
