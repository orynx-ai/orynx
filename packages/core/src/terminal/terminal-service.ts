import { spawn, type ChildProcess } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { constants } from 'node:os';
import { basename, sep } from 'node:path';
import {
  terminalLimits,
  type AddTerminalTabAnswer,
  type RunCommandAnswer,
  type Terminal,
  type TerminalBlock,
} from '@devhub/contracts';
import type { EventBus } from '../events/event-bus.ts';
import type { StoredSession } from '../sessions/session-store.ts';
import { createOutputBuffer, type OutputBuffer } from './output.ts';

/**
 * Your shell tabs in a session's Terminal (spec 036). Each command runs in your login shell, from the session's
 * worktree, as you, outside Claude's sandbox: it's your own Enter or click, never Claude's (CLAUDE.md rule 11).
 * One command at a time in a tab, in a process group of its own so Stop ends whatever it started. Nothing reads
 * from the keyboard, and nothing here is logged: a command and its output can hold anything.
 */

export interface TerminalServiceOptions {
  events: EventBus;
  /** What your commands get: `terminalEnvironment()`'s. Its SHELL is the shell they run in. */
  env: Readonly<Record<string, string>>;
  /** Your home, shown as `~` in the worktree's path. */
  home: string;
  /** Output tells the page at most this often while it comes; 250 ms (Q8). */
  eventMs?: number;
  /** How long Stop waits after SIGTERM before SIGKILL; 5 s. */
  stopGraceMs?: number;
  now?: () => number;
}

export interface TerminalService {
  /** The session's tabs, with one empty tab the first time. `worktree` is only for the meta line. */
  read(sessionId: string, worktree: string): Terminal;
  addTab(sessionId: string): AddTerminalTabAnswer;
  /** Stops the tab's command and closes it; false for the first tab or one that isn't there. */
  closeTab(sessionId: string, tabId: string): Promise<boolean>;
  /** Runs `command` in `worktree`; null for no such tab. */
  run(sessionId: string, tabId: string, command: string, worktree: string): Promise<RunCommandAnswer | null>;
  /** Stops the tab's running command; false when nothing runs there. */
  stop(sessionId: string, tabId: string): Promise<boolean>;
  clear(sessionId: string, tabId: string): boolean;
  /** One block as it is now, for Ask Claude to fix; null when it isn't there. */
  block(sessionId: string, tabId: string, blockId: string): TerminalBlock | null;
  /** Stops every command in the session's tabs and forgets them: Discard, before the worktree goes. */
  stopAll(sessionId: string): Promise<void>;
  /** Stops every command in every session, for the server's shutdown. */
  close(): Promise<void>;
}

/** Where a session's Terminal runs (spec 036, Q9): a Build's worktree, until it's discarded; null when it has none. */
export function terminalWorktree({ session, worktree }: Pick<StoredSession, 'session' | 'worktree'>): string | null {
  return session.mode === 'build' && session.discardedAt === null ? worktree : null;
}

/** What Orynx's own process is set up with (every key in `.env.example`), which your commands mustn't inherit. */
function isOrynxSetting(name: string): boolean {
  return name.startsWith('DEVHUB_') || name === 'NODE_ENV' || name === 'LOG_LEVEL';
}

/** Your environment for your commands: Orynx's settings and tokens left out, and tools asked for plain output. */
export function terminalEnvironment(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) if (value !== undefined && !isOrynxSetting(name)) kept[name] = value;
  return { ...kept, NO_COLOR: '1' };
}

type BlockEnd =
  | { state: 'done'; ms: number }
  | { state: 'failed'; exitCode: number; ms: number }
  /** Nothing ran: the worktree wasn't there (AC-25). */
  | { state: 'no_worktree' };

interface Block {
  id: string;
  command: string;
  startedAt: number;
  output: OutputBuffer;
  /** Null once it has ended, and for one that never ran. */
  child: ChildProcess | null;
  ended: Promise<void>;
  /** Null while it runs. */
  end: BlockEnd | null;
}

interface Tab {
  id: string;
  number: number;
  blocks: Block[];
  cleared: boolean;
}

interface SessionTerminal {
  tabs: Tab[];
  history: string[];
  tabsMade: number;
  blocksMade: number;
}

/** The shell's exit code for a process a signal ended: 128 plus the signal's number, as `$?` says. */
function exitCodeOf(code: number | null, signal: NodeJS.Signals | null): number {
  if (code !== null) return code;
  return 128 + (signal === null ? 0 : constants.signals[signal]);
}

function blockOf(block: Block): TerminalBlock {
  const { id, command, end } = block;
  if (end?.state === 'no_worktree') return { id, command, state: 'no_worktree' };
  const output = block.output.read();
  return end === null ? { id, command, state: 'running', ...output } : { id, command, ...output, ...end };
}

