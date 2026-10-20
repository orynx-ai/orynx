import { statSync } from 'node:fs';
import { basename, sep } from 'node:path';
import { spawn, type IPty } from '@lydell/node-pty';
import {
  terminalLimits,
  type AddTerminalTabAnswer,
  type Terminal,
  type TerminalOutput,
  type TerminalSize,
} from '@devhub/contracts';
import type { EventBus } from '../events/event-bus.ts';
import type { StoredSession } from '../sessions/session-store.ts';

/**
 * Your shell tabs in a session's Terminal (spec 036, spec 038). Each tab is a real terminal: your login shell on
 * a pseudo-terminal, started in the session's worktree, as you, outside Claude's sandbox. What you type goes
 * straight to it, so prompts, full-screen programs, colours and `cd` work as in any terminal. Those are your own
 * keys, never Claude's (CLAUDE.md rule 11). Nothing here is logged: what you type and what it prints can hold anything.
 */

export interface TerminalServiceOptions {
  events: EventBus;
  /** What your shells get: `terminalEnvironment()`'s. Its SHELL is the shell each tab runs. */
  env: Readonly<Record<string, string>>;
  /** Your home, shown as `~` in the worktree's path. */
  home: string;
  /** How long closing a tab waits after SIGHUP before SIGKILL; 5 s. */
  stopGraceMs?: number;
  /** How much of a tab's output it keeps, to draw again when you come back; 500,000 characters. */
  keptChars?: number;
}

/** Hears a tab's output: first all it keeps, then each piece as the shell writes it. */
export type TerminalListener = (frame: TerminalOutput) => void;

export interface TerminalService {
  /** The session's tabs, the first one's shell started the first time. Shells start in `worktree`. */
  read(sessionId: string, worktree: string): Terminal;
  addTab(sessionId: string, worktree: string): AddTerminalTabAnswer;
  /** Ends the tab's shell and closes it; false for the first tab or one that isn't there. */
  closeTab(sessionId: string, tabId: string): Promise<boolean>;
  /** Tells `listener` the tab's output until the returned function is called; null for no such tab. */
  listen(sessionId: string, tabId: string, listener: TerminalListener): (() => void) | null;
  /** Types into the tab's shell, or starts a new one if it ended; false for no such tab. */
  write(sessionId: string, tabId: string, data: string): boolean;
  /** Sets the tab's size, which full-screen programs draw to; false for no such tab. */
  resize(sessionId: string, tabId: string, size: TerminalSize): boolean;
  /** Ends every shell in the session's tabs and forgets them: Discard, before the worktree goes. */
  stopAll(sessionId: string): Promise<void>;
  /** Ends every shell in every session, for the server's shutdown. */
  close(): Promise<void>;
}

/** Where a session's Terminal runs (spec 036, Q9): a Build's worktree, until it's discarded; null when it has none. */
export function terminalWorktree({ session, worktree }: Pick<StoredSession, 'session' | 'worktree'>): string | null {
  return session.mode === 'build' && session.discardedAt === null ? worktree : null;
}

/** What Orynx's own process is set up with (every key in `.env.example`), which your shells mustn't inherit. */
function isOrynxSetting(name: string): boolean {
  return name.startsWith('DEVHUB_') || name === 'NODE_ENV' || name === 'LOG_LEVEL';
}

/** Your environment for your shells: Orynx's settings and tokens left out, and a terminal that draws colour. */
export function terminalEnvironment(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) if (value !== undefined && !isOrynxSetting(name)) kept[name] = value;
  return { ...kept, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
}

// The approved words for a worktree that's gone (spec 036, Q8d), dimmed as a terminal's own note.
const noWorktree = "\u001b[2mCouldn't run this. The worktree isn't there any more.\u001b[0m\r\n";
const shellEnded = '\r\n\u001b[2mYour shell ended. Press any key to start a new one.\u001b[0m\r\n';

interface Tab {
  id: string;
  number: number;
  worktree: string;
  size: TerminalSize;
  /** Null once it has ended, and when the worktree wasn't there to start it in. */
  shell: IPty | null;
  ended: Promise<void>;
  /** The output so far, the oldest dropped past `keptChars`. */
  kept: string;
  listeners: Set<TerminalListener>;
  /** Set once it's closing, so its shell's end neither starts another nor closes it twice. */
  closing: boolean;
}

interface SessionTerminal {
  tabs: Tab[];
  tabsMade: number;
}

