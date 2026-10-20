import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ServerEvent, TerminalBlock } from '@devhub/contracts';
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
async function setUp({ stopGraceMs = 5_000, blocksKept }: { stopGraceMs?: number; blocksKept?: number } = {}) {
  const worktree = await realpath(await mkdtemp(join(tmpdir(), 'orynx-terminal-')));
  folders.push(worktree);
  const events = createEventBus();
  const heard: ServerEvent[] = [];
  events.subscribe((event) => heard.push(event));
  const env = { PATH: '/usr/bin:/bin', HOME: worktree, SHELL: '/bin/sh', LANG: 'C', MARKER: 'yours' };
  const terminal = createTerminalService({
    events,
    env,
    home: worktree,
    eventMs: 0,
    stopGraceMs,
    ...(blocksKept === undefined ? {} : { blocksKept }),
  });
  services.push(terminal);
  return { terminal, worktree, heard };
}

/** The tab's last block once it has ended. */
async function lastEnded(terminal: TerminalService, tabId = 'tab-1'): Promise<TerminalBlock> {
  for (let tries = 0; tries < 1_000; tries++) {
    const block = terminal
      .read(session, '/unused')
      .tabs.find((tab) => tab.id === tabId)
      ?.blocks.at(-1);
    if (block !== undefined && block.state !== 'running') return block;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The command never ended');
}

/** The tab's last block once its output holds this line, still running. */
async function printed(terminal: TerminalService, line: string, tabId = 'tab-1'): Promise<TerminalBlock> {
  for (let tries = 0; tries < 1_000; tries++) {
    const block = terminal
      .read(session, '/unused')
      .tabs.find((tab) => tab.id === tabId)
      ?.blocks.at(-1);
    if (block?.state === 'running' && block.output.includes(line)) return block;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`The command never printed ${line}`);
}

describe('the terminal service', () => {
  it('AC-4: runs your command in the worktree, as your shell, and keeps its output and time', async () => {
    const { terminal, worktree, heard } = await setUp();
    expect(terminal.read(session, worktree)).toEqual({
      shell: 'sh',
      worktree: '~',
      tabs: [{ id: 'tab-1', number: 1, blocks: [], cleared: false }],
      history: [],
    });

    expect(await terminal.run(session, 'tab-1', 'pwd; echo "$MARKER"', worktree)).toEqual({
      result: 'started',
      blockId: 'block-1',
    });
    const block = await lastEnded(terminal);
    expect(block).toMatchObject({ id: 'block-1', state: 'done', command: 'pwd; echo "$MARKER"' });
    expect(block).toMatchObject({ output: [worktree, 'yours'], cut: false });
    expect(terminal.read(session, worktree).history).toEqual(['pwd; echo "$MARKER"']);
    expect(heard).toContainEqual({ type: 'session.terminal.changed', sessionId: session });
  });

  it('AC-5, AC-6: a command that fails keeps its exit code and what it printed', async () => {
    const { terminal, worktree } = await setUp();
    await terminal.run(session, 'tab-1', 'echo broke >&2; exit 3', worktree);
    expect(await lastEnded(terminal)).toMatchObject({ state: 'failed', exitCode: 3, output: ['broke'] });

    await terminal.run(session, 'tab-1', 'nosuchcommand', worktree);
    const missing = await lastEnded(terminal);
    expect(missing).toMatchObject({ state: 'failed', exitCode: 127 });
    if (missing.state !== 'failed') throw new Error('it failed');
    expect(missing.output.join('\n')).toMatch(/not found/);
  });

  it('AC-7: each command starts in the worktree: cd doesn’t carry over', async () => {
    const { terminal, worktree } = await setUp();
    await mkdir(join(worktree, 'src'));
    await terminal.run(session, 'tab-1', 'cd src && pwd', worktree);
    expect(await lastEnded(terminal)).toMatchObject({ output: [join(worktree, 'src')] });
    await terminal.run(session, 'tab-1', 'pwd', worktree);
    expect(await lastEnded(terminal)).toMatchObject({ output: [worktree] });
  });

  it('AC-8, AC-9: shows a running command’s output as it comes, runs one at a time, and Stop ends it', async () => {
    const { terminal, worktree } = await setUp();
    await terminal.run(session, 'tab-1', 'echo ready; sleep 30', worktree);
    expect(await printed(terminal, 'ready')).toMatchObject({ state: 'running', output: ['ready'] });
    expect(await terminal.run(session, 'tab-1', 'git status', worktree)).toEqual({ result: 'busy' });

    expect(await terminal.stop(session, 'tab-1')).toBe(true);
    expect(await lastEnded(terminal)).toMatchObject({ state: 'failed', exitCode: 143, output: ['ready'] });
    expect(await terminal.stop(session, 'tab-1')).toBe(false);
  });

  it('AC-9: ends a command that ignores Stop’s first signal once the wait is over', async () => {
    const { terminal, worktree } = await setUp({ stopGraceMs: 100 });
    await terminal.run(session, 'tab-1', "trap '' TERM; echo ready; sleep 30", worktree);
    await printed(terminal, 'ready');
    await terminal.stop(session, 'tab-1');
    expect(await lastEnded(terminal)).toMatchObject({ state: 'failed', exitCode: 137 });
  });

  it('AC-10, AC-11: adds tabs up to 5, and closing one stops its command; the first one stays', async () => {
    const { terminal, worktree } = await setUp();
    terminal.read(session, worktree);
    const added = [1, 2, 3, 4].map(() => terminal.addTab(session));
    expect(added).toEqual(['tab-2', 'tab-3', 'tab-4', 'tab-5'].map((tabId) => ({ result: 'added', tabId })));
    expect(terminal.addTab(session)).toEqual({ result: 'full' });
    expect(terminal.read(session, worktree).tabs.map((tab) => tab.number)).toEqual([1, 2, 3, 4, 5]);

    await terminal.run(session, 'tab-3', 'echo ready; sleep 30', worktree);
    await printed(terminal, 'ready', 'tab-3');
    expect(await terminal.closeTab(session, 'tab-3')).toBe(true);
    expect(terminal.read(session, worktree).tabs.map((tab) => tab.id)).toEqual(['tab-1', 'tab-2', 'tab-4', 'tab-5']);
    expect(await terminal.closeTab(session, 'tab-1')).toBe(false);
    expect(await terminal.closeTab(session, 'tab-9')).toBe(false);
    expect(terminal.addTab(session)).toEqual({ result: 'added', tabId: 'tab-6' });
  });

  it('AC-15: Clear empties the tab and says so; ↑ still finds the commands', async () => {
    const { terminal, worktree } = await setUp();
    await terminal.run(session, 'tab-1', 'echo one', worktree);
    await lastEnded(terminal);
    expect(terminal.clear(session, 'tab-1')).toBe(true);
    expect(terminal.read(session, worktree)).toMatchObject({
      tabs: [{ id: 'tab-1', blocks: [], cleared: true }],
      history: ['echo one'],
    });
    expect(terminal.clear(session, 'tab-9')).toBe(false);
  });

  it('AC-16: keeps the last 2,000 lines of a long output, and the last commands of a tab', async () => {
    // Three kept, not 100: each command starts a login shell, and 101 of them crowd a loaded run.
    const { terminal, worktree } = await setUp({ blocksKept: 3 });
    await terminal.run(session, 'tab-1', 'i=0; while [ $i -lt 3000 ]; do echo "line $i"; i=$((i+1)); done', worktree);
    const block = await lastEnded(terminal);
    expect(block).toMatchObject({ state: 'done', cut: true });
    if (block.state !== 'done') throw new Error('it ended');
    expect(block.output).toHaveLength(2000);
    expect(block.output.at(-1)).toBe('line 2999');

    for (const n of [1, 2, 3]) {
      await terminal.run(session, 'tab-1', `echo ${String(n)}`, worktree);
      await lastEnded(terminal);
    }
    const kept = terminal.read(session, worktree);
    expect(kept.tabs[0]?.blocks.map((one) => one.command)).toEqual(['echo 1', 'echo 2', 'echo 3']);
    expect(kept.history).toEqual(['echo 1', 'echo 2', 'echo 3']);
  });

  it('AC-16: removes the colour codes a command prints', async () => {
    const { terminal, worktree } = await setUp();
    await terminal.run(session, 'tab-1', "printf '\\033[31mred\\033[0m\\n'", worktree);
    expect(await lastEnded(terminal)).toMatchObject({ output: ['red'] });
  });

  it('AC-25: runs nothing when the worktree isn’t there any more', async () => {
    const { terminal, worktree } = await setUp();
    const gone = join(worktree, 'deleted');
    expect(await terminal.run(session, 'tab-1', 'touch here', gone)).toEqual({ result: 'started', blockId: 'block-1' });
    expect(terminal.read(session, gone).tabs[0]?.blocks).toEqual([
      { id: 'block-1', state: 'no_worktree', command: 'touch here' },
    ]);
  });

  it('answers null for a tab it doesn’t have', async () => {
    const { terminal, worktree } = await setUp();
    expect(await terminal.run(session, 'tab-9', 'ls', worktree)).toBeNull();
    expect(await terminal.stop(session, 'tab-9')).toBe(false);
  });

  it('AC-28: stopAll ends every command in the session’s tabs and forgets them, as Discard needs', async () => {
    const { terminal, worktree } = await setUp();
    terminal.read(session, worktree);
    terminal.addTab(session);
    await terminal.run(session, 'tab-1', 'echo one; sleep 30', worktree);
    await terminal.run(session, 'tab-2', 'echo two; sleep 30', worktree);
    await printed(terminal, 'one');
    await printed(terminal, 'two', 'tab-2');

    await terminal.stopAll(session);
    expect(terminal.read(session, worktree)).toMatchObject({ tabs: [{ id: 'tab-1', blocks: [] }], history: [] });
  });
});

describe('terminalEnvironment', () => {
  it('AC-29: is your environment without Orynx’s own settings, and asks tools for plain output', () => {
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
    ).toEqual({ PATH: '/usr/bin', HOME: '/Users/you', EDITOR: 'vim', NO_COLOR: '1' });
  });
});
