import { randomUUID } from 'node:crypto';
import type {
  Options,
  PermissionResult,
  SandboxSettings,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { briefText } from '../../sessions/brief.ts';
import type { AgentAdapter, AgentAsk, AgentEvent } from '../agent-adapter.ts';
import { createMessageReader } from './sdk-messages.ts';
import { decideToolUse, sessionTools, sessionToolsWithoutCommands } from './tool-decision.ts';

/**
 * Claude behind the agent adapter (spec 011), through the Claude Agent SDK's `query()`. Every option is
 * set on purpose, because the SDK's defaults load every settings file and let Claude Code allow tool
 * calls by its own rules:
 *
 * - `settingSources: []`, hooks off and `strictMcpConfig`: none of `~/.claude`'s or the repository's
 *   hooks, plugins, MCP servers or allow rules (Q7).
 * - `permissionMode: 'default'` and `canUseTool`: every call Claude Code doesn't allow by itself comes to
 *   the tool decision, and `tools` holds only the session's tools.
 * - `sandbox`: every command runs in Claude Code's sandbox (spec 012, Q2a). Without one, `Bash` is left
 *   out of `tools`, so no command can run at all (Q2b).
 * - `env` replaces the environment: only the allow list (`agent-environment.ts`), and no telemetry.
 *
 * A call the tool decision asks about waits in `canUseTool` until `respond()` answers it, Stop denies it,
 * or Claude Code drops it (spec 012). The SDK holds the call meanwhile, with no time limit.
 *
 * The brief goes in as a stream that stays open until Claude finishes, because the SDK can interrupt
 * only a session with streaming input. A follow-up sent while Claude works goes into the same stream, with an
 * id of its own and `priority: 'next'`, so Claude reads it after its current step (spec 013, AC-12). Claude
 * has finished only when a turn ends with no message of yours left: none queued in Claude Code, and every id
 * Orynx sent among those the turns took. Stop refuses every call from then on, and when Claude Code still
 * holds a message it hasn't read, ends it at once, so Claude never acts on that message (AC-17).
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
  /**
   * The sandbox for a session's commands, from `sandboxSettings()`; null where it can't run here, and then
   * a session gets no commands (spec 012, Q2b). Null by default, so nothing runs a command unsandboxed.
   */
  sandbox?: ((worktree: string) => SandboxSettings) | null;
}

/** How a waiting call ended: your answer, Stop, or Claude Code dropping it. */
type Outcome = 'allow' | 'deny' | 'stopped' | 'dropped';

/** Said to Claude when you deny a call (spec 012). */
const deniedMessage =
  "The user denied this. Don't try it another way. Carry on without it, or say in your summary what you needed.";

interface Running {
  handlers: Set<(event: AgentEvent) => void>;
  /** Events nobody has heard yet; null once the first handler has them. */
  waiting: AgentEvent[] | null;
  query: SessionQuery;
  /** Closes the prompt stream, so Claude Code exits once its turn is over. */
  endInput: () => void;
  /** Puts a message in the prompt stream; false once the stream is closed. */
  give: (message: SDKUserMessage) => boolean;
  /** Messages Claude Code has been given and no turn has taken yet, by id (spec 013). */
  unread: Set<string>;
  ended: Promise<void>;
  done: boolean;
  stopping: boolean;
  /** The calls waiting for an answer, by approval id: each ends with one outcome. */
  parked: Map<string, (outcome: Outcome) => void>;
  /** Every tool call `canUseTool` was asked about, so the reader shows a command once (spec 012). */
  decided: Set<string>;
  /**
   * The decision before this one: calls are decided one at a time, in the order Claude Code asked, so
   * calls asked together wait in that order whichever reads Settings faster (AC-10).
   */
  deciding: Promise<unknown>;
}

