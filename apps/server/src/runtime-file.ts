import { randomBytes } from 'node:crypto';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface RuntimeInfo {
  port: number;
  token: string;
  pid: number;
}

export function runtimeFilePath(home: string): string {
  return join(home, 'runtime.json');
}

/** A fresh token on every start, so an old tab or a copied token stops working after a restart. */
export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Writes `{ port, token, pid }` for the Vite dev plugin (and future CLI tools) to read.
 * The folder is 0700 and the file 0600: only this user can read the token.
 */
export async function writeRuntimeFile(home: string, info: RuntimeInfo): Promise<string> {
  await mkdir(home, { recursive: true, mode: 0o700 });
  const path = runtimeFilePath(home);
  await writeFile(path, `${JSON.stringify(info, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}

export async function removeRuntimeFile(home: string): Promise<void> {
  await rm(runtimeFilePath(home), { force: true });
}
