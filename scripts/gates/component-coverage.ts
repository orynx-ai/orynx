import type { Finding, Gate } from '../lib/gate.ts';

const UI_COMPONENT = /^packages\/ui\/src\/components\/(?:[^/]+\/)*[^/]+\.tsx$/;
const SCREEN = /^packages\/app\/src\/features\/(?:[^/]+\/)*[^/]+-screen\.tsx$/;
const APP_COMPONENT = /^packages\/app\/src\/(?:[^/]+\/)*components\/(?:[^/]+\/)*[^/]+\.tsx$/;
const SHELL = /^packages\/app\/src\/shell\/[^/]+\.tsx$/;
const COMPANION = /\.(test|stories)\.tsx$/;

/** Every component needs its companions: ui components a story and a test, app screens and components a test. */
export function findMissingCompanions(files: readonly string[]): Finding[] {
  const present = new Set(files);
  const findings: Finding[] = [];
  for (const file of files) {
    if (COMPANION.test(file) || file.endsWith('/index.tsx')) continue;
    const base = file.slice(0, -'.tsx'.length);
    const needs: { suffix: string; why: string }[] = [];
    if (UI_COMPONENT.test(file)) {
      needs.push({ suffix: '.stories.tsx', why: 'a story for each state and variant' });
      needs.push({ suffix: '.test.tsx', why: 'a behaviour and accessibility test' });
    } else if (SCREEN.test(file) || APP_COMPONENT.test(file) || SHELL.test(file)) {
      needs.push({ suffix: '.test.tsx', why: 'a test that renders the real component and asserts by role and text' });
    }
    for (const need of needs) {
      const companion = `${base}${need.suffix}`;
      if (present.has(companion)) continue;
      findings.push({
        file,
        line: 0,
        rule: need.suffix === '.stories.tsx' ? 'missing-story' : 'missing-test',
        message: `has no ${companion.split('/').pop() ?? companion}`,
        fix: `add ${companion} with ${need.why} (.claude/skills/${need.suffix === '.stories.tsx' ? 'add-ui-component' : 'honest-tests'}/SKILL.md)`,
      });
    }
  }
  return findings;
}

const gate: Gate = {
  id: 'component-coverage',
  description: 'Every @devhub/ui component has a story and a test; every app screen and component has a test',
  mode: 'fail',
  when: 'always',
  run(ctx) {
    return findMissingCompanions(ctx.files);
  },
};

export default gate;
