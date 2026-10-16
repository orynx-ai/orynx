import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface HookEdit {
  old_string?: string;
  new_string?: string;
}

export interface HookToolInput {
  file_path?: string;
  content?: string;
  old_string?: string;
  new_string?: string;
  edits?: HookEdit[];
  command?: string;
}

export interface HookInput {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: HookToolInput;
  cwd?: string;
  stop_hook_active?: boolean;
}

export interface Decision {
  block: boolean;
  reason: string;
}

export const ALLOW: Decision = { block: false, reason: '' };

export function block(reason: string): Decision {
  return { block: true, reason };
}

/** Parses hook JSON defensively; anything unexpected becomes an empty input (which allows). */
export function parseHookInput(raw: string): HookInput {
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null ? value : {};
  } catch {
    return {};
  }
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function isMain(moduleUrl: string): boolean {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(moduleUrl);
}

/**
 * Runs a hook. Exit 2 with the reason on stderr blocks the action (Claude Code shows the
 * reason to the agent). Any crash inside the hook exits 0: a broken hook must never lock
 * the agent out; the gates are the safety net.
 */
export async function runHook(decide: (input: HookInput) => Decision | Promise<Decision>): Promise<void> {
  try {
    const decision = await decide(parseHookInput(await readStdin()));
    if (decision.block) {
      process.stderr.write(`${decision.reason}\n`);
      process.exit(2);
    }
    process.exit(0);
  } catch {
    process.exit(0);
  }
}
