import assert from 'node:assert/strict';
import { it } from 'node:test';
import { allTasksDone, checkSpecs, openQuestionRows } from './specs.ts';

const SPEC = (answer: string): string =>
  [
    '# X',
    '## Assumptions',
    '## Acceptance criteria',
    '## Out of scope',
    '## Open questions',
    '',
    '| # | Who decides | Question | Answer |',
    '| --- | --- | --- | --- |',
    `| Q1 | Product | Does it apply? | ${answer} |`,
    '',
  ].join('\n');

const TEMPLATE = {
  'specs/_template/spec.md': SPEC(''),
  'specs/_template/plan.md': '',
  'specs/_template/tasks.md': '- [ ] Task',
};

function run(files: Record<string, string>): string[] {
  const all: Record<string, string> = { ...TEMPLATE, ...files };
  return checkSpecs(Object.keys(all), (p) => all[p] ?? '').map((f) => `${f.file}:${f.rule}`);
}

it('parses the open questions table', () => {
  assert.deepEqual(
    openQuestionRows(SPEC('No (12 Oct)')).map((r) => r.cells),
    [['Q1', 'Product', 'Does it apply?', 'No (12 Oct)']],
  );
  assert.equal(allTasksDone('- [x] a\n- [x] b'), true);
  assert.equal(allTasksDone('- [x] a\n- [ ] b'), false);
  assert.equal(allTasksDone('nothing'), false);
});

it('accepts a complete spec, and an unanswered question while work is in progress', () => {
  assert.deepEqual(
    run({
      'specs/001-shell/spec.md': SPEC('Yes'),
      'specs/001-shell/plan.md': '',
      'specs/001-shell/tasks.md': '- [x] a',
    }),
    [],
  );
  assert.deepEqual(
    run({ 'specs/002-x/spec.md': SPEC(''), 'specs/002-x/plan.md': '', 'specs/002-x/tasks.md': '- [ ] a' }),
    [],
  );
});

it('flags a done spec with an unanswered question', () => {
  assert.deepEqual(
    run({ 'specs/003-x/spec.md': SPEC(''), 'specs/003-x/plan.md': '', 'specs/003-x/tasks.md': '- [x] a' }),
    ['specs/003-x/spec.md:unanswered-question'],
  );
});

it('flags bad names, missing files, missing sections and a missing template', () => {
  assert.deepEqual(run({ 'specs/Upload/spec.md': '# nothing' }), [
    'specs/Upload:bad-name',
    'specs/Upload/plan.md:missing-file',
    'specs/Upload/tasks.md:missing-file',
    'specs/Upload/spec.md:missing-section',
    'specs/Upload/spec.md:missing-section',
    'specs/Upload/spec.md:missing-section',
    'specs/Upload/spec.md:missing-section',
  ]);
  assert.equal(checkSpecs([], () => '').length, 3);
});
