import { applyIgnores, makeLineLookup, type Finding } from '../gate.ts';
import { scanSource } from '../source-scan.ts';

export const TEST_POLICY_GATE_ID = 'test-policy';
const GUIDE = '.claude/skills/honest-tests/SKILL.md';

export function isTestLike(path: string): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(path) || /\.stories\.[cm]?[jt]sx?$/.test(path) || path.startsWith('e2e/');
}

/** Product code and its tests. scripts/ is out of scope: gate tests hold these patterns as fixtures. */
export function inTestPolicyScope(path: string): boolean {
  return /^(packages|apps|e2e)\//.test(path) && /\.[cm]?[jt]sx?$/.test(path);
}

interface Rule {
  rule: string;
  pattern: RegExp;
  testsOnly: boolean;
  message(m: RegExpExecArray): string | null;
  fix: string;
}

const RULES: readonly Rule[] = [
  {
    rule: 'test-id',
    pattern: /data-testid/g,
    testsOnly: false,
    message: () => 'data-testid is banned: tests must find things the way a person does',
    fix: `remove it and query by role, label or visible text (getByRole, getByLabelText, getByText) — ${GUIDE}`,
  },
  {
    rule: 'test-id-query',
    pattern: /\b(?:get|query|find)(?:All)?ByTestId\b/g,
    testsOnly: true,
    message: (m) => `${m[0]} finds elements by a hidden test id`,
    fix: `use getByRole / getByLabelText / getByText — ${GUIDE}`,
  },
  {
    rule: 'mock-own-code',
    pattern: /\b(?:vi|jest)\.(?:do)?[mM]ock\(\s*(?:(['"`])([^'"`]+)\1|import\(\s*(['"`])([^'"`]+)\3\s*\))/g,
    testsOnly: true,
    message: (m) => {
      const specifier = m[2] ?? m[4] ?? '';
      if (!specifier.startsWith('.') && !specifier.startsWith('@devhub/')) return null;
      return `mocks our own module "${specifier}", so the test checks a stand-in instead of the real code`;
    },
    fix: `use the real module; fake only what we don't own — the network (MSW), the clock (vi.useFakeTimers) or outside services — ${GUIDE}`,
  },
  {
    rule: 'focused-test',
    pattern: /\b(?:it|test|describe)(?:\.\w+)*\.only\s*\(/g,
    testsOnly: true,
    message: (m) => `"${m[0].replace(/\s*\($/, '')}" would skip every other test`,
    fix: 'remove .only',
  },
  {
    rule: 'snapshot',
    pattern: /\.(?:toMatchSnapshot|toMatchInlineSnapshot|toMatchFileSnapshot)\s*\(/g,
    testsOnly: true,
    message: () => 'snapshot assertions pass for whatever was rendered the first time',
    fix: `assert what a person sees: toHaveTextContent, toBeVisible, toHaveAccessibleName — ${GUIDE}`,
  },
];

export function findTestPolicyViolations(path: string, content: string): Finding[] {
  if (!inTestPolicyScope(path)) return [];
  const testLike = isTestLike(path);
  const { code } = scanSource(content, 'ts');
  const lineOf = makeLineLookup(content);
  const findings: Finding[] = [];
  for (const rule of RULES) {
    if (rule.testsOnly && !testLike) continue;
    for (const m of code.matchAll(rule.pattern)) {
      const message = rule.message(m);
      if (message === null) continue;
      findings.push({ file: path, line: lineOf(m.index), rule: rule.rule, message, fix: rule.fix });
    }
  }
  findings.sort((a, b) => a.line - b.line);
  return applyIgnores(TEST_POLICY_GATE_ID, path, content, findings);
}
