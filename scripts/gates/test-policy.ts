import type { Gate } from '../lib/gate.ts';
import { findTestPolicyViolations, inTestPolicyScope } from '../lib/policies/test-policy.ts';

const gate: Gate = {
  id: 'test-policy',
  description: 'Honest tests: no test ids, no mocking our own code, no .only, no snapshots',
  mode: 'fail',
  when: 'always',
  run(ctx) {
    return ctx.files.filter(inTestPolicyScope).flatMap((file) => findTestPolicyViolations(file, ctx.read(file)));
  },
};

export default gate;
