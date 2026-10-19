import { createWriteStream, type WriteStream } from 'node:fs';
import { chmod, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';

/**
 * `<DEVHUB_HOME>/logs/orynx.log` for this launch, with the last launch's kept as `orynx.old.log` (spec 027,
 * AC-21). The hub's output goes here, since an app opened from Finder has no terminal. Folder 0700, files 0600.
 */
export async function openLogFile(home: string): Promise<WriteStream> {
  const folder = join(home, 'logs');
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await chmod(folder, 0o700);
  const path = join(folder, 'orynx.log');
  try {
    await rename(path, join(folder, 'orynx.old.log'));
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const stream = createWriteStream(path, { flags: 'w', mode: 0o600 });
  await once(stream, 'open');
  return stream;
}