export function createClaudeAdapter({
  query,
  program,
  env,
  home,
  stopGraceMs = 5_000,
  sandbox = null,
}: ClaudeAdapterOptions): AgentAdapter {
  const sessions = new Map<string, Running>();

  function emit(running: Running, event: AgentEvent) {
    if (running.waiting !== null) running.waiting.push(event);
    else for (const handler of running.handlers) handler(event);
  }

  /** Ends a waiting call with `outcome`, and says so; false when it wasn't waiting. */
  function settle(sessionId: string, running: Running, approvalId: string, outcome: Outcome): boolean {
    const resolve = running.parked.get(approvalId);
    if (resolve === undefined) return false;
    running.parked.delete(approvalId);
    emit(running, { type: 'answered', sessionId, approvalId, allowed: outcome === 'allow' });
    resolve(outcome);
    return true;
  }

  /** Parks a call until it's answered, telling the session it waits. */
  function waitForAnswer(sessionId: string, ask: AgentAsk, signal: AbortSignal): Promise<Outcome> {
    const running = sessions.get(sessionId);
    if (running === undefined || running.done || running.stopping || signal.aborted) {
      return Promise.resolve('stopped');
    }
    const approvalId = randomUUID();
    const answer = new Promise<Outcome>((resolve) => {
      running.parked.set(approvalId, resolve);
    });
    const drop = () => settle(sessionId, running, approvalId, 'dropped');
    signal.addEventListener('abort', drop, { once: true });
    emit(running, { type: 'approval', sessionId, approvalId, ask });
    return answer.finally(() => {
      signal.removeEventListener('abort', drop);
    });
  }

  return {
    id: 'claude',
    runsCommands: sandbox !== null,

    startSession(brief, worktree, permissions, instructions, resuming) {
      const resume = resuming?.resume;
      const id = randomUUID();
      // The prompt stream: the brief, then each follow-up as it's given, until the input is over.
      const given: SDKUserMessage[] = [];
      let over = false;
      let wake: () => void = () => undefined;
      const endInput = () => {
        over = true;
        wake();
      };
      const give = (message: SDKUserMessage) => {
        if (over) return false;
        given.push(message);
        wake();
        return true;
      };
      async function* prompt(): AsyncGenerator<SDKUserMessage> {
        yield { type: 'user', message: { role: 'user', content: briefText(brief) }, parent_tool_use_id: null };
        for (;;) {
          const next = given.shift();
          if (next !== undefined) {
            yield next;
            continue;
          }
          if (over) return;
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
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
        tools: sandbox === null ? [...sessionToolsWithoutCommands] : [...sessionTools],
        ...(sandbox === null ? {} : { sandbox: sandbox(worktree) }),
        settingSources: [],
        settings: { disableAllHooks: true },
        // A follow-up carries on Claude Code's own session, with its conversation (spec 013).
        ...(resume === undefined ? {} : { resume }),
        strictMcpConfig: true,
        mcpServers: {},
        systemPrompt: { type: 'preset', preset: 'claude_code', append: instructions },
        // Claude Code's own output can hold the brief or file contents; it never reaches the log.
        stderr: () => undefined,
        async canUseTool(tool, input, { signal, toolUseID }): Promise<PermissionResult> {
          const current = sessions.get(id);
          // Once you've pressed Stop nothing more runs, whatever Claude Code still holds (spec 013, AC-17).
          if (current?.stopping === true) {
            return { behavior: 'deny', message: 'The user stopped the session.', interrupt: true };
          }
          current?.decided.add(toolUseID);
          const decide = async () => decideToolUse(tool, input, { worktree, home, ...(await permissions()) });
          const turn = (current?.deciding ?? Promise.resolve()).then(decide);
          if (current !== undefined) current.deciding = turn.catch(() => undefined);
          const decision = await turn;
          if (decision.behavior === 'allow') {
            const command = input['command'];
            if (tool === 'Bash' && typeof command === 'string') {
              send({ type: 'work', sessionId: id, work: { kind: 'command', command } });
            }
            return { behavior: 'allow', updatedInput: input };
          }
          if (decision.behavior === 'deny') {
            if (decision.refusal !== null) {
              send({ type: 'work', sessionId: id, work: { kind: 'refused', refusal: decision.refusal } });
            }
            return { behavior: 'deny', message: decision.message };
          }

          const { ask } = decision;
          const outcome = await waitForAnswer(id, ask, signal);
          if (outcome === 'stopped')
            return { behavior: 'deny', message: 'The user stopped the session.', interrupt: true };
          if (outcome === 'dropped') return { behavior: 'deny', message: 'Cancelled.' };
          if (outcome === 'deny') {
            const text = ask.kind === 'command' ? ask.command : ask.path;
            send({ type: 'work', sessionId: id, work: { kind: 'denied', about: ask.kind, text } });
            return { behavior: 'deny', message: deniedMessage };
          }
          if (ask.kind === 'edit') return { behavior: 'allow', updatedInput: input };
          send({ type: 'work', sessionId: id, work: { kind: 'command', command: ask.command } });
          // A command that always asks runs outside the sandbox, this once (Q2a).
          const updatedInput = ask.alwaysAsk === null ? input : { ...input, dangerouslyDisableSandbox: true };
          return { behavior: 'allow', updatedInput };
        },
      };

      const running: Running = {
        handlers: new Set(),
        waiting: [],
        query: query({ prompt: prompt(), options }),
        endInput,
        give,
        unread: new Set(),
        ended: Promise.resolve(),
        done: false,
        stopping: false,
        parked: new Map(),
        decided: new Set(),
        deciding: Promise.resolve(),
      };
      sessions.set(id, running);
      const read = createMessageReader(worktree, (toolUseId) => running.decided.has(toolUseId));
      running.ended = (async () => {
        let failed = false;
        let started = false;
        /** Says Claude couldn't carry on a resumed session, once, and ends Claude Code before it does anything. */
        const lostConversation = (code: 'no_conversation' | 'new_conversation') => {
          failed = true;
          emit(running, { type: 'problem', sessionId: id, kind: 'resume', code });
          endInput();
        };
        try {
          for await (const message of running.query) {
            for (const said of read(message)) {
              if (said.type === 'started' && resume !== undefined && said.claudeSessionId !== resume) {
                // Claude Code started a new conversation: Claude would work without its history.
                lostConversation('new_conversation');
                running.query.close();
              } else if (said.type === 'started') {
                started = true;
                emit(running, {
                  type: 'started',
                  sessionId: id,
                  agentSessionId: said.claudeSessionId,
                  loaded: said.loaded,
                });
                if (sandbox === null) emit(running, { type: 'work', sessionId: id, work: { kind: 'no_commands' } });
              } else if (said.type === 'work') {
                emit(running, { type: 'work', sessionId: id, work: said.work });
              } else if (said.type === 'turn_ended') {
                // A Claude Code too old to say which messages it took is done when none are queued.
                if (said.took === null && said.queued === 0) running.unread.clear();
                for (const took of said.took ?? []) running.unread.delete(took);
                if (said.queued === 0 && running.unread.size === 0) {
                  emit(running, { type: 'work', sessionId: id, work: { kind: 'finished', summary: said.summary } });
                  endInput();
                }
              } else if (failed) {
                // Said already, once.
              } else if (resume !== undefined && !started && said.kind === 'other') {
                lostConversation('no_conversation');
              } else if (!running.stopping) {
                // An interrupted turn ends with a failed result; after Stop that isn't a problem.
                failed = true;
                emit(running, { type: 'problem', sessionId: id, kind: said.kind, code: said.code });
                endInput();
              }
            }
          }
        } catch {
          // The process died: its message can hold anything, so only the fact is passed on. Before it started,
          // a resumed Claude Code dies because it can't find the conversation.
          if (!failed && !running.stopping) {
            if (resume !== undefined && !started) lostConversation('no_conversation');
            else emit(running, { type: 'problem', sessionId: id, kind: 'other', code: 'exited' });
          }
        } finally {
          endInput();
          // Claude Code is gone, so nobody waits for these answers any more.
          for (const approvalId of [...running.parked.keys()]) settle(id, running, approvalId, 'dropped');
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

    respond(sessionId, approvalId, decision) {
      const running = sessions.get(sessionId);
      if (running === undefined || running.stopping) return Promise.resolve(false);
      return Promise.resolve(settle(sessionId, running, approvalId, decision === 'deny' ? 'deny' : 'allow'));
    },

    sendMessage(sessionId, text) {
      const running = sessions.get(sessionId);
      if (running === undefined || running.done || running.stopping) return Promise.resolve(false);
      const uuid = randomUUID();
      const message: SDKUserMessage = {
        type: 'user',
        message: { role: 'user', content: text },
        parent_tool_use_id: null,
        uuid,
        priority: 'next',
      };
      if (!running.give(message)) return Promise.resolve(false);
      running.unread.add(uuid);
      return Promise.resolve(true);
    },

    async stop(sessionId) {
      const running = sessions.get(sessionId);
      if (running === undefined || running.done) return;
      running.stopping = true;
      // A call waiting for you would hold Claude Code's turn open: deny it before interrupting.
      for (const approvalId of [...running.parked.keys()]) settle(sessionId, running, approvalId, 'stopped');
      await running.query.interrupt().catch(() => undefined);
      running.endInput();
      // Claude Code would take a message it holds as its next turn: end it now rather than let that turn run.
      if (running.unread.size > 0) {
        running.query.close();
        await running.ended;
        return;
      }
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
