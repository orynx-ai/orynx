import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPasswordStore, passwordFilePath } from './password-store.ts';

let home: string;

beforeEach(async () => {
  home = join(await mkdtemp(join(tmpdir(), 'devhub-password-')), 'home');
});

afterEach(async () => {
  await rm(join(home, '..'), { recursive: true, force: true });
});

describe('password store (spec 043)', () => {
  it('AC-5: keeps a salt and a scrypt hash, never the password, in a file only its owner reads', async () => {
    const store = createPasswordStore(passwordFilePath(home));
    expect(await store.isSet()).toBe(false);

    await store.set('correct horse battery');

    const saved = await readFile(passwordFilePath(home), 'utf8');
    expect(saved).toMatch(/^scrypt:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+\n$/);
    expect(saved).not.toContain('correct horse');
    expect((await stat(passwordFilePath(home))).mode & 0o777).toBe(0o600);
    expect(await store.isSet()).toBe(true);
  });

  it('AC-9, AC-10: knows the right password, after a restart too, and no other', async () => {
    await createPasswordStore(passwordFilePath(home)).set('correct horse battery');
    const restarted = createPasswordStore(passwordFilePath(home));

    expect(await restarted.verify('correct horse battery')).toBe(true);
    expect(await restarted.verify('correct horse batter')).toBe(false);
    expect(await restarted.verify('')).toBe(false);
  });

  it('AC-12: gives a cookie secret only once a password is set, and a new one with a new password', async () => {
    const store = createPasswordStore(passwordFilePath(home));
    expect(await store.cookie()).toBeNull();

    await store.set('correct horse battery');
    const first = await store.cookie();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await createPasswordStore(passwordFilePath(home)).cookie()).toBe(first);

    // The same password again still gets a new salt, so every old cookie stops working.
    await store.set('correct horse battery');
    expect(await store.cookie()).not.toBe(first);
  });

  it('AC-12: a deleted password file, read at the next start, means Orynx is not set up', async () => {
    await createPasswordStore(passwordFilePath(home)).set('correct horse battery');
    await rm(passwordFilePath(home));

    const restarted = createPasswordStore(passwordFilePath(home));
    expect(await restarted.isSet()).toBe(false);
    expect(await restarted.cookie()).toBeNull();
    expect(await restarted.verify('correct horse battery')).toBe(false);
  });

  it('says how to recover when the file holds something else', async () => {
    await createPasswordStore(passwordFilePath(home)).set('correct horse battery');
    await writeFile(passwordFilePath(home), 'hunter2\n');

    await expect(createPasswordStore(passwordFilePath(home)).isSet()).rejects.toThrow(
      `${passwordFilePath(home)} holds no password Orynx can read. Delete it and restart Orynx to set up again.`,
    );
  });

  it('keeps the password in memory when it has no file, for tests', async () => {
    const store = createPasswordStore();
    await store.set('correct horse battery');
    expect(await store.verify('correct horse battery')).toBe(true);
  });
});
