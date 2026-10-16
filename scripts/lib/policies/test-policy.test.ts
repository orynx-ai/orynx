import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findTestPolicyViolations, inTestPolicyScope, isTestLike } from './test-policy.ts';

const TEST = 'packages/app/src/features/home/home-screen.test.tsx';

function rules(path: string, content: string): string[] {
  return findTestPolicyViolations(path, content).map((f) => f.rule);
}

describe('scope', () => {
  it('knows test-like files', () => {
    assert.equal(isTestLike(TEST), true);
    assert.equal(isTestLike('packages/ui/src/components/button.stories.tsx'), true);
    assert.equal(isTestLike('e2e/smoke.spec.ts'), true);
    assert.equal(isTestLike('packages/ui/src/components/button.tsx'), false);
  });

  it('covers packages, apps and e2e but not scripts', () => {
    assert.equal(inTestPolicyScope(TEST), true);
    assert.equal(inTestPolicyScope('e2e/smoke.spec.ts'), true);
    assert.equal(inTestPolicyScope('scripts/gates/test-policy.test.ts'), false);
  });
});

describe('findTestPolicyViolations', () => {
  it('bans test ids in tests and in source', () => {
    assert.deepEqual(rules(TEST, `screen.getByTestId("row"); screen.queryAllByTestId("x");`), [
      'test-id-query',
      'test-id-query',
    ]);
    assert.deepEqual(rules('packages/ui/src/components/button.tsx', `<button data-testid="go" />`), ['test-id']);
  });

  it('bans mocking our own modules', () => {
    assert.deepEqual(
      rules(TEST, `vi.mock("./upload-button");\nvi.mock('@devhub/ui');\nvi.doMock(import("../queries"));`),
      ['mock-own-code', 'mock-own-code', 'mock-own-code'],
    );
  });

  it("allows faking what we don't own, and vi.mocked()", () => {
    assert.deepEqual(rules(TEST, `vi.mock("node:fs");\nvi.mock("@octokit/rest");\nvi.mocked(fn);`), []);
  });

  it('bans focused tests and snapshots', () => {
    assert.deepEqual(
      rules(TEST, `it.only("x", () => {});\ntest.describe.only("y", () => {});\nexpect(a).toMatchSnapshot();`),
      ['focused-test', 'focused-test', 'snapshot'],
    );
  });

  it('ignores patterns inside comments', () => {
    assert.deepEqual(rules(TEST, `// never use getByTestId or data-testid\n/* vi.mock("./x") */`), []);
  });

  it('reports the right line', () => {
    const [finding] = findTestPolicyViolations(TEST, `import x from "y";\n\nexpect(a).toMatchInlineSnapshot();`);
    assert.equal(finding?.line, 3);
  });
});
