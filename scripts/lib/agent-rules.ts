export const AGENT_RULE_FILES = ['AGENTS.md', '.github/copilot-instructions.md', '.cursor/rules/00-core.mdc'] as const;

const START = '<!-- agent-rules:start -->';
const END = '<!-- agent-rules:end -->';

const HEADER = '<!-- Generated from CLAUDE.md by `pnpm agent-rules`. Do not edit by hand. -->';
const INTRO = [
  '# DevHub — rules for coding agents',
  '',
  "DevHub is a local web app plus a small local server, both on the developer's laptop. It shows the Jira, GitHub and Slack work that needs you, and runs Claude on a ticket in a separate git worktree. The full handbook is CLAUDE.md; read it first.",
].join('\n');
const CURSOR_FRONTMATTER = '---\ndescription: DevHub core rules (generated)\nalwaysApply: true\n---';

/** The text between the agent-rules markers in CLAUDE.md. Throws when the markers are missing. */
export function extractRulesBlock(claudeMd: string): string {
  const start = claudeMd.indexOf(START);
  const end = claudeMd.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`CLAUDE.md must contain "${START}" … "${END}" around the shared rules`);
  }
  return claudeMd.slice(start + START.length, end).trim();
}

/** Renders every generated agent file from CLAUDE.md, keyed by repo path. */
export function renderAgentFiles(claudeMd: string): Record<string, string> {
  const body = `${HEADER}\n\n${INTRO}\n\n${extractRulesBlock(claudeMd)}\n`;
  return {
    'AGENTS.md': body,
    '.github/copilot-instructions.md': body,
    '.cursor/rules/00-core.mdc': `${CURSOR_FRONTMATTER}\n\n${body}`,
  };
}

/** Paths whose content on disk differs from what CLAUDE.md renders. `read` returns null for a missing file. */
export function staleAgentFiles(claudeMd: string, read: (path: string) => string | null): string[] {
  const rendered = renderAgentFiles(claudeMd);
  return Object.entries(rendered)
    .filter(([path, content]) => read(path) !== content)
    .map(([path]) => path);
}
