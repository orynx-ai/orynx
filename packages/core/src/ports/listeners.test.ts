import { describe, expect, it } from 'vitest';
import { cwdsFrom, listenersFrom, processesFrom, secondsOf } from './listeners.ts';

describe('reading lsof and ps (spec 042)', () => {
  it('AC-2: reads each listening port once, by its process, whatever address it listens on', () => {
    const lsof = [
      'p59220',
      'cnode',
      'f23',
      'n*:3005',
      'f24',
      'n[::1]:3005',
      'p812',
      'cpostgres',
      'f7',
      'n127.0.0.1:5432',
      '',
    ].join('\n');
    expect(listenersFrom(lsof)).toEqual([
      { pid: 59220, port: 3005 },
      { pid: 812, port: 5432 },
    ]);
    expect(listenersFrom('')).toEqual([]);
  });

  it('reads where each process runs', () => {
    const lsof = [
      'p59220',
      'fcwd',
      'n/Users/me/.devhub/worktrees/372a80e3b0347420/apps/web',
      'p812',
      'fcwd',
      'n/',
      '',
    ].join('\n');
    expect(cwdsFrom(lsof)).toEqual(
      new Map([
        [59220, '/Users/me/.devhub/worktrees/372a80e3b0347420/apps/web'],
        [812, '/'],
      ]),
    );
  });

  it('reads the process table, with each command line whole', () => {
    const ps = [
      '  59220  59101       04:12 node ./node_modules/next/dist/bin/next dev --port 3005',
      '    1     0 3-02:00:00 /sbin/launchd',
      '',
    ].join('\n');
    expect(processesFrom(ps)).toEqual([
      { pid: 59220, ppid: 59101, seconds: 252, command: 'node ./node_modules/next/dist/bin/next dev --port 3005' },
      { pid: 1, ppid: 0, seconds: 266_400, command: '/sbin/launchd' },
    ]);
  });

  it('reads how long a process has run, as ps writes it', () => {
    expect(secondsOf('00:05')).toBe(5);
    expect(secondsOf('01:02:03')).toBe(3_723);
    expect(secondsOf('2-00:00:01')).toBe(172_801);
    expect(secondsOf('nonsense')).toBe(0);
  });
});
