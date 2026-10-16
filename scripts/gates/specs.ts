import type { Finding, Gate } from '../lib/gate.ts';

const REQUIRED_FILES = ['spec.md', 'plan.md', 'tasks.md'] as const;
const REQUIRED_HEADINGS = ['## Assumptions', '## Acceptance criteria', '## Out of scope', '## Open questions'] as const;
const TEMPLATE = 'specs/_template';

/** Rows of the first table under "## Open questions", with their 1-based line numbers. */
export function openQuestionRows(spec: string): { cells: string[]; line: number }[] {
  const lines = spec.split('\n');
  const start = lines.findIndex((line) => line.trim() === '## Open questions');
  if (start === -1) return [];
  const rows: { cells: string[]; line: number }[] = [];
  let seenTable = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (line.startsWith('## ')) break;
    if (!line.startsWith('|')) {
      if (seenTable) break;
      continue;
    }
    seenTable = true;
    const cells = line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());
    rows.push({ cells, line: i + 1 });
  }
  // Drop the header row and the |---| separator.
  return rows.filter((row, index) => index !== 0 && !row.cells.every((cell) => /^:?-+:?$/.test(cell)));
}

export function allTasksDone(tasks: string): boolean {
  return /^\s*- \[x\]/im.test(tasks) && !/^\s*- \[ \]/m.test(tasks);
}

export function checkSpecs(files: readonly string[], read: (path: string) => string): Finding[] {
  const findings: Finding[] = [];
  const present = new Set(files);
  const dirs = new Set<string>();
  for (const file of files) {
    const m = /^specs\/([^/]+)\//.exec(file);
    if (m?.[1] !== undefined) dirs.add(m[1]);
  }

  for (const name of REQUIRED_FILES) {
    if (!present.has(`${TEMPLATE}/${name}`)) {
      findings.push({
        file: `${TEMPLATE}/${name}`,
        line: 0,
        rule: 'missing-template',
        message: 'the spec template is incomplete',
        fix: `restore ${TEMPLATE}/ with spec.md, plan.md and tasks.md`,
      });
    }
  }

  for (const dir of [...dirs].sort()) {
    if (dir === '_template') continue;
    const base = `specs/${dir}`;
    if (!/^\d{3}-[a-z0-9-]+$/.test(dir)) {
      findings.push({
        file: base,
        line: 0,
        rule: 'bad-name',
        message: `"${dir}" is not <NNN>-<slug>`,
        fix: 'rename it, e.g. specs/004-home-inbox (numbers follow docs/product/roadmap.md)',
      });
    }
    const missing = REQUIRED_FILES.filter((name) => !present.has(`${base}/${name}`));
    for (const name of missing) {
      findings.push({
        file: `${base}/${name}`,
        line: 0,
        rule: 'missing-file',
        message: `${base} has no ${name}`,
        fix: `copy ${TEMPLATE}/${name} and fill it in`,
      });
    }
    if (missing.includes('spec.md')) continue;
    const spec = read(`${base}/spec.md`);
    for (const heading of REQUIRED_HEADINGS) {
      if (!spec.split('\n').some((line) => line.trim() === heading)) {
        findings.push({
          file: `${base}/spec.md`,
          line: 0,
          rule: 'missing-section',
          message: `has no "${heading}" section`,
          fix: `add it (see ${TEMPLATE}/spec.md)`,
        });
      }
    }
    if (missing.includes('tasks.md') || !allTasksDone(read(`${base}/tasks.md`))) continue;
    for (const row of openQuestionRows(spec)) {
      const answer = row.cells[row.cells.length - 1] ?? '';
      if (answer === '' || answer === '—' || answer === '-' || /^TBD$/i.test(answer)) {
        findings.push({
          file: `${base}/spec.md`,
          line: row.line,
          rule: 'unanswered-question',
          message: `every task is done but question "${row.cells[0] ?? '?'}" has no answer`,
          fix: 'a person answers it (with the date) in the Answer column; the work is not done until then',
        });
      }
    }
  }
  return findings;
}

const gate: Gate = {
  id: 'specs',
  description: "Each spec folder has spec/plan/tasks with the template's sections; done specs have no open questions",
  mode: 'fail',
  when: 'always',
  run(ctx) {
    return checkSpecs(ctx.files, (path) => ctx.read(path));
  },
};

export default gate;
