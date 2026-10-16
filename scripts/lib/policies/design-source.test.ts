import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkDesignNote, isScreenFile } from './design-source.ts';

const SCREEN = 'packages/app/src/features/home/home-screen.tsx';

describe('isScreenFile', () => {
  it('matches *-screen.tsx under features, at any depth', () => {
    assert.equal(isScreenFile(SCREEN), true);
    assert.equal(isScreenFile('packages/app/src/features/settings/tabs/connections-screen.tsx'), true);
    assert.equal(isScreenFile('packages/app/src/features/home/home-screen.test.tsx'), false);
    assert.equal(isScreenFile('packages/app/src/shell/sidebar.tsx'), false);
  });
});

describe('checkDesignNote', () => {
  it('accepts a note that points at a screen design', () => {
    const result = checkDesignNote(
      SCREEN,
      '// Design: docs/design/screens/home.html — greeting and composer\nexport {};',
    );
    assert.equal(result.ok, true);
    assert.equal(result.reference, 'docs/design/screens/home.html');
  });

  it("accepts a reasoned 'none' note and leading blank lines", () => {
    const result = checkDesignNote(SCREEN, '\n\n// Design: none — placeholder until spec 004\n');
    assert.equal(result.ok, true);
    assert.equal(result.reference, null);
  });

  it('rejects a missing note and says what to write', () => {
    const result = checkDesignNote(SCREEN, 'import { Button } from "@devhub/ui";');
    assert.equal(result.ok, false);
    assert.ok(result.finding);
    assert.equal(result.finding.rule, 'missing-design-note');
    assert.equal(result.finding.line, 1);
    assert.match(result.finding.fix, /Design: docs\/design\/screens/);
  });

  it('rejects a note with a hyphen instead of an em dash', () => {
    const result = checkDesignNote(SCREEN, '// Design: docs/design/screens/home.html - composer');
    assert.equal(result.ok, false);
    assert.match(result.finding?.message ?? '', /malformed/);
    assert.match(result.finding?.fix ?? '', /em dash/);
  });

  it("rejects 'none' without a reason", () => {
    assert.equal(checkDesignNote(SCREEN, '// Design: none').ok, false);
  });
});
