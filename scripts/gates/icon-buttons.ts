import type { Finding, Gate } from '../lib/gate.ts';
import { findIconButtonViolations, ICON_BUTTONS_GATE_ID, inIconButtonScope } from '../lib/policies/icon-buttons.ts';

/** Spec 020 (the user's ask, 18 Oct 2026): no icon-only button without a tooltip. */
const gate: Gate = {
  id: ICON_BUTTONS_GATE_ID,
  description: 'Every icon-only button is an IconButton, so it shows its words in a tooltip',
  mode: 'fail',
  when: 'always',
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.files.filter(inIconButtonScope))
      findings.push(...findIconButtonViolations(file, ctx.read(file)));
    return findings;
  },
};

export default gate;
