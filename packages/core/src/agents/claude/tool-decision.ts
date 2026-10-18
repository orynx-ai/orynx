import { lstat, readlink, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { PermissionMode } from '@devhub/contracts';

/**
 * What Claude may do in a session before approvals exist (spec 011, Q6): read, search, plan and edit
 * inside the session's worktree, and nothing else. Nobody can say yes to a command until spec 012, and
 * CLAUDE.md rule 11 forbids running one without a click, so a session has no `Bash`, no web, no MCP
 * tools, no sub-agents and no questions. Claude Code's `canUseTool` asks this file about every call it
 * doesn't allow by itself.
 */

/** The only tools a session gets, passed to the SDK's `tools` so Claude never sees the others. */
export const sessionTools = ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'NotebookEdit', 'TodoWrite'] as const;
type SessionTool = (typeof sessionTools)[number];

/** A refused call the session shows as a step (Q10a). */
export interface ToolRefusal {
  access: 'read' | 'edit';
  reason: 'outside_worktree' | 'ask_everything';
  /** As Claude asked for it: relative to the worktree when it's inside, otherwise absolute. */
  path: string;
}

export type ToolDecision =
  | { behavior: 'allow' }
  /** `message` is for Claude. `refusal` is null for a call nobody needs to see, like a tool it doesn't have. */
  | { behavior: 'deny'; message: string; refusal: ToolRefusal | null };

export interface ToolContext {
  /** The session's worktree, Claude's working folder. */
  worktree: string;
  mode: PermissionMode;
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
};

function isSessionTool(tool: string): tool is SessionTool {
  return (sessionTools as readonly string[]).includes(tool);
}

export async function decideToolUse(
  tool: string,
  input: Readonly<Record<string, unknown>>,
  { worktree, mode, home }: ToolContext,
): Promise<ToolDecision> {
  if (!isSessionTool(tool)) {
    return { behavior: 'deny', message: `${tool} isn't available in this session.`, refusal: null };
  }
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
    const where = await realPath(worktree);
    return {
      behavior: 'deny',
      message: `Orynx lets you work only inside the worktree, ${where ?? worktree}. ${shown} is outside it.`,
      refusal: { access: target.access, reason: 'outside_worktree', path: shown },
    };
  }
  if (target.access === 'edit' && mode === 'ask_everything') {
    return {
      behavior: 'deny',
      message:
        "Ask before everything is on, and Orynx can't ask the user yet, so file edits are refused. " +
        'Describe the change you would make instead.',
      refusal: { access: 'edit', reason: 'ask_everything', path: shown },
    };
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
