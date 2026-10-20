/** Every word the session's Terminal shows (spec 036, Q8; spec 038), in one place. */
export const terminalWords = {
  button: 'Terminal',
  title: 'Terminal',
  closeTerminal: 'Close terminal',
  tabs: 'Terminals',
  claude: 'Claude',
  needsYou: 'Needs you',
  claudeNeedsYou: 'Claude needs you',
  copy: 'Copy',
  tryAgain: 'Try again',
  // The Claude tab (Q8g, Q8i).
  sandbox: 'Sandbox',
  readOnly: 'Read-only',
  claudeMeta: "Commands Claude ran in this session's worktree",
  claudeLog: "Claude's commands",
  claudeFoot: 'Read-only. This is what Claude ran. Ask it for changes in the session, or type in your own terminal.',
  nothingYet: 'Nothing yet.',
  claudeNotLoaded: "Couldn't load Claude's commands",
  noOutput: "Output wasn't kept for this command.",
  denied: 'Denied by you. Claude will continue without it.',
  sentFromTerminal: 'Sent from your terminal:',
  // Your shell tabs (Q8b to Q8l).
  yourShell: 'Your shell · runs as you',
  shellLog: 'Terminal output',
  newTab: 'New terminal in this session',
  tabsFull: '5 terminals is the most for a session.',
  close: 'Close',
  unreachable: "Couldn't reach Orynx.",
} as const;

/** A shell tab's name: the first is the worktree's own, "zsh · worktree"; the next "zsh 2", "zsh 3"… */
export function shellTabName(shell: string, number: number): string {
  return number === 1 ? `${shell} · worktree` : `${shell} ${String(number)}`;
}

/** How long a command ran: "0.1s" and "3.1s", then "2m 4s". */
export function duration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const seconds = Math.round(ms / 1000);
  return `${String(Math.floor(seconds / 60))}m ${String(seconds % 60)}s`;
}

/** A command's status in the Claude tab, with its mark (the design's). Claude Code gives no exit code: "failed". */
export const statusWords = {
  running: '● running',
  waiting: '● waiting for you',
  done: (ms: number) => `✓ ${duration(ms)}`,
  failed: (ms: number) => `✗ failed · ${duration(ms)}`,
  stopped: 'stopped',
  denied: 'denied',
  refused: 'refused',
} as const;

/** Above a block that holds only its last lines (Q8j). */
export function cutNote(lines: number): string {
  return `Showing the last ${lines.toLocaleString('en')} lines.`;
}

/** Copy's name: the command and its output are too long to read out (AC-14). */
export function copyWhat(command: string): string {
  return `${command} and its output`;
}
