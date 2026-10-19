import { lstat, readlink, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { PermissionMode } from '@devhub/contracts';
import type { AgentAsk, AgentReads, AgentRefusal } from '../agent-adapter.ts';
import { decideCommand } from './command-decision.ts';
import { previewEdit, type EditTool } from './edit-preview.ts';

/**
 * What Claude may do in a session: read, search, plan and edit inside the session's worktree (spec 011,
 * Q6), and run commands that the mode, the allow list and the always-ask rules let through or that you
 * approve (spec 012). Nothing else: no web, no MCP tools, no sub-agents and no questions. Claude Code's
 * `canUseTool` asks this file about every call it doesn't allow by itself, and gets one of three answers:
 * allow, ask you, or deny with the reason Claude is told.
 */

/** The tools a session gets where commands can't run (spec 012, Q2b: no sandbox on this computer). */
export const sessionToolsWithoutCommands = [
  'Read',
  'Glob',
  'Grep',
  'Edit',
  'Write',
  'NotebookEdit',
  'TodoWrite',
] as const;
/** The only tools a session gets, passed to the SDK's `tools` so Claude never sees the others. */
export const sessionTools = [...sessionToolsWithoutCommands, 'Bash'] as const;
type SessionTool = (typeof sessionTools)[number];

/** A refused call the session shows as a step (011 Q10a, 012 Q8c). */
export type ToolRefusal = AgentRefusal;

/** A call that waits for your answer (spec 012). */
export type ToolAsk = AgentAsk;

export type ToolDecision =
  | { behavior: 'allow' }
  | { behavior: 'ask'; ask: ToolAsk }
  /** `message` is for Claude. `refusal` is null for a call nobody needs to see, like a tool it doesn't have. */
  | { behavior: 'deny'; message: string; refusal: ToolRefusal | null };

export interface ToolContext {
  /** The session's worktree, Claude's working folder. */
  worktree: string;
  /** Files and folders outside the worktree the brief named, which Claude may read and never edit (spec 022). */
  reads?: AgentReads | undefined;
  mode: PermissionMode;
  /** Settings › Coding agent's allow list, as saved. */
  allowedCommands: readonly string[];
  /** What `~` means in a path Claude gives. */
  home: string;
}

/** Where each tool names the file or folder it works on. */
const targets: Record<SessionTool, { field: string; access: 'read' | 'edit'; optional: boolean } | null> = {
  Read: { field: 'file_path', access: 'read', optional: false },
  Glob: { field: 'path', access: 'read', optional: true },
  Grep: { field: 'path', access: 'read', optional: true },
  Edit: { field: 'file_path', access: 'edit', optional: false },
  Write: { field: 'file_path', access: 'edit', optional: false },
  NotebookEdit: { field: 'notebook_path', access: 'edit', optional: false },
  TodoWrite: null,
  Bash: null,
};

function isEditTool(tool: SessionTool): tool is EditTool {
  return tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit';
}

/** A command: it runs, it asks, or it's refused (spec 012), as `command-decision.ts` decides. */
function decideBash(input: Readonly<Record<string, unknown>>, context: ToolContext): ToolDecision {
  const command = input['command'];
  if (typeof command !== 'string') return unreadable('Bash');
  const description = input['description'];
  const decision = decideCommand(
    {
      command,
      runInBackground: input['run_in_background'] === true,
      unsandboxed: input['dangerouslyDisableSandbox'] === true,
    },
    { mode: context.mode, allowedCommands: context.allowedCommands, worktree: context.worktree },
  );
  if (decision.behavior === 'allow') return { behavior: 'allow' };
  if (decision.behavior === 'refuse') {
    return {
      behavior: 'deny',
      message: decision.message,
      refusal: { access: 'run', reason: decision.reason, path: command },
    };
  }
  return {
    behavior: 'ask',
    ask: {
      kind: 'command',
      command,
      description: typeof description === 'string' ? description : null,
      alwaysAsk: decision.alwaysAsk,
      alwaysAllow: decision.alwaysAllow,
    },
  };
}

function isSessionTool(tool: string): tool is SessionTool {
  return (sessionTools as readonly string[]).includes(tool);
}

export async function decideToolUse(
  tool: string,
  input: Readonly<Record<string, unknown>>,
  context: ToolContext,
): Promise<ToolDecision> {
  const { worktree, mode, home } = context;
  if (!isSessionTool(tool)) {
    return { behavior: 'deny', message: `${tool} isn't available in this session.`, refusal: null };
  }
  if (tool === 'Bash') return decideBash(input, context);
  const target = targets[tool];
  if (target === null) return { behavior: 'allow' };

  const given = input[target.field];
  if (given !== undefined && typeof given !== 'string') return unreadable(tool);
  if (given === undefined && !target.optional) return unreadable(tool);

  let asked = given === undefined ? worktree : absolute(given, worktree, home);
  // A glob can reach out on its own ("/etc/*", "../../**"), so its fixed start counts as the folder too.
  const pattern = input['pattern'];
  if (tool === 'Glob' && typeof pattern === 'string') asked = absolute(fixedStart(pattern), asked, home);

  const shown = shownPath(asked, worktree);
  if (!(await insideWorktree(asked, worktree))) {
    // A file you picked, or a skill's folder, may be read where it is, and never changed (spec 022, AC-15, AC-53).
    if (target.access === 'read' && (await namedByBrief(asked, context.reads))) return { behavior: 'allow' };
    const where = await realPath(worktree);
    return {
      behavior: 'deny',
      message: `Orynx lets you work only inside the worktree, ${where ?? worktree}. ${shown} is outside it.`,
      refusal: { access: target.access, reason: 'outside_worktree', path: shown },
    };
  }
  if (target.access === 'edit' && mode === 'ask_everything' && isEditTool(tool)) {
    // Every edit waits for your click (spec 012, AC-8), shown with the change it would make (Q9).
    return { behavior: 'ask', ask: { kind: 'edit', path: shown, ...(await previewEdit(tool, input, asked)) } };
  }
  return { behavior: 'allow' };
}

function unreadable(tool: string): ToolDecision {
  return { behavior: 'deny', message: `Orynx couldn't read the path in this ${tool} call.`, refusal: null };
}

function absolute(path: string, from: string, home: string): string {
  if (path === '~') return home;
  if (path.startsWith('~/')) return join(home, path.slice(2));
  return isAbsolute(path) ? resolve(path) : resolve(from, path);
}

/** The part of a glob before its first wildcard: "/etc" for "/etc/*.conf", "../.." for "../../**". */
function fixedStart(pattern: string): string {
  const segments = pattern.split('/');
  const fixed: string[] = [];
  for (const segment of segments) {
    if (/[*?[\]{}!]/.test(segment)) break;
    fixed.push(segment);
  }
  // "/etc/x" splits into ["", "etc", "x"]: the empty first part keeps it absolute.
  if (fixed.length === segments.length) fixed.pop();
  return fixed.length === 1 && fixed[0] === '' ? '/' : fixed.join('/');
}

function shownPath(path: string, worktree: string): string {
  const inside = relative(worktree, path);
  return inside === '' || inside.startsWith('..') || isAbsolute(inside) ? path : inside;
}

/** Inside the worktree once every symlink is followed, and not in its `.git`, which points git at the repository. */
async function insideWorktree(path: string, worktree: string): Promise<boolean> {
  const [real, root] = await Promise.all([realPath(path), realPath(worktree)]);
  if (real === null || root === null) return false;
  if (real !== root && !real.startsWith(root + sep)) return false;
  const [first] = relative(root, real).split(sep);
  return first !== '.git';
}

/** Whether a path leads, once every symlink is followed, to a file the brief named or into a folder it named. */
async function namedByBrief(path: string, reads: AgentReads | undefined): Promise<boolean> {
  if (reads === undefined || (reads.files.length === 0 && reads.folders.length === 0)) return false;
  const real = await realPath(path);
  if (real === null) return false;
  return reads.files.includes(real) || reads.folders.some((folder) => real === folder || real.startsWith(folder + sep));
}

function missing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * Where a path really leads. A path that doesn't exist yet (a new file) leads to where its nearest
 * existing folder really is, and a symlink to a missing file leads to that file, so a write through it
 * can't land outside. Null when the path can't be read at all.
 */
async function realPath(path: string, depth = 0): Promise<string | null> {
  if (depth > 40) return null;
  try {
    return await realpath(path);
  } catch (error) {
    if (!missing(error)) return null;
  }
  try {
    const stat = await lstat(path);
    return stat.isSymbolicLink() ? await realPath(resolve(dirname(path), await readlink(path)), depth + 1) : null;
  } catch (error) {
    if (!missing(error)) return null;
  }
  const parent = dirname(path);
  if (parent === path) return path;
  const realParent = await realPath(parent, depth + 1);
  return realParent === null ? null : join(realParent, basename(path));
}
