import { isAbsolute, relative, resolve } from 'node:path';
import { readCommand, type AlwaysAskReason, type Permissions } from '@devhub/contracts';

/**
 * What happens when Claude wants to run a command (spec 012): it runs, it asks, or it's refused. Pure, so
 * every row of Settings › Coding agent is tested against every kind of command as a table (spec 026). The
 * reading of the command itself is `@devhub/contracts`' `readCommand`, which Settings shares, so what the list
 * takes and what runs agree.
 */

/** What Claude asked for, from the `Bash` tool's input. */
export interface CommandRequest {
  command: string;
  /** `run_in_background`: refused, so no command outlives its approval or its session. */
  runInBackground: boolean;
  /** `dangerouslyDisableSandbox`: asks in every mode (Q3). */
  unsandboxed: boolean;
}

export interface CommandContext extends Pick<
  Permissions,
  'commands' | 'network' | 'deleteOutside' | 'unsandboxed' | 'push' | 'pullRequest'
> {
  /** Settings › Coding agent's allow list, as saved. */
  allowedCommands: readonly string[];
  /** The session's worktree, Claude's working folder, which a `cd` must stay inside. */
  worktree: string;
  /** The session's branch, the only one a push may name; null before the worktree is made. */
  branch: string | null;
}

export type CommandDecision =
  /** `outsideSandbox`: it runs outside the sandbox, this once, as a network command needs (spec 026). */
  | { behavior: 'allow'; outsideSandbox: boolean }
  /** `alwaysAsk` says why it asks with Allow once and Deny only; `alwaysAllow` is the entry Always allow would save, when offered (Q1, Q4). */
  | { behavior: 'ask'; alwaysAsk: AlwaysAskReason | null; alwaysAllow: string | null }
  /** `message` is for Claude. */
  | { behavior: 'refuse'; reason: 'push' | 'background'; message: string };

const inSandbox: CommandDecision = { behavior: 'allow', outsideSandbox: false };
const outside: CommandDecision = { behavior: 'allow', outsideSandbox: true };
const askPlainly: CommandDecision = { behavior: 'ask', alwaysAsk: null, alwaysAllow: null };

function askBecause(reason: AlwaysAskReason): CommandDecision {
  return { behavior: 'ask', alwaysAsk: reason, alwaysAllow: null };
}

function refusePush(message: string): CommandDecision {
  return { behavior: 'refuse', reason: 'push', message };
}

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

/** `git push [-u] origin <branch>`: the session's branch to origin, nothing forced, nothing else (spec 026). */
function pushesOnlyBranch(words: readonly string[], branch: string): boolean {
  if (words[0] !== 'git' || words[1] !== 'push') return false;
  const rest = words.slice(2).filter((word) => word !== '-u' && word !== '--set-upstream');
  return rest.length === 2 && rest[0] === 'origin' && rest[1] === branch;
}

/** `gh pr create` for the session's branch: no other repository, and a `--head` only when it names the branch. */
function opensOnlyBranch(words: readonly string[], branch: string): boolean {
  for (let i = 3; i < words.length; i += 1) {
    const word = words[i] ?? '';
    if (word === '-R' || word === '--repo' || word.startsWith('--repo=')) return false;
    if ((word === '-H' || word === '--head') && words[i + 1] !== branch) return false;
    if (word.startsWith('--head=') && word !== `--head=${branch}`) return false;
  }
  return true;
}

/** A push or `gh pr create` (spec 026): its row says never, ask or allow, and only the session's branch, on its own. */
function decidePublish(
  what: 'push' | 'pull_request',
  parts: readonly string[][],
  context: CommandContext,
): CommandDecision {
  const push = what === 'push';
  const row = push ? context.push : context.pullRequest;
  if (row === 'never') {
    return refusePush(
      push
        ? 'Pushing is off in Settings › Coding agent. The user pushes with Create pull request or Push changes.'
        : 'Opening pull requests is off in Settings › Coding agent. The user opens one with Create pull request.',
    );
  }
  const branch = context.branch;
  const only = parts.length === 1 ? parts[0] : undefined;
  if (branch === null || only === undefined || !(push ? pushesOnlyBranch : opensOnlyBranch)(only, branch)) {
    return refusePush(
      push
        ? `Push only this session's branch, on its own and without force: git push origin ${branch ?? '<branch>'}.`
        : "Open the pull request for this session's branch only: gh pr create on its own, without --repo or another --head.",
    );
  }
  return row === 'ask' ? askBecause(what) : outside;
}

/** The commands row for a command the reader follows: ask, the allowed list, or any command (spec 012, 026). */
function decideByList(read: { parts: string[][]; entry: string | null }, context: CommandContext): CommandDecision {
  if (context.commands === 'any') return inSandbox;
  if (context.commands === 'ask') return askPlainly;
  if (read.parts.every((part) => partAllowed(part, context))) return inSandbox;
  return { behavior: 'ask', alwaysAsk: null, alwaysAllow: read.entry };
}

const background: CommandDecision = {
  behavior: 'refuse',
  reason: 'background',
  message: 'Commands run in the foreground here. Run it again without run_in_background.',
};

export function decideCommand(request: CommandRequest, context: CommandContext): CommandDecision {
  const read = readCommand(request.command);
  if (read.kind === 'push') {
    const decided = decidePublish(read.what, read.parts, context);
    return decided.behavior !== 'refuse' && request.runInBackground ? background : decided;
  }
  if (request.runInBackground) return background;
  // Each row decides its own kind of command; one it allows runs outside the sandbox, which it needs.
  if (read.kind === 'always_asks') {
    const row = read.reason === 'network' ? context.network : context.deleteOutside;
    return row === 'allow' ? outside : askBecause(read.reason);
  }
  // A line Orynx can't read never leaves the sandbox without your click, whatever the rows say.
  if (read.kind === 'opaque') {
    if (request.unsandboxed) return askBecause('unsandboxed');
    return context.commands === 'any' ? inSandbox : askPlainly;
  }
  if (request.unsandboxed && context.unsandboxed === 'ask') return askBecause('unsandboxed');
  const decided = decideByList(read, context);
  return decided.behavior === 'allow' && request.unsandboxed ? outside : decided;
}
