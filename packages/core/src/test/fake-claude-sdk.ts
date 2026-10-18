import type { Options, PermissionResult, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { QueryFunction } from '../agents/claude/claude-adapter.ts';

/**
 * The Claude Agent SDK's `query()`, faked at its boundary (agent-runtime skill: Claude is an outside
 * service). It plays a script the way Claude Code would: it starts with the `init` message, asks
 * `canUseTool` about every tool call, sends the call and its result (an error when refused), and ends
 * the turn. It records what it was given, so a test can check the options and the prompt.
 */

export type FakeTurn =
  /** Claude calls a tool; the fake asks `canUseTool` first, as Claude Code does. */
  | FakeToolCall
  /** Claude calls several tools in one message: the fake asks about all of them at once (spec 012, AC-10). */
  | { together: FakeToolCall[] }
  /** Claude Code ends the turn with this summary. */
  | { finish: string }
  /** Any message, as it is. */
  | { message: object }
  /** Claude keeps working until it's interrupted (then the turn ends with a failed result) or closed. */
  | { hang: true }
  /** Claude Code's process dies. */
  | { crash: string };

export interface FakeToolCall {
  tool: string;
  input: Record<string, unknown>;
}

export interface FakeRun {
  options: Options;
  /** The text of every user message the prompt stream gave. */
  prompts: string[];
  /** What `canUseTool` answered, in the order it answered. */
  decisions: { tool: string; result: PermissionResult }[];
  /** How many `canUseTool` calls are waiting for an answer now. */
  waiting: number;
  /** Drops every waiting call, as Claude Code does when it no longer needs the answer. */
  cancelAsks: () => void;
  interrupts: number;
  closes: number;
}

export interface FakeClaudeSdk {
  query: QueryFunction;
  runs: FakeRun[];
  /** A hanging turn ignores `interrupt()`, so only `close()` ends it. */
  ignoreInterrupt: boolean;
}

const sessionFields = {
  session_id: 'b2c7e0f4-0000-4000-8000-000000000001',
  uuid: 'b2c7e0f4-0000-4000-8000-0000000000aa',
};

function textOf(message: SDKUserMessage): string {
  const content = message.message.content;
  if (typeof content === 'string') return content;
  return content.map((block) => ('text' in block && typeof block.text === 'string' ? block.text : '')).join('');
}

type CanUseToolOptions = Parameters<NonNullable<Options['canUseTool']>>[2];

export function fakeClaudeSdk(script: readonly FakeTurn[]): FakeClaudeSdk {
  const fake: FakeClaudeSdk = {
    runs: [],
    ignoreInterrupt: false,
    query: ({ prompt, options }) => {
      /** The calls waiting for `canUseTool`: Claude Code cancels them when it's interrupted. */
      const asking = new Set<AbortController>();
      const run: FakeRun = {
        options,
        prompts: [],
        decisions: [],
        waiting: 0,
        cancelAsks: () => {
          for (const controller of asking) controller.abort();
        },
        interrupts: 0,
        closes: 0,
      };
      fake.runs.push(run);
      let endNow: () => void = () => undefined;
      // Ending the process ends the stream, wherever Claude Code was.
      const ended = new Promise<IteratorReturnResult<undefined>>((resolve) => {
        endNow = () => {
          resolve({ done: true, value: undefined });
        };
      });
      let interruptNow: () => void = () => undefined;
      let wasInterrupted = false;
      const interrupted = new Promise<'interrupted'>((resolve) => {
        interruptNow = () => {
          wasInterrupted = true;
          resolve('interrupted');
        };
      });
      let n = 0;

      async function decide(call: FakeToolCall): Promise<{ id: string; result: PermissionResult }> {
        n += 1;
        const id = `toolu_${String(n)}`;
        const ask = options.canUseTool;
        if (!ask) return { id, result: { behavior: 'allow' } };
        const controller = new AbortController();
        asking.add(controller);
        run.waiting += 1;
        try {
          const result = await ask(call.tool, call.input, {
            signal: controller.signal,
            toolUseID: id,
          } as CanUseToolOptions);
          if (result === null) throw new Error('The fake SDK never expects null from canUseTool');
          run.decisions.push({ tool: call.tool, result });
          return { id, result };
        } finally {
          run.waiting -= 1;
          asking.delete(controller);
        }
      }

      function toolMessages(call: FakeToolCall, id: string, result: PermissionResult): SDKMessage[] {
        return [
          {
            type: 'assistant',
            parent_tool_use_id: null,
            ...sessionFields,
            message: { role: 'assistant', content: [{ type: 'tool_use', id, name: call.tool, input: call.input }] },
          } as unknown as SDKMessage,
          {
            type: 'user',
            parent_tool_use_id: null,
            ...sessionFields,
            message: {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: id,
                  content: result.behavior === 'allow' ? 'ok' : result.message,
                  is_error: result.behavior !== 'allow',
                },
              ],
            },
          } as unknown as SDKMessage,
        ];
      }

      /** As Claude Code ends an interrupted turn: a failed result. */
      const interruptedResult = {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        errors: [],
        ...sessionFields,
      } as unknown as SDKMessage;

      async function* play(): AsyncGenerator<SDKMessage> {
        const input = prompt[Symbol.asyncIterator]();
        const first = await input.next();
        if (first.done !== true) run.prompts.push(textOf(first.value));
        yield {
          type: 'system',
          subtype: 'init',
          ...sessionFields,
          cwd: options.cwd,
          tools: Array.isArray(options.tools) ? options.tools : [],
          mcp_servers: [],
          plugins: [],
        } as unknown as SDKMessage;

        for (const turn of script) {
          if ('tool' in turn || 'together' in turn) {
            const calls = 'together' in turn ? turn.together : [turn];
            const answers = await Promise.all(calls.map(decide));
            for (const [i, call] of calls.entries()) {
              const answer = answers[i];
              if (answer !== undefined) yield* toolMessages(call, answer.id, answer.result);
            }
            if (wasInterrupted) {
              yield interruptedResult;
              break;
            }
          } else if ('finish' in turn) {
            yield {
              type: 'result',
              subtype: 'success',
              is_error: false,
              result: turn.finish,
              num_turns: n,
              ...sessionFields,
            } as unknown as SDKMessage;
          } else if ('message' in turn) {
            yield turn.message as SDKMessage;
          } else if ('hang' in turn) {
            await interrupted;
            // As Claude Code does: an interrupted turn ends with a failed result, then waits for the input to end.
            yield interruptedResult;
            break;
          } else {
            throw new Error(turn.crash);
          }
        }
        // Claude Code waits for more input until the prompt stream ends, then exits.
        await input.next();
      }

      const stream = play();
      return {
        [Symbol.asyncIterator]: () => ({ next: () => Promise.race([stream.next(), ended]) }),
        interrupt() {
          run.interrupts += 1;
          if (!fake.ignoreInterrupt) {
            interruptNow();
            run.cancelAsks();
          }
          return Promise.resolve();
        },
        close() {
          run.closes += 1;
          endNow();
        },
      };
    },
  };
  return fake;
}
