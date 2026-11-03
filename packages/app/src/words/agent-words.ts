import type { AgentId } from '@devhub/contracts';

/**
 * Words written for Claude, said for the agent a session or the composer is on (spec 052, Q4): a Codex session says
 * Codex wherever Claude's says Claude, and Claude Code, its program, is Codex too. A line naming a command of Claude
 * Code's has words of its own for Codex instead.
 */
export function forAgent(words: string, agent: AgentId): string {
  return agent === 'codex' ? words.replaceAll('Claude Code', 'Codex').replaceAll('Claude', 'Codex') : words;
}
