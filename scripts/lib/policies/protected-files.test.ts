import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isProtected } from './protected-files.ts';

describe('isProtected', () => {
  it('protects generated agent files and points at pnpm agent-rules', () => {
    for (const path of ['AGENTS.md', '.github/copilot-instructions.md', '.cursor/rules/00-core.mdc', './AGENTS.md']) {
      const result = isProtected(path);
      assert.equal(result.protected, true, path);
      assert.match(result.reason, /pnpm agent-rules/);
    }
  });

  it('protects the lockfile', () => {
    assert.match(isProtected('pnpm-lock.yaml').reason, /pnpm add/);
  });

  it('protects inputs that come from people', () => {
    for (const path of ['packages/ui/src/styles/tokens.css', 'docs/design/screens/home.html', 'docs/product/spec.md']) {
      assert.match(isProtected(path).reason, /stop and ask/, path);
    }
  });

  it('protects .env files but not .env.example', () => {
    assert.equal(isProtected('.env').protected, true);
    assert.equal(isProtected('.env.local').protected, true);
    assert.equal(isProtected('apps/server/.env').protected, true);
    assert.equal(isProtected('.env.example').protected, false);
  });

  it('leaves ordinary files open', () => {
    assert.equal(isProtected('CLAUDE.md').protected, false);
    assert.equal(isProtected('docs/design-map.md').protected, false);
    assert.equal(isProtected('packages/ui/src/styles/theme.css').protected, false);
  });
});
