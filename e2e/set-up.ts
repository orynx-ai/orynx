import { randomBytes, scryptSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Makes `home` an Orynx that is set up (spec 043): the password file Set up Orynx saves, in the password store's
 * format (packages/core/src/setup/password-store.ts). Every e2e hub starts this way, so no suite meets the setup page.
 */
export function setUpHome(home: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync('orynx e2e password', salt, 64);
  writeFileSync(join(home, 'password'), `scrypt:${salt.toString('base64')}:${hash.toString('base64')}\n`, {
    mode: 0o600,
  });
  return home;
}
