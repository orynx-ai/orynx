import { isAbsolute, relative, resolve } from 'node:path';
import { readCommand, type AlwaysAskReason, type PermissionMode } from '@devhub/contracts';

/**
 * What happens when Claude wants to run a command (spec 012): it runs, it asks, or it's refused. Pure, so
 * every mode is tested against every kind of command as a table. The reading of the command itself is
 * `@devhub/contracts`' `readCommand`, which Settings shares, so what the list takes and what runs agree.
 */

/** What Claude asked for, from the `Bash` tool's input. */
export interface CommandRequest {
  command: string;
  /** `run_in_background`: refused, so no command outlives its approval or its session. */
  runInBackground: boolean;
  /** `dangerouslyDisableSandbox`: asks in every mode (Q3). */
  unsandboxed: boolean;
}

export interface CommandContext {
  mode: PermissionMode;
  /** Settings › Coding agent's allow list, as saved. */
  allowedCommands: readonly string[];
  /** The session's worktree, Claude's working folder, which a `cd` must stay inside. */
  worktree: string;
}

export type CommandDecision =
  | { behavior: 'allow' }
  /** `alwaysAsk` says why it asks in every mode; `alwaysAllow` is the entry Always allow would save, when offered (Q1, Q4). */
  | { behavior: 'ask'; alwaysAsk: AlwaysAskReason | null; alwaysAllow: string | null }
  /** `message` is for Claude. */
  | { behavior: 'refuse'; reason: 'push' | 'background'; message: string };

/** Programs that only shape what another command printed. */
const filters = new Set(['head', 'tail', 'grep', 'wc', 'sort', 'uniq']);

/** A path that can leave the worktree, as the reader counts it for deletes. */
function leaves(path: string): boolean {
  if (path.startsWith('/') || path === '~' || path.startsWith('~/') || path.includes('$')) return true;
  return path.split('/').includes('..');
}

function programOf(words: readonly string[]): string {
  const first = words[0] ?? '';
  return first.slice(first.lastIndexOf('/') + 1);
}

/** The words of an entry on the list, or null for one the reader can't follow (it was saved by something else). */
function entryWords(entry: string): readonly string[] | null {
  const read = readCommand(entry);
  return read.kind === 'command' && read.parts.length === 1 ? (read.parts[0] ?? null) : null;
}

/** A command starts with the entry's words (Q4), the program by its own name. */
function startsWith(words: readonly string[], entry: readonly string[]): boolean {
  if (entry.length === 0 || words.length < entry.length) return false;
  if (programOf(words) !== programOf(entry)) return false;
  return entry.slice(1).every((word, i) => words[i + 1] === word);
}

/** `cd` to a folder inside the worktree: a relative path that never goes up, or an absolute one under it. */
function staysInside(words: readonly string[], worktree: string): boolean {
  const [target, extra] = words.slice(1);
  if (target === undefined || extra !== undefined) return false;
  if (isAbsolute(target)) {
    const inside = relative(resolve(worktree), resolve(target));
    return inside === '' || (!inside.startsWith('..') && !isAbsolute(inside));
  }
  return !leaves(target);
}

function partAllowed(words: readonly string[], context: CommandContext): boolean {
  const program = programOf(words);
  if (program === 'cd') return staysInside(words, context.worktree);
  if (filters.has(program)) return !words.slice(1).some(leaves);
  return context.allowedCommands.some((entry) => {
    const read = entryWords(entry);
    return read !== null && startsWith(words, read);
  });
}

export function decideCommand(request: CommandRequest, context: CommandContext): CommandDecision {
  const read = readCommand(request.command);
  if (read.kind === 'push') {
    return {
      behavior: 'refuse',
      reason: 'push',
      message: 'Pushing and pull requests happen only when the user presses Create pull request.',
    };
  }
  if (request.runInBackground) {
    return {
      behavior: 'refuse',
      reason: 'background',
      message: 'Commands run in the foreground here. Run it again without run_in_background.',
    };
  }
  if (read.kind === 'always_asks') return { behavior: 'ask', alwaysAsk: read.reason, alwaysAllow: null };
  if (request.unsandboxed) return { behavior: 'ask', alwaysAsk: 'unsandboxed', alwaysAllow: null };
  if (read.kind === 'opaque') return { behavior: 'ask', alwaysAsk: null, alwaysAllow: null };
  if (context.mode !== 'edit_and_run_allowed') return { behavior: 'ask', alwaysAsk: null, alwaysAllow: null };
  if (read.parts.every((part) => partAllowed(part, context))) return { behavior: 'allow' };
  return { behavior: 'ask', alwaysAsk: null, alwaysAllow: read.entry };
}
