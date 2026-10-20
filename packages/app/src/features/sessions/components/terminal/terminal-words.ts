/** Every word the session's Terminal shows (spec 036, Q8), in one place. */
export const terminalWords = {
  button: 'Terminal',
  title: 'Terminal',
  back: 'Back to session',
  tabs: 'Terminals',
  claude: 'Claude',
  needsYou: 'Needs you',
  claudeNeedsYou: 'Claude needs you',
} as const;

/** A shell tab's name: the first is the worktree's own, "zsh · worktree"; the next "zsh 2", "zsh 3"… */
export function shellTabName(shell: string, number: number): string {
  return number === 1 ? `${shell} · worktree` : `${shell} ${String(number)}`;
}
