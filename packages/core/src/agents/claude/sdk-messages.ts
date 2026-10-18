import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { isAbsolute, relative } from 'node:path';
import { z } from 'zod';
import type { AgentProblemKind, AgentWork } from '../agent-adapter.ts';

/**
 * Reads the messages the Claude Agent SDK streams during a session (spec 011) into what the session
 * shows: Claude Code started, a piece of work, or a problem. The stream is outside data, so every part
 * this file uses is read with zod and anything else is ignored. Claude's own words never leave this
 * file except its final summary: a problem carries only a code that is safe to log (AC-21).
 */

export type ProblemKind = AgentProblemKind;

export type ReadMessage =
  /** How much Claude Code loaded is logged by count, so a surprise (an MCP server, a plugin) shows without names. */
  | { type: 'started'; claudeSessionId: string; loaded: { tools: number; mcpServers: number; plugins: number } }
  | { type: 'work'; work: AgentWork }
  | { type: 'problem'; kind: ProblemKind; code: string };

const InitSchema = z.object({
  type: z.literal('system'),
  subtype: z.literal('init'),
  session_id: z.string(),
  tools: z.array(z.unknown()),
  mcp_servers: z.array(z.unknown()),
  plugins: z.array(z.unknown()).optional(),
});

const ToolUseSchema = z.object({ type: z.literal('tool_use'), id: z.string(), name: z.string(), input: z.unknown() });
const ToolResultSchema = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string(),
  is_error: z.boolean().nullish(),
});
const BlocksSchema = z.object({ message: z.object({ content: z.array(z.unknown()) }) });

const AssistantErrorSchema = z.object({ type: z.literal('assistant'), error: z.string() });

const ResultSchema = z.object({
  type: z.literal('result'),
  subtype: z.string(),
  is_error: z.boolean(),
  result: z.string().optional(),
  api_error_status: z.number().nullish(),
  startup_failure_reason: z.string().optional(),
});

const PathInputSchema = z.object({ file_path: z.string() });
const NotebookInputSchema = z.object({ notebook_path: z.string() });
const TodoInputSchema = z.object({ todos: z.array(z.object({ content: z.string().min(1) })) });

/** Errors on an assistant message that mean the login didn't work, or that a limit was reached. */
const loginErrors = new Set([
  'authentication_failed',
  'oauth_org_not_allowed',
  'account_on_hold',
  'verification_required',
  'cloud_credential_error',
]);
const limitErrors = new Set(['rate_limit', 'billing_error', 'overloaded']);

/** Reasons Claude Code gives for not starting that come down to the login or the organisation. */
function startupIsLogin(reason: string): boolean {
  return reason.startsWith('gateway_') || reason.startsWith('org_') || reason === 'provider_not_allowed';
}

function errorKind(error: string): ProblemKind {
  if (loginErrors.has(error)) return 'login';
  return limitErrors.has(error) ? 'limit' : 'other';
}

function statusKind(status: number): ProblemKind {
  if (status === 401 || status === 403) return 'login';
  return status === 429 || status === 529 ? 'limit' : 'other';
}

/**
 * One reader per session: it remembers each tool call until its result arrives, so only calls that
 * worked become work. A refused call comes back as a failed result and is left out here; the tool
 * decision already made it a step.
 */
export function createMessageReader(worktree: string): (message: SDKMessage) => ReadMessage[] {
  const calls = new Map<string, { name: string; input: unknown }>();
  let failed = false;

  /** A path inside the worktree as the session shows it, relative; anything else as Claude gave it. */
  function inWorktree(path: string): string {
    if (!isAbsolute(path)) return path;
    const inside = relative(worktree, path);
    return inside === '' || inside.startsWith('..') || isAbsolute(inside) ? path : inside;
  }

  function workOf(name: string, input: unknown): AgentWork | null {
    switch (name) {
      case 'Read': {
        const read = PathInputSchema.safeParse(input);
        return read.success ? { kind: 'explore', file: inWorktree(read.data.file_path) } : null;
      }
      case 'Glob':
      case 'Grep':
        return { kind: 'explore', file: null };
      case 'Edit':
      case 'Write': {
        const edit = PathInputSchema.safeParse(input);
        return edit.success ? { kind: 'edit', file: inWorktree(edit.data.file_path) } : null;
      }
      case 'NotebookEdit': {
        const edit = NotebookInputSchema.safeParse(input);
        return edit.success ? { kind: 'edit', file: inWorktree(edit.data.notebook_path) } : null;
      }
      case 'TodoWrite': {
        const todos = TodoInputSchema.safeParse(input);
        return todos.success ? { kind: 'plan', items: todos.data.todos.map((todo) => todo.content) } : null;
      }
      default:
        return null;
    }
  }

  function problem(kind: ProblemKind, code: string): ReadMessage[] {
    if (failed) return [];
    failed = true;
    return [{ type: 'problem', kind, code }];
  }

  return (message) => {
    const init = InitSchema.safeParse(message);
    if (init.success) {
      const { session_id, tools, mcp_servers, plugins = [] } = init.data;
      return [
        {
          type: 'started',
          claudeSessionId: session_id,
          loaded: { tools: tools.length, mcpServers: mcp_servers.length, plugins: plugins.length },
        },
      ];
    }

    const assistantError = AssistantErrorSchema.safeParse(message);
    if (assistantError.success) return problem(errorKind(assistantError.data.error), assistantError.data.error);

    const result = ResultSchema.safeParse(message);
    if (result.success) {
      const { subtype, is_error, api_error_status, startup_failure_reason } = result.data;
      if (subtype === 'success' && !is_error) {
        return failed ? [] : [{ type: 'work', work: { kind: 'finished', summary: result.data.result ?? '' } }];
      }
      if (typeof api_error_status === 'number') {
        return problem(statusKind(api_error_status), `api_${String(api_error_status)}`);
      }
      if (startup_failure_reason !== undefined) {
        return problem(startupIsLogin(startup_failure_reason) ? 'login' : 'other', startup_failure_reason);
      }
      return problem('other', subtype);
    }

    const blocks = BlocksSchema.safeParse(message);
    if (!blocks.success || failed) return [];
    const said: ReadMessage[] = [];
    for (const block of blocks.data.message.content) {
      const use = ToolUseSchema.safeParse(block);
      if (use.success) {
        calls.set(use.data.id, { name: use.data.name, input: use.data.input });
        continue;
      }
      const done = ToolResultSchema.safeParse(block);
      if (!done.success) continue;
      const call = calls.get(done.data.tool_use_id);
      calls.delete(done.data.tool_use_id);
      if (call === undefined || done.data.is_error === true) continue;
      const work = workOf(call.name, call.input);
      if (work !== null) said.push({ type: 'work', work });
    }
    return said;
  };
}
