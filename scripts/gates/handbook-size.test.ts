import assert from 'node:assert/strict';
import { it } from 'node:test';
import { checkHandbook, HANDBOOK_LIMIT_BYTES } from './handbook-size.ts';

const exists = (path: string): boolean => ['docs/architecture.md', '.claude/skills/forms/SKILL.md'].includes(path);

it('passes a small handbook with real gates and links', () => {
  const md =
    'Run `pnpm gate boundaries`.\nSee `docs/architecture.md` and `.claude/skills/forms/SKILL.md`.\nGlobs like `apps/*/src/config.ts` and `docs/design/screens/<file>` are skipped. `pnpm gate <name>` too.';
  assert.deepEqual(checkHandbook(md, ['boundaries'], exists), []);
});

it('flags size, unknown gates and broken links', () => {
  const md = `${'x'.repeat(HANDBOOK_LIMIT_BYTES)}\nRun \`pnpm gate nope\`.\nSee \`docs/missing.md\`.`;
  assert.deepEqual(
    checkHandbook(md, ['boundaries'], exists).map((f) => `${f.rule}@${f.line}`),
    ['too-big@0', 'unknown-gate@2', 'broken-link@3'],
  );
});
