import type { Finding, Gate } from '../lib/gate.ts';

export const HANDBOOK = 'CLAUDE.md';
export const HANDBOOK_LIMIT_BYTES = 10_240;
const PATH_PREFIXES = ['docs/', '.claude/', 'learn/', 'packages/', 'apps/', 'specs/', 'scripts/'];

/** CLAUDE.md stays small, names only real gates and links only to files that exist. */
export function checkHandbook(
  content: string,
  gateIds: readonly string[],
  exists: (path: string) => boolean,
): Finding[] {
  const findings: Finding[] = [];
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > HANDBOOK_LIMIT_BYTES) {
    findings.push({
      file: HANDBOOK,
      line: 0,
      rule: 'too-big',
      message: `${bytes} bytes; the limit is ${HANDBOOK_LIMIT_BYTES} (the agent re-reads it every turn)`,
      fix: 'move detail into the linked docs or a skill, and keep only the rule and its link here',
    });
  }
  const lines = content.split('\n');
  lines.forEach((text, index) => {
    for (const m of text.matchAll(/pnpm gate ([a-z0-9][a-z0-9-]*)/g)) {
      const id = m[1] ?? '';
      if (!gateIds.includes(id)) {
        findings.push({
          file: HANDBOOK,
          line: index + 1,
          rule: 'unknown-gate',
          message: `names "pnpm gate ${id}", but there is no gate "${id}"`,
          fix: `use one of: ${gateIds.join(', ')}`,
        });
      }
    }
    for (const m of text.matchAll(/`([^`\s]+)`/g)) {
      const path = (m[1] ?? '').replace(/[.,;:)]+$/, '');
      if (!PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) continue;
      if (/[*<>|{}]/.test(path)) continue;
      if (!exists(path)) {
        findings.push({
          file: HANDBOOK,
          line: index + 1,
          rule: 'broken-link',
          message: `links to ${path}, which does not exist`,
          fix: 'create the file or fix the path',
        });
      }
    }
  });
  return findings;
}

const gate: Gate = {
  id: 'handbook-size',
  description: 'CLAUDE.md is at most 10 KB, names only real gates and links only to files that exist',
  mode: 'fail',
  when: 'always',
  run(ctx) {
    if (!ctx.exists(HANDBOOK)) {
      return [
        {
          file: HANDBOOK,
          line: 0,
          rule: 'missing',
          message: 'CLAUDE.md is missing',
          fix: 'restore the agent handbook',
        },
      ];
    }
    return checkHandbook(ctx.read(HANDBOOK), ctx.gateIds, (path) => ctx.exists(path));
  },
};

export default gate;
