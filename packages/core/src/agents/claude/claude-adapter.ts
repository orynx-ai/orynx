import { randomUUID } from 'node:crypto';
import type { Options, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { briefText } from '../../sessions/brief.ts';
import type { AgentAdapter, AgentEvent } from '../agent-adapter.ts';
import { createMessageReader } from './sdk-messages.ts';
import { decideToolUse, sessionTools } from './tool-decision.ts';

/**
 * Claude behind the agent adapter (spec 011), through the Claude Agent SDK's `query()`. Every option is
 * set on purpose, because the SDK's defaults load every settings file and let Claude Code allow tool
 * calls by its own rules:
 *
 * - `settingSources: []`, hooks off and `strictMcpConfig`: none of `~/.claude`'s or the repository's
 *   hooks, plugins, MCP servers or allow rules (Q7).
 * - `permissionMode: 'default'` and `canUseTool`: every call Claude Code doesn't allow by itself comes to
 *   the tool decision, and `tools` holds only Q6's tools.
 * - `env` replaces the environment: only the allow list (`agent-environment.ts`), and no telemetry.
 *
 * The brief goes in as a stream that stays open until Claude finishes, because the SDK can interrupt
 * only a session with streaming input; follow-ups (spec 013) will use the same stream.
 */

/** The part of the SDK's `Query` a session uses. The SDK's own `query()` gives more. */
export interface SessionQuery extends AsyncIterable<SDKMessage> {
  interrupt(): Promise<unknown>;
  close(): void;
}

/** The SDK's `query()`, or a fake at its boundary in tests. */
export type QueryFunction = (params: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => SessionQuery;

export interface ClaudeAdapterOptions {
  query: QueryFunction;
  /** The Claude Code to run: the one the SDK ships, or `DEVHUB_CLAUDE_CODE`. */
  program: string;
  /** From `agentEnvironment()`. */
  env: Readonly<Record<string, string>>;
  /** What `~` means in a path Claude gives. */
  home: string;
  /** How long Stop waits after interrupting before it ends the process; 5 seconds. */
  stopGraceMs?: number;
}

interface Running {
  handlers: Set<(event: AgentEvent) => void>;
  /** Events nobody has heard yet; null once the first handler has them. */
  waiting: AgentEvent[] | null;
  query: SessionQuery;
  /** Closes the prompt stream, so Claude Code exits once its turn is over. */
  endInput: () => void;
  ended: Promise<void>;
  done: boolean;
  stopping: boolean;
}

export function createClaudeAdapter({
  query,
  program,
  env,
  home,
  stopGraceMs = 5_000,
}: ClaudeAdapterOptions): AgentAdapter {
  const sessions = new Map<string, Running>();

  function emit(running: Running, event: AgentEvent) {
    if (running.waiting !== null) running.waiting.push(event);
    else for (const handler of running.handlers) handler(event);
  }

  return {
    id: 'claude',

    startSession(brief, worktree, permissions, instructions) {
      const id = randomUUID();
      let endInput: () => void = () => undefined;
      const inputOver = new Promise<void>((resolve) => {
        endInput = resolve;
      });
      async function* prompt(): AsyncGenerator<SDKUserMessage> {
        yield { type: 'user', message: { role: 'user', content: briefText(brief) }, parent_tool_use_id: null };
        await inputOver;
      }

      /** Events go through the map, because `canUseTool` is set up before the session is. */
      const send = (event: AgentEvent) => {
        const running = sessions.get(id);
        if (running !== undefined) emit(running, event);
      };

      const options: Options = {
        cwd: worktree,
        pathToClaudeCodeExecutable: program,
        env: { ...env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
        permissionMode: 'default',
        tools: [...sessionTools],
        settingSources: [],
        settings: { disableAllHooks: true },
        strictMcpConfig: true,
        mcpServers: {},
        systemPrompt: { type: 'preset', preset: 'claude_code', append: instructions },
        // Claude Code's own output can hold the brief or file contents; it never reaches the log.
        stderr: () => undefined,
        async canUseTool(tool, input) {
          const decision = await decideToolUse(tool, input, { worktree, mode: permissions.mode, home });
          if (decision.behavior === 'allow') return { behavior: 'allow', updatedInput: input };
          if (decision.refusal !== null) {
            send({ type: 'work', sessionId: id, work: { kind: 'refused', refusal: decision.refusal } });
          }
          return { behavior: 'deny', message: decision.message };
        },
      };

      const running: Running = {
        handlers: new Set(),
        waiting: [],
        query: query({ prompt: prompt(), options }),
        endInput,
        ended: Promise.resolve(),
        done: false,
        stopping: false,
      };
      sessions.set(id, running);
      const read = createMessageReader(worktree);
      running.ended = (async () => {
        let failed = false;
        try {
          for await (const message of running.query) {
            for (const said of read(message)) {
              if (said.type === 'started') {
                emit(running, {
                  type: 'started',
                  sessionId: id,
                  agentSessionId: said.claudeSessionId,
                  loaded: said.loaded,
                });
              } else if (said.type === 'work') {
                emit(running, { type: 'work', sessionId: id, work: said.work });
                if (said.work.kind === 'finished') endInput();
              } else {
                failed = true;
                emit(running, { type: 'problem', sessionId: id, kind: said.kind, code: said.code });
                endInput();
              }
            }
          }
        } catch {
          // The process died: its message can hold anything, so only the fact is passed on.
          if (!failed && !running.stopping)
            emit(running, { type: 'problem', sessionId: id, kind: 'other', code: 'exited' });
        } finally {
          endInput();
          running.done = true;
          emit(running, { type: 'ended', sessionId: id });
        }
      })();
      return Promise.resolve(id);
    },

    onEvent(sessionId, handler) {
      const running = sessions.get(sessionId);
      if (running === undefined) return () => undefined;
      running.handlers.add(handler);
      if (running.waiting !== null) {
        const waiting = running.waiting;
        running.waiting = null;
        for (const event of waiting) handler(event);
      }
      return () => {
        running.handlers.delete(handler);
      };
    },

    respond() {
      return Promise.reject(new Error('Approvals come with spec 012.'));
    },

    sendMessage() {
      return Promise.reject(new Error('Follow-ups come with spec 013.'));
    },

    async stop(sessionId) {
      const running = sessions.get(sessionId);
      if (running === undefined || running.done) return;
      running.stopping = true;
      await running.query.interrupt().catch(() => undefined);
      running.endInput();
      let timer: NodeJS.Timeout | undefined;
      const late = new Promise<'late'>((resolve) => {
        timer = setTimeout(resolve, stopGraceMs, 'late');
      });
      const outcome = await Promise.race([running.ended.then(() => 'ended' as const), late]);
      clearTimeout(timer);
      if (outcome === 'late') {
        running.query.close();
        await running.ended;
      }
    },
  };
}
