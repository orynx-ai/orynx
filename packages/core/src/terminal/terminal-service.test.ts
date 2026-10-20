import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ServerEvent, TerminalOutput } from '@devhub/contracts';
import { createEventBus } from '../events/event-bus.ts';
import { createTerminalService, terminalEnvironment, type TerminalService } from './terminal-service.ts';

const session = '0123456789abcdef';
const services: TerminalService[] = [];
const folders: string[] = [];

afterEach(async () => {
  for (const terminal of services.splice(0)) await terminal.close();
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

/** A worktree of its own, and /bin/sh as your shell with nothing of the real home, so no profile runs. */
async function setUp({ stopGraceMs = 5_000, keptChars }: { stopGraceMs?: number; keptChars?: number } = {}) {
  const worktree = await realpath(await mkdtemp(join(tmpdir(), 'orynx-terminal-')));
  folders.push(worktree);
  const events = createEventBus();
  const heard: ServerEvent[] = [];
  events.subscribe((event) => heard.push(event));
  const env = { PATH: '/usr/bin:/bin', HOME: worktree, SHELL: '/bin/sh', LANG: 'C', MARKER: 'yours', PS1: '$ ' };
  const terminal = createTerminalService({
    events,
    env,
    home: worktree,
    stopGraceMs,
    ...(keptChars === undefined ? {} : { keptChars }),
  });
  services.push(terminal);
  return { terminal, worktree, heard };
}

/** Everything a tab's listener has heard, as one string, and a wait for a piece of it. */
function screen(terminal: TerminalService, tabId = 'tab-1') {
  const frames: TerminalOutput[] = [];
  const stop = terminal.listen(session, tabId, (frame) => frames.push(frame));
  const text = () => frames.map((frame) => frame.data).join('');
  return {
    frames,
    text,
    stop,
    async shows(piece: string): Promise<void> {
      for (let tries = 0; tries < 1_000; tries++) {
        if (text().includes(piece)) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`The terminal never showed ${JSON.stringify(piece)}; it shows ${JSON.stringify(text())}`);
    },
  };
}

// The shell echoes what you type, so commands print words built from pieces (`o""k`) the echo doesn't hold.
describe('the terminal service', () => {
  it('AC-1 (038): starts your login shell in the worktree, as you, the first time the tabs are read', async () => {
    const { terminal, worktree } = await setUp();
    expect(terminal.read(session, worktree)).toEqual({
      shell: 'sh',
      worktree: '~',
      tabs: [{ id: 'tab-1', number: 1, server: null }],
    });

    const tab = screen(terminal);
    expect(terminal.write(session, 'tab-1', 'pwd; echo "$MARKER-$TERM"\r')).toBe(true);
    await tab.shows(`${worktree}\r\n`);
    await tab.shows('yours-xterm-256color\r\n');
  });

  it('AC-2 (038): what you type reaches a command that reads it, and cd carries over', async () => {
    const { terminal, worktree } = await setUp();
    await mkdir(join(worktree, 'packages'));
    terminal.read(session, worktree);
    const tab = screen(terminal);

    terminal.write(session, 'tab-1', 'read answer; echo "got:$answer"\r');
    await new Promise((resolve) => setTimeout(resolve, 100));
    terminal.write(session, 'tab-1', 'yes\r');
    await tab.shows('got:yes\r\n');

    terminal.write(session, 'tab-1', 'cd packages\r');
    terminal.write(session, 'tab-1', 'pwd\r');
    await tab.shows(`${join(worktree, 'packages')}\r\n`);
  });

  it('AC-3 (038): ⌃C stops the running command and the shell carries on', async () => {
    const { terminal, worktree } = await setUp();
    terminal.read(session, worktree);
    const tab = screen(terminal);
    terminal.write(session, 'tab-1', 'echo st""arted; sleep 30\r');
    await tab.shows('started\r\n');

    // Typed while sleep runs, so it shows only once sleep has gone: well inside the test's time, not after 30 s.
    terminal.write(session, 'tab-1', '\u0003');
    terminal.write(session, 'tab-1', 'echo al""ive\r');
    await tab.shows('alive\r\n');
  });

  it('AC-4 (038): sets the size programs draw to', async () => {
    const { terminal, worktree } = await setUp();
    terminal.read(session, worktree);
    const tab = screen(terminal);
    expect(terminal.resize(session, 'tab-1', { cols: 120, rows: 40 })).toBe(true);
    terminal.write(session, 'tab-1', 'stty size\r');
    await tab.shows('40 120\r\n');
  });

  it('AC-5 (038): someone who comes back gets the output so far first, then what comes next', async () => {
    const { terminal, worktree } = await setUp();
    terminal.read(session, worktree);
    const first = screen(terminal);
    terminal.write(session, 'tab-1', 'echo be""fore\r');
    await first.shows('before\r\n');
    first.stop?.();

    const later = screen(terminal);
    expect(later.frames[0]?.kind).toBe('replay');
    expect(later.frames[0]?.data).toContain('before\r\n');
    terminal.write(session, 'tab-1', 'echo af""ter\r');
    await later.shows('after\r\n');
    expect(first.text()).not.toContain('after\r\n');
  });

  it('AC-5 (038): keeps only the last of a long output, from a line’s start', async () => {
    const { terminal, worktree } = await setUp({ keptChars: 100 });
    terminal.read(session, worktree);
    const tab = screen(terminal);
    terminal.write(session, 'tab-1', 'i=0; while [ $i -lt 50 ]; do echo "line $i"; i=$((i+1)); done; echo do""ne\r');
    await tab.shows('done\r\n');

    const replay = screen(terminal).frames[0]?.data ?? '';
    expect(replay.length).toBeLessThanOrEqual(200);
    expect(replay).toContain('line 49\r\n');
    expect(replay).not.toContain('line 1\r\n');
    expect(replay.startsWith('line') || replay.startsWith('done') || replay.startsWith('$')).toBe(true);
  });

  it('AC-6 (038): adds tabs up to 5, each its own shell; closing one ends it; the first stays', async () => {
    const { terminal, worktree, heard } = await setUp();
    terminal.read(session, worktree);
    expect(terminal.addTab(session, worktree)).toEqual({ result: 'added', tabId: 'tab-2' });
    for (const tabId of ['tab-3', 'tab-4', 'tab-5']) {
      expect(terminal.addTab(session, worktree)).toEqual({ result: 'added', tabId });
    }
    expect(terminal.addTab(session, worktree)).toEqual({ result: 'full' });
    expect(heard).toContainEqual({ type: 'session.terminal.changed', sessionId: session });

    const second = screen(terminal, 'tab-2');
    terminal.write(session, 'tab-2', 'echo "$$" > pid; echo wr""ote\r');
    await second.shows('wrote\r\n');
    const pid = Number(await readFile(join(worktree, 'pid'), 'utf8'));

    expect(await terminal.closeTab(session, 'tab-2')).toBe(true);
    expect(() => process.kill(pid, 0)).toThrow();
    expect(terminal.read(session, worktree).tabs.map((tab) => tab.id)).toEqual(['tab-1', 'tab-3', 'tab-4', 'tab-5']);
    expect(await terminal.closeTab(session, 'tab-1')).toBe(false);
  });

  it('AC-7 (038): exit closes a tab; in the first, a key starts a new shell', async () => {
    const { terminal, worktree } = await setUp();
    terminal.read(session, worktree);
    terminal.addTab(session, worktree);
    terminal.write(session, 'tab-2', 'exit\r');
    for (let tries = 0; tries < 500 && terminal.read(session, worktree).tabs.length > 1; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(terminal.read(session, worktree).tabs).toEqual([{ id: 'tab-1', number: 1, server: null }]);

    const first = screen(terminal);
    terminal.write(session, 'tab-1', 'exit\r');
    await first.shows('Your shell ended. Press any key to start a new one.');
    terminal.write(session, 'tab-1', 'x');
    terminal.write(session, 'tab-1', 'echo ag""ain\r');
    await first.shows('again\r\n');
  });

  it('AC-8 (038): starts no shell when the worktree isn’t there any more, and says so', async () => {
    const { terminal, worktree } = await setUp();
    terminal.read(session, join(worktree, 'gone'));
    const tab = screen(terminal);
    expect(tab.text()).toContain("Couldn't run this. The worktree isn't there any more.");
    expect(terminal.write(session, 'tab-1', 'ls\r')).toBe(true);
  });

  it('answers false and null for a tab it doesn’t have', async () => {
    const { terminal, worktree } = await setUp();
    terminal.read(session, worktree);
    expect(terminal.listen(session, 'tab-9', () => undefined)).toBeNull();
    expect(terminal.write(session, 'tab-9', 'ls\r')).toBe(false);
    expect(terminal.resize(session, 'tab-9', { cols: 80, rows: 24 })).toBe(false);
    expect(await terminal.closeTab(session, 'tab-9')).toBe(false);
  });

  it('AC-28 (036): stopAll ends every shell in the session’s tabs and forgets them, as Discard needs', async () => {
    const { terminal, worktree } = await setUp();
    terminal.read(session, worktree);
    terminal.addTab(session, worktree);
    const tab = screen(terminal, 'tab-2');
    terminal.write(session, 'tab-2', 'echo st""arted; sleep 30\r');
    await tab.shows('started\r\n');

    await terminal.stopAll(session);
    expect(terminal.listen(session, 'tab-1', () => undefined)).toBeNull();
  });

  it('ends a shell that ignores SIGHUP once the wait is over', async () => {
    const { terminal, worktree } = await setUp({ stopGraceMs: 50 });
    terminal.read(session, worktree);
    const tab = screen(terminal);
    terminal.write(session, 'tab-1', `trap '' HUP; echo tr""apped\r`);
    await tab.shows('trapped\r\n');
    await terminal.close();
    expect(terminal.listen(session, 'tab-1', () => undefined)).toBeNull();
  });
});

describe('terminalEnvironment', () => {
  it('AC-29: is your environment without Orynx’s own settings, with a terminal that draws colour', () => {
    expect(
      terminalEnvironment({
        PATH: '/usr/bin',
        HOME: '/Users/you',
        EDITOR: 'vim',
        DEVHUB_HOME: '/Users/you/.devhub',
        DEVHUB_JIRA_API_TOKEN: 'secret',
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        UNSET: undefined,
      }),
    ).toEqual({
      PATH: '/usr/bin',
      HOME: '/Users/you',
      EDITOR: 'vim',
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    });
  });
});

describe('a server’s tab (spec 042)', () => {
  it('AC-2: opens a tab named for the server, runs it in its folder, and says the tab’s shell for the Ports tab', async () => {
    const { terminal, worktree } = await setUp();
    await mkdir(join(worktree, 'apps', 'web'), { recursive: true });
    terminal.read(session, worktree);
    // Typed as "ser"ving, so only what it prints reads serving.
    const added = terminal.addServerTab(session, join(worktree, 'apps', 'web'), 'pwd; echo "ser"ving');
    expect(added).toMatchObject({ result: 'added' });
    const tabId = added.result === 'added' ? added.tabId : '';
    await screen(terminal, tabId).shows('serving');
    expect(terminal.read(session, worktree).tabs.at(-1)).toEqual({
      id: tabId,
      number: 2,
      server: 'pwd; echo "ser"ving',
    });
    expect(terminal.lastLines(session, tabId, 40).join('\n')).toContain(join(worktree, 'apps', 'web'));
    const shells = terminal.shells(session);
    expect(shells.map((shell) => shell.server)).toEqual([null, 'pwd; echo "ser"ving']);
    expect(shells.every((shell) => shell.pid > 0)).toBe(true);
    expect(terminal.shells('fedcba9876543210')).toEqual([]);
  });

  it('AC-5: Restart stops what runs in a server’s tab and runs its command again', async () => {
    const { terminal, worktree } = await setUp();
    terminal.read(session, worktree);
    const added = terminal.addServerTab(session, worktree, 'echo started; sleep 30');
    const tabId = added.result === 'added' ? added.tabId : '';
    const shown = screen(terminal, tabId);
    await shown.shows('started');
    expect(terminal.restart(session, tabId)).toBe(true);
    // The command shows twice each run: as typed, then what it printed.
    for (let tries = 0; tries < 500 && shown.text().split('started').length < 5; tries++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    expect(shown.text().split('started').length).toBeGreaterThanOrEqual(5);
    expect(terminal.restart(session, 'tab-1')).toBe(false);
  });
});
