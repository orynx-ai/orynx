import type { Finding, Gate } from '../lib/gate.ts';
import { staleAgentFiles } from '../lib/agent-rules.ts';

const gate: Gate = {
  id: 'agent-rules',
  description: 'AGENTS.md, Copilot and Cursor rules match the rules block in CLAUDE.md',
  mode: 'fail',
  when: 'always',
  run(ctx) {
    let stale: string[];
    try {
      stale = staleAgentFiles(ctx.read('CLAUDE.md'), (path) => (ctx.exists(path) ? ctx.read(path) : null));
    } catch (error) {
      return [
        {
          file: 'CLAUDE.md',
          line: 0,
          rule: 'missing-markers',
          message: String(error instanceof Error ? error.message : error),
          fix: 'restore the <!-- agent-rules:start --> and <!-- agent-rules:end --> markers',
        },
      ];
    }
    return stale.map((file): Finding => ({
      file,
      line: 0,
      rule: 'stale-agent-file',
      message: ctx.exists(file) ? 'does not match the rules in CLAUDE.md' : 'is missing',
      fix: 'run `pnpm agent-rules` (never edit generated agent files by hand)',
    }));
  },
};

export default gate;
