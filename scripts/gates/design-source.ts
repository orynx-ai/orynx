import type { Finding, Gate } from '../lib/gate.ts';
import { checkDesignNote, isScreenFile } from '../lib/policies/design-source.ts';

const gate: Gate = {
  id: 'design-source',
  description: 'Every *-screen.tsx starts with a // Design: note naming its reference in docs/design/screens/',
  mode: 'fail',
  when: 'always',
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.files.filter(isScreenFile)) {
      const result = checkDesignNote(file, ctx.read(file));
      if (result.finding) findings.push(result.finding);
      if (result.reference !== null && !ctx.exists(result.reference)) {
        findings.push({
          file,
          line: 1,
          rule: 'missing-reference',
          message: `the Design note points at ${result.reference}, which does not exist`,
          fix: 'point it at a file in docs/design/screens/, or write "// Design: none — <reason>"',
        });
      }
    }
    return findings;
  },
};

export default gate;