async function isFolder(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export function createTerminalService(options: TerminalServiceOptions): TerminalService {
  const { events, env, home } = options;
  const eventMs = options.eventMs ?? 250;
  const stopGraceMs = options.stopGraceMs ?? 5_000;
  const now = options.now ?? Date.now;
  const shell = env['SHELL'] ?? '/bin/sh';
  const sessions = new Map<string, SessionTerminal>();
  const telling = new Map<string, NodeJS.Timeout>();

  /** Tells the page now: a command started or ended, or a tab came or went. */
  function tell(sessionId: string) {
    clearTimeout(telling.get(sessionId));
    telling.delete(sessionId);
    events.publish({ type: 'session.terminal.changed', sessionId });
  }

  /** Tells the page soon: output came, and more may follow. */
  function tellSoon(sessionId: string) {
    if (telling.has(sessionId)) return;
    telling.set(
      sessionId,
      setTimeout(() => {
        tell(sessionId);
      }, eventMs),
    );
  }

  function terminalOf(sessionId: string): SessionTerminal {
    let terminal = sessions.get(sessionId);
    if (terminal === undefined) {
      terminal = {
        tabs: [{ id: 'tab-1', number: 1, blocks: [], cleared: false }],
        history: [],
        tabsMade: 1,
        blocksMade: 0,
      };
      sessions.set(sessionId, terminal);
    }
    return terminal;
  }

  function tabOf(sessionId: string, tabId: string): Tab | undefined {
    return terminalOf(sessionId).tabs.find((tab) => tab.id === tabId);
  }

  /** Ends a block's process group: SIGTERM, then SIGKILL if it's still there after the wait. */
  async function halt(block: Block): Promise<void> {
    const pid = block.child?.pid;
    if (pid === undefined || block.end !== null) return;
    const signal = (name: NodeJS.Signals) => {
      try {
        process.kill(-pid, name);
      } catch {
        // Gone already.
      }
    };
    signal('SIGTERM');
    const kill = setTimeout(() => {
      signal('SIGKILL');
    }, stopGraceMs);
    await block.ended;
    clearTimeout(kill);
  }

  function start(sessionId: string, block: Block, worktree: string) {
    const child = spawn(shell, ['-l', '-c', block.command], {
      cwd: worktree,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    block.child = child;
    const heard = (chunk: string) => {
      block.output.add(chunk);
      tellSoon(sessionId);
    };
    child.stdout.setEncoding('utf8').on('data', heard);
    child.stderr.setEncoding('utf8').on('data', heard);
    block.ended = new Promise((resolve) => {
      const finish = (exitCode: number) => {
        if (block.end !== null) return;
        const ms = Math.max(0, now() - block.startedAt);
        block.end = exitCode === 0 ? { state: 'done', ms } : { state: 'failed', exitCode, ms };
        block.child = null;
        tell(sessionId);
        resolve();
      };
      // `close` comes once the output has all been read; `error` when the shell couldn't start at all.
      child.on('close', (code, signal) => {
        finish(exitCodeOf(code, signal));
      });
      child.on('error', (error) => {
        block.output.add(`${error.message}\n`);
        finish(127);
      });
    });
  }

  async function stopAll(sessionId: string): Promise<void> {
    const terminal = sessions.get(sessionId);
    if (terminal === undefined) return;
    await Promise.all(terminal.tabs.flatMap((tab) => tab.blocks.map(halt)));
    sessions.delete(sessionId);
    clearTimeout(telling.get(sessionId));
    telling.delete(sessionId);
  }

  return {
    read(sessionId, worktree) {
      const terminal = terminalOf(sessionId);
      return {
        shell: basename(shell),
        worktree:
          worktree === home ? '~' : worktree.startsWith(home + sep) ? `~${worktree.slice(home.length)}` : worktree,
        tabs: terminal.tabs.map((tab) => ({ ...tab, blocks: tab.blocks.map(blockOf) })),
        history: [...terminal.history],
      };
    },

    addTab(sessionId) {
      const terminal = terminalOf(sessionId);
      if (terminal.tabs.length >= terminalLimits.tabs) return { result: 'full' };
      terminal.tabsMade += 1;
      const tab = { id: `tab-${String(terminal.tabsMade)}`, number: terminal.tabsMade, blocks: [], cleared: false };
      terminal.tabs.push(tab);
      tell(sessionId);
      return { result: 'added', tabId: tab.id };
    },

    async closeTab(sessionId, tabId) {
      const tab = tabOf(sessionId, tabId);
      if (tab === undefined || tab.number === 1) return false;
      await Promise.all(tab.blocks.map(halt));
      const terminal = terminalOf(sessionId);
      terminal.tabs = terminal.tabs.filter((other) => other !== tab);
      tell(sessionId);
      return true;
    },

    async run(sessionId, tabId, command, worktree) {
      const tab = tabOf(sessionId, tabId);
      if (tab === undefined) return null;
      if (tab.blocks.at(-1)?.end === null) return { result: 'busy' };
      const terminal = terminalOf(sessionId);
      terminal.blocksMade += 1;
      terminal.history = [...terminal.history, command].slice(-terminalLimits.blocks);
      const block: Block = {
        id: `block-${String(terminal.blocksMade)}`,
        command,
        startedAt: now(),
        output: createOutputBuffer(),
        child: null,
        ended: Promise.resolve(),
        end: null,
      };
      tab.blocks = [...tab.blocks, block].slice(-terminalLimits.blocks);
      if (await isFolder(worktree)) start(sessionId, block, worktree);
      else block.end = { state: 'no_worktree' };
      tell(sessionId);
      return { result: 'started', blockId: block.id };
    },

    async stop(sessionId, tabId) {
      const block = tabOf(sessionId, tabId)?.blocks.at(-1);
      if (block?.end !== null) return false;
      await halt(block);
      return true;
    },

    clear(sessionId, tabId) {
      const tab = tabOf(sessionId, tabId);
      if (tab === undefined) return false;
      // A running command keeps its block: it's still yours to Stop.
      tab.blocks = tab.blocks.filter((block) => block.end === null);
      tab.cleared = true;
      tell(sessionId);
      return true;
    },

    block(sessionId, tabId, blockId) {
      const block = sessions
        .get(sessionId)
        ?.tabs.find((tab) => tab.id === tabId)
        ?.blocks.find((one) => one.id === blockId);
      return block === undefined ? null : blockOf(block);
    },

    stopAll,

    async close() {
      await Promise.all([...sessions.keys()].map(stopAll));
    },
  };
}
