import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';

/** What apps/server writes to `<DEVHUB_HOME>/runtime.json` once it listens (apps/server/src/runtime-file.ts). */
const RuntimeSchema = z.object({ port: z.number().int().min(1).max(65_535), pid: z.number().int().min(1) });
type Runtime = z.infer<typeof RuntimeSchema>;

async function readRuntime(home: string): Promise<Runtime | null> {
  try {
    return RuntimeSchema.parse(JSON.parse(await readFile(join(home, 'runtime.json'), 'utf8')));
  } catch {
    return null;
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process is there but belongs to someone else.
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}

/** Any HTTP answer counts: `pnpm dev`'s hub serves no page and answers GET / with a 404. */
async function answers(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${String(port)}/`, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Another Orynx hub already running on this home, such as `pnpm start` (spec 027, AC-8). Two hubs on one
 * home overwrite each other's runtime.json, settings and sessions. A runtime.json whose process has ended,
 * or whose port no longer answers (its pid now belongs to another program), doesn't count.
 */
export async function otherHub(home: string): Promise<{ port: number } | null> {
  const runtime = await readRuntime(home);
  if (runtime === null || !isAlive(runtime.pid) || !(await answers(runtime.port))) return null;
  return { port: runtime.port };
}

export interface WaitForHubOptions {
  home: string;
  /** The hub process this app started: its runtime.json, not an older one, holds the port to open. */
  pid: number;
  timeoutMs?: number;
  intervalMs?: number;
  /** Aborted when the hub process exits, so the app stops waiting at once (AC-9). */
  signal?: AbortSignal;
}

/** The port this app's hub listens on, once its runtime.json names it and the port answers (AC-6). */
export async function waitForHub({
  home,
  pid,
  timeoutMs = 30_000,
  intervalMs = 200,
  signal,
}: WaitForHubOptions): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted === true) throw new Error('The Orynx hub stopped before it answered.');
    const runtime = await readRuntime(home);
    if (runtime?.pid === pid && (await answers(runtime.port))) return runtime.port;
    await sleep(intervalMs, undefined, signal === undefined ? {} : { signal }).catch(() => undefined);
  }
  throw new Error(`The Orynx hub didn't answer in ${String(timeoutMs / 1000)} seconds.`);
}
