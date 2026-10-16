import type { Gate } from '../lib/gate.ts';
import { findEnvViolations, inEnvScope, parseEnvExample } from '../lib/policies/env.ts';

const gate: Gate = {
  id: 'env-policy',
  description:
    'Only apps/*/src/config.ts (and the Vite/Playwright configs) read the environment; every key is in .env.example',
  mode: 'fail',
  when: 'always',
  run(ctx) {
    if (!ctx.exists('.env.example')) {
      return [
        {
          file: '.env.example',
          line: 0,
          rule: 'missing-example',
          message: '.env.example is missing',
          fix: 'restore .env.example: it lists every setting the local server reads',
        },
      ];
    }
    const example = parseEnvExample(ctx.read('.env.example'));
    return ctx.files.filter(inEnvScope).flatMap((file) => findEnvViolations(file, ctx.read(file), example));
  },
};

export default gate;
