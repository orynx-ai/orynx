import { access, constants, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Files from this computer, by path (spec 022, B). The composer holds a path from `/` or `~/`; Orynx reads no file,
 * it only checks that there's one Claude can read there.
 */

/** The absolute path a composer path names, `~` being the person's home folder. */
export function absoluteFile(path: string, home: string): string {
  return path === '~' ? home : path.startsWith('~/') ? join(home, path.slice(2)) : resolve(path);
}

/** The absolute path when it leads to a file this process can read, following links; else null. */
export async function readableFile(path: string, home: string): Promise<string | null> {
  const absolute = absoluteFile(path, home);
  try {
    if (!(await stat(absolute)).isFile()) return null;
    await access(absolute, constants.R_OK);
    return absolute;
  } catch {
    return null;
  }
}
