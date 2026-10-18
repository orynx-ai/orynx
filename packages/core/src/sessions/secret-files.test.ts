import { describe, expect, it } from 'vitest';
import { firstSecretFile, looksLikeSecret } from './secret-files.ts';

describe('looksLikeSecret (spec 014, Q6)', () => {
  it.each([
    '.env',
    '.env.local',
    '.env.production',
    'apps/web/.env.development.local',
    'certs/server.pem',
    'config/private.key',
    'deploy/KEY.PEM',
    'id_rsa',
    '.ssh/id_rsa.pub',
    'keys/id_ed25519',
    'keys/id_ed25519_work',
  ])('AC-8: %s looks like a secret', (path) => {
    expect(looksLikeSecret(path)).toBe(true);
  });

  it.each([
    '.env.example',
    'apps/web/.env.example',
    'src/keys.ts',
    'docs/env.md',
    'src/env.ts',
    'keyboard.key.ts',
    'README.md',
  ])("AC-8: %s doesn't", (path) => {
    expect(looksLikeSecret(path)).toBe(false);
  });
});

describe('firstSecretFile', () => {
  it('AC-8: names the first file that looks like a secret, or none', () => {
    expect(firstSecretFile(['src/ContentList.tsx', '.env.local', 'certs/server.pem'])).toBe('.env.local');
    expect(firstSecretFile(['src/ContentList.tsx', '.env.example'])).toBeNull();
  });
});
