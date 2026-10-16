import type { Finding, Gate } from '../lib/gate.ts';
import { checkSecretFileName, findSecretsInContent, shouldScanContent } from '../lib/policies/secrets.ts';

const gate: Gate = {
  id: 'secrets',
  description: 'No .env files, keys or tokens in git',
  mode: 'fail',
  when: 'always',
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.files) {
      const named = checkSecretFileName(file);
      if (named) {
        findings.push(named);
        continue;
      }
      if (shouldScanContent(file)) findings.push(...findSecretsInContent(file, ctx.read(file)));
    }
    return findings;
  },
};

export default gate;
