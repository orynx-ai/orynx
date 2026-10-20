import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Node's scrypt defaults (N 16384, r 8, p 1): tens of milliseconds and 16 MB a try, so guesses are slow. */
const hashLength = 64;
const saltLength = 16;

export const passwordFilePath = (home: string): string => join(home, 'password');

/** The password other devices on the wifi ask for (spec 043). Only its salt and scrypt hash are kept. */
export interface PasswordStore {
  isSet(): Promise<boolean>;
  /** Saves a new password with a new salt, so every cookie made before stops working. */
  set(password: string): Promise<void>;
  verify(password: string): Promise<boolean>;
  /** A secret that changes with each saved password, for the front door's cookie; null while none is saved. */
  cookie(): Promise<string | null>;
}

interface Saved {
  line: string;
  salt: Buffer;
  hash: Buffer;
}

function hashOf(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, hashLength, (error, hash) => {
      if (error === null) resolve(hash);
      else reject(error);
    });
  });
}

/** `scrypt:<salt>:<hash>`, both base64. */
function parse(line: string): Saved | null {
  const [kind, salt, hash, ...rest] = line.trim().split(':');
  if (kind !== 'scrypt' || salt === undefined || hash === undefined || rest.length > 0) return null;
  const saved = { line: line.trim(), salt: Buffer.from(salt, 'base64'), hash: Buffer.from(hash, 'base64') };
  return saved.salt.length === saltLength && saved.hash.length === hashLength ? saved : null;
}

async function readSaved(path: string): Promise<Saved | null> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
  const saved = parse(text);
  if (saved === null) {
    throw new Error(`${path} holds no password Orynx can read. Delete it and restart Orynx to set up again.`);
  }
  return saved;
}

/**
 * Kept in `path` (0600) and read once, at the first question: a password file deleted while Orynx runs counts
 * after a restart. Without a path it lives in memory, for tests.
 */
export function createPasswordStore(path?: string): PasswordStore {
  let saved: Promise<Saved | null> | undefined = path === undefined ? Promise.resolve(null) : undefined;
  const current = (): Promise<Saved | null> => {
    saved ??= readSaved(path ?? '');
    return saved;
  };

  return {
    isSet: async () => (await current()) !== null,
    set: async (password) => {
      const salt = randomBytes(saltLength);
      const line = `scrypt:${salt.toString('base64')}:${(await hashOf(password, salt)).toString('base64')}`;
      if (path !== undefined) {
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        await writeFile(path, `${line}\n`, { mode: 0o600 });
        // A file left from before keeps its own mode through writeFile.
        await chmod(path, 0o600);
      }
      saved = Promise.resolve(parse(line));
    },
    verify: async (password) => {
      const found = await current();
      if (found === null) return false;
      return timingSafeEqual(await hashOf(password, found.salt), found.hash);
    },
    cookie: async () => {
      const found = await current();
      return found === null ? null : createHmac('sha256', found.line).update('orynx_access').digest('base64url');
    },
  };
}
