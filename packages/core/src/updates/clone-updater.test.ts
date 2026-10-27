import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { UpdateProgress } from '@devhub/contracts';
import { useTestRepositories, type TestRepositories } from '../test/git-repository.ts';
import { createCloneUpdater, runnerCommand, type CloneUpdaterOptions } from './clone-updater.ts';

const makeRepositories = useTestRepositories();

/**
 * A clone like Orynx's own: tagged v0.1.37 on origin, with an install.sh that stands in for the real one. It
 * prints, notes how it was started (its process group, and whether it has a terminal), and exits with `code`.
 */
async function orynxClone(code = 0): Promise<TestRepositories & { home: string }> {
  const repos = await makeRepositories();
  const script = [
    '#!/bin/sh',
    'echo "Building Orynx"',
    'echo "pid=$$ group=$(ps -o pgid= -p $$ | tr -d " ")" > "$DEVHUB_HOME/started"',
    'if [ -t 0 ]; then echo terminal >> "$DEVHUB_HOME/started"; else echo "no terminal" >> "$DEVHUB_HOME/started"; fi',
    `exit ${String(code)}`,
    '',
  ].join('\n');
  await writeFile(join(repos.clone, 'install.sh'), script);
  await chmod(join(repos.clone, 'install.sh'), 0o755);
  await repos.git(repos.clone, 'add', 'install.sh');
  await repos.git(repos.clone, 'commit', '-m', 'install');
  await repos.git(repos.clone, 'tag', 'v0.1.37');
  await repos.git(repos.clone, 'push', '-q', 'origin', 'main', '--tags');
  const home = join(repos.root, 'devhub');
  await mkdir(home, { recursive: true });
  return { ...repos, home };
}

/** Someone else's commit on origin's main, which the clone hasn't fetched yet; gives its id. */
async function commitUpstream(repos: TestRepositories, file: string): Promise<string> {
  const other = join(repos.root, `other-${file}`);
  await repos.git(repos.root, 'clone', '-q', repos.origin, other);
  await writeFile(join(other, file), `${file}\n`);
  await repos.git(other, 'add', '.');
  await repos.git(other, 'commit', '-m', `add ${file}`);
  await repos.git(other, 'push', '-q', 'origin', 'main');
  return repos.git(other, 'rev-parse', 'HEAD');
}

function updater(repos: TestRepositories & { home: string }, overrides: Partial<CloneUpdaterOptions> = {}) {
  return createCloneUpdater({
    folder: repos.clone,
    service: 'launchd',
    home: repos.home,
    env: repos.env,
    userHome: repos.root,
    ...overrides,
  });
}

async function settled(host: Awaited<ReturnType<typeof updater>>): Promise<UpdateProgress> {
  await expect.poll(() => host.state().update.state, { timeout: 10_000 }).not.toBe('updating');
  return host.state().update;
}

