import type { Gate } from '../lib/gate.ts';
import { findStyleViolations, inStyleScope } from '../lib/policies/style.ts';

const gate: Gate = {
  id: 'style-policy',
  description: 'Colours, type sizes, radii and shadows come from the DevHub theme (docs/design-map.md)',
  mode: 'fail',
  when: 'always',
  run(ctx) {
    return ctx.files.filter(inStyleScope).flatMap((file) => findStyleViolations(file, ctx.read(file)));
  },
};

export default gate;