export function createTerminalService(options: TerminalServiceOptions): TerminalService {
  const { events, env, home } = options;
  const stopGraceMs = options.stopGraceMs ?? 5_000;
  const keptChars = options.keptChars ?? 500_000;
  const shell = env['SHELL'] ?? '/bin/sh';
  const sessions = new Map<string, SessionTerminal>();

  function tell(sessionId: string) {
    events.publish({ type: 'session.terminal.changed', sessionId });
  }

  /** Keeps what the shell wrote and passes it on. */
  function heard(tab: Tab, data: string) {
    if (data === '') return;
    // Trimmed only past twice the limit, so a flood costs one copy per `keptChars`, not one per piece; and from a
    // line's start, so drawing it again doesn't begin halfway through a colour code.
    const all = tab.kept + data;
    const from = all.length > 2 * keptChars ? all.indexOf('\n', all.length - keptChars) : -1;
    tab.kept = from === -1 ? all : all.slice(from + 1);
    for (const listener of tab.listeners) listener({ kind: 'data', data });
  }

  function start(sessionId: string, tab: Tab) {
    if (statSync(tab.worktree, { throwIfNoEntry: false })?.isDirectory() !== true) {
      heard(tab, noWorktree);
      return;
    }
    let pty: IPty;
    try {
      pty = spawn(shell, ['-l'], { name: 'xterm-256color', cwd: tab.worktree, env, ...tab.size });
    } catch (error) {
      heard(tab, `${error instanceof Error ? error.message : String(error)}\r\n`);
      return;
    }
    tab.shell = pty;
    pty.onData((data) => {
      heard(tab, data);
    });
    tab.ended = new Promise((resolve) => {
      pty.onExit(() => {
        tab.shell = null;
        resolve();
        if (tab.closing) return;
        // `exit` closes a tab, as in any terminal; the first stays, and a key starts a new shell in it.
        if (tab.number === 1) heard(tab, shellEnded);
        else void closeTab(sessionId, tab.id);
      });
    });
  }

  function newTab(sessionId: string, number: number, worktree: string): Tab {
    const tab: Tab = {
      id: `tab-${String(number)}`,
      number,
      worktree,
      size: { cols: 80, rows: 24 },
      shell: null,
      ended: Promise.resolve(),
      kept: '',
      listeners: new Set(),
      closing: false,
    };
    start(sessionId, tab);
    return tab;
  }

  function terminalOf(sessionId: string, worktree: string): SessionTerminal {
    let terminal = sessions.get(sessionId);
    if (terminal === undefined) {
      terminal = { tabs: [newTab(sessionId, 1, worktree)], tabsMade: 1 };
      sessions.set(sessionId, terminal);
    }
    return terminal;
  }

  function tabOf(sessionId: string, tabId: string): Tab | undefined {
    return sessions.get(sessionId)?.tabs.find((tab) => tab.id === tabId);
  }

  /** Ends a tab's shell: SIGHUP, as closing a terminal window sends, then SIGKILL if it's still there after the wait. */
  async function end(tab: Tab): Promise<void> {
    tab.closing = true;
    const pty = tab.shell;
    if (pty === null) return;
    const signal = (name: string) => {
      try {
        pty.kill(name);
      } catch {
        // Gone already.
      }
    };
    signal('SIGHUP');
    const kill = setTimeout(() => {
      signal('SIGKILL');
    }, stopGraceMs);
    await tab.ended;
    clearTimeout(kill);
  }

  async function closeTab(sessionId: string, tabId: string): Promise<boolean> {
    const terminal = sessions.get(sessionId);
    const tab = tabOf(sessionId, tabId);
    if (terminal === undefined || tab === undefined || tab.number === 1) return false;
    await end(tab);
    terminal.tabs = terminal.tabs.filter((other) => other !== tab);
    tell(sessionId);
    return true;
  }

  async function stopAll(sessionId: string): Promise<void> {
    const terminal = sessions.get(sessionId);
    if (terminal === undefined) return;
    sessions.delete(sessionId);
    await Promise.all(terminal.tabs.map(end));
  }

  return {
    read(sessionId, worktree) {
      const terminal = terminalOf(sessionId, worktree);
      return {
        shell: basename(shell),
        worktree:
          worktree === home ? '~' : worktree.startsWith(home + sep) ? `~${worktree.slice(home.length)}` : worktree,
        tabs: terminal.tabs.map(({ id, number }) => ({ id, number })),
      };
    },

    addTab(sessionId, worktree) {
      const terminal = terminalOf(sessionId, worktree);
      if (terminal.tabs.length >= terminalLimits.tabs) return { result: 'full' };
      terminal.tabsMade += 1;
      const tab = newTab(sessionId, terminal.tabsMade, worktree);
      terminal.tabs.push(tab);
      tell(sessionId);
      return { result: 'added', tabId: tab.id };
    },

    closeTab,

    listen(sessionId, tabId, listener) {
      const tab = tabOf(sessionId, tabId);
      if (tab === undefined) return null;
      listener({ kind: 'replay', data: tab.kept });
      tab.listeners.add(listener);
      return () => {
        tab.listeners.delete(listener);
      };
    },

    write(sessionId, tabId, data) {
      const tab = tabOf(sessionId, tabId);
      if (tab === undefined) return false;
      if (tab.shell !== null) tab.shell.write(data);
      else if (!tab.closing) start(sessionId, tab);
      return true;
    },

    resize(sessionId, tabId, size) {
      const tab = tabOf(sessionId, tabId);
      if (tab === undefined) return false;
      tab.size = size;
      try {
        tab.shell?.resize(size.cols, size.rows);
      } catch {
        // It ended a moment ago; the next shell starts at this size.
      }
      return true;
    },

    stopAll,

    async close() {
      await Promise.all([...sessions.keys()].map(stopAll));
    },
  };
}