describe('clone updater (spec 045)', () => {
  it('AC-2: reads its version from git: the release on its tag, then how many commits past it', async () => {
    const repos = await orynxClone();
    const short = (await repos.git(repos.clone, 'rev-parse', 'HEAD')).slice(0, 7);
    const onTag = await updater(repos);
    expect(onTag).toMatchObject({ kind: 'service', folder: '~/web-app' });
    expect(onTag.running).toEqual({ release: '0.1.37', commits: 0, commit: short });

    await writeFile(join(repos.clone, 'a.txt'), 'a\n');
    await repos.git(repos.clone, 'add', '.');
    await repos.git(repos.clone, 'commit', '-m', 'a');
    const past = await updater(repos);
    expect(past.running).toMatchObject({ release: '0.1.37', commits: 1 });
  });

  it('AC-2: a clone with no release tag in its history shows only its commit', async () => {
    const repos = await makeRepositories();
    const host = await createCloneUpdater({ folder: repos.clone, service: null, home: repos.root, env: repos.env });
    expect(host.running).toEqual({
      release: null,
      commits: 0,
      commit: (await repos.git(repos.clone, 'rev-parse', 'HEAD')).slice(0, 7),
    });
  });

  it('AC-30: a clone started by hand offers the commands, not Update', async () => {
    const repos = await orynxClone();
    const host = await updater(repos, { service: null });
    expect(host.kind).toBe('by_hand');
    expect(host.state()).toEqual({ action: 'commands', update: { state: 'idle' } });
  });

  it('AC-25: pulls and runs ./install.sh apart from the hub, with no terminal, writing update.log', async () => {
    const repos = await orynxClone();
    const newest = await commitUpstream(repos, 'feature.txt');
    const host = await updater(repos);
    let changes = 0;
    host.watch(() => {
      changes += 1;
    });

    await host.update('0.1.40');
    expect(host.state().update).toEqual({ state: 'updating' });
    await expect
      .poll(() => readFile(join(repos.home, 'started'), 'utf8').catch(() => ''), { timeout: 10_000 })
      .not.toBe('');
    // A success restarts the service, which ends this hub; until then it says it's updating.
    await expect
      .poll(() => readFile(join(repos.home, 'update.log'), 'utf8').catch(() => ''), { timeout: 10_000 })
      .toContain('Building Orynx');
    expect(host.state().update).toEqual({ state: 'updating' });

    expect(await repos.git(repos.clone, 'rev-parse', 'HEAD')).toBe(newest);
    const started = await readFile(join(repos.home, 'started'), 'utf8');
    const [, pid, group] = /pid=(\d+) group=(\d+)/.exec(started) ?? [];
    // Its own process group, so the service's restart doesn't stop it half-way.
    expect(group).toBe(pid);
    expect(started).toContain('no terminal');
    expect(changes).toBeGreaterThan(0);
  });

  it('AC-28: a failed ./install.sh says the update failed and names update.log, replacing the last one', async () => {
    const repos = await orynxClone(1);
    await commitUpstream(repos, 'feature.txt');
    await writeFile(join(repos.home, 'update.log'), 'the last update\n');
    const host = await updater(repos);

    await host.update('0.1.40');
    expect(await settled(host)).toEqual({ state: 'failed', log: '~/devhub/update.log' });
    const log = await readFile(join(repos.home, 'update.log'), 'utf8');
    expect(log).toContain('Building Orynx');
    expect(log).not.toContain('the last update');
  });

  it('AC-27: changes of its own, or a branch that moved apart from origin, change nothing', async () => {
    const repos = await orynxClone();
    await commitUpstream(repos, 'feature.txt');
    const before = await repos.git(repos.clone, 'rev-parse', 'HEAD');

    await writeFile(join(repos.clone, 'install.sh'), '#!/bin/sh\necho mine\n');
    const changed = await updater(repos);
    await changed.update('0.1.40');
    expect(changed.state().update).toEqual({ state: 'refused', reason: 'changes' });

    await repos.git(repos.clone, 'commit', '-qam', 'mine');
    const diverged = await updater(repos);
    await diverged.update('0.1.40');
    expect(diverged.state().update).toEqual({ state: 'refused', reason: 'diverged' });

    expect(await repos.git(repos.clone, 'rev-parse', 'HEAD~1')).toBe(before);
    await expect(readFile(join(repos.home, 'started'), 'utf8')).rejects.toThrow();
  });

  it('runs under systemd-run on Linux, so stopping the unit to restart it leaves the update running', () => {
    const [program, args] = runnerCommand({
      service: 'systemd',
      folder: '/home/me/orynx',
      log: '/home/me/.devhub/update.log',
      env: { PATH: '/usr/bin:/bin', HOME: '/home/me', DEVHUB_HOME: '/home/me/.devhub' },
    });
    expect(program).toBe('systemd-run');
    expect(args.slice(0, 5)).toEqual([
      '--user',
      '--collect',
      '--quiet',
      '--wait',
      '--working-directory=/home/me/orynx',
    ]);
    expect(args).toContain('--setenv=PATH=/usr/bin:/bin');
    expect(args).toContain('--setenv=DEVHUB_HOME=/home/me/.devhub');
    expect(args.slice(-5)).toEqual([
      '/bin/sh',
      '-c',
      expect.stringContaining('git pull --ff-only'),
      'orynx-update',
      '/home/me/.devhub/update.log',
    ]);

    const [macProgram] = runnerCommand({ service: 'launchd', folder: '/Users/me/orynx', log: '/x', env: {} });
    expect(macProgram).toBe('/bin/sh');
  });
});
