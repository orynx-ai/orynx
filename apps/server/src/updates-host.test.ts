import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { updateHost } from './updates-host.ts';

const folders: string[] = [];

afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

async function folder(): Promise<string> {
  const made = await mkdtemp(join(tmpdir(), 'orynx-host-'));
  folders.push(made);
  return made;
}

describe('updateHost (spec 045)', () => {
  it('AC-1: inside the desktop app, says so with its stamped version', async () => {
    const home = await folder();
    const host = await updateHost({ desktop: true, service: null, version: '0.1.37', repo: home, home, env: {} });
    expect(host).toMatchObject({
      kind: 'desktop',
      folder: null,
      running: { release: '0.1.37', commits: 0, commit: null },
    });
  });

  it('AC-25, AC-30: a clone is a service when ./install.sh says so, and started by hand otherwise', async () => {
    const repo = await folder();
    const service = await updateHost({
      desktop: false,
      service: 'launchd',
      version: '0.1.0',
      repo,
      home: repo,
      env: {},
    });
    expect(service.kind).toBe('service');
    expect(service.state().action).toBe('update');
    const byHand = await updateHost({ desktop: false, service: null, version: '0.1.0', repo, home: repo, env: {} });
    expect(byHand.kind).toBe('by_hand');
    expect(byHand.state().action).toBe('commands');
  });
});
