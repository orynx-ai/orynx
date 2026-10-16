import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkSecretFileName, findSecretsInContent, shouldScanContent } from './secrets.ts';

// Fake tokens are built at runtime so this file never contains a literal match.
const fake = {
  github: 'gh' + 'p_' + 'a1B2'.repeat(10),
  slack: 'xo' + 'xp-' + '1234567890-abcdef',
  atlassian: 'ATA' + 'TT' + 'x'.repeat(24),
  anthropic: 'sk-' + 'ant-' + 'api03-' + 'y'.repeat(24),
  aws: 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP',
  key: '-----BEGIN ' + 'RSA PRIVATE KEY-----',
};

describe('checkSecretFileName', () => {
  it('flags secrets files', () => {
    for (const path of ['.env', 'apps/server/.env.local', 'certs/server.pem', 'id_rsa', 'keys/a.p12']) {
      assert.equal(checkSecretFileName(path)?.rule, 'secret-file', path);
    }
  });

  it('allows .env.example and ordinary files', () => {
    assert.equal(checkSecretFileName('.env.example'), null);
    assert.equal(checkSecretFileName('packages/core/src/keychain.ts'), null);
  });
});

describe('findSecretsInContent', () => {
  it('finds each kind of token and masks it in the message', () => {
    const content = Object.values(fake).join('\n');
    const found = findSecretsInContent('x.ts', content);
    assert.equal(found.length, 6);
    assert.deepEqual(
      found.map((f) => f.line).sort((a, b) => a - b),
      [1, 2, 3, 4, 5, 6],
    );
    for (const f of found) assert.doesNotMatch(f.message, /a1B2a1B2a1B2/);
  });

  it('ignores short look-alikes', () => {
    assert.deepEqual(findSecretsInContent('x.ts', `const prefix = "ghp_"; const slack = "xoxp-";`), []);
  });

  it('skips binaries and the lockfile', () => {
    assert.equal(shouldScanContent('docs/design/screens/home-dark.png'), false);
    assert.equal(shouldScanContent('pnpm-lock.yaml'), false);
    assert.equal(shouldScanContent('packages/core/src/x.ts'), true);
  });
});
