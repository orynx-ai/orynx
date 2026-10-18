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
  | { tool: string; input: Record<string, unknown> }
  /** Claude Code ends the turn with this summary. */
  | { finish: string }
  /** Any message, as it is. */
  | { message: object }
  /** Claude keeps working until it's interrupted or closed. */
  | { hang: true }
  /** Claude Code's process dies. */
  | { crash: string };

export interface FakeRun {
  options: Options;
  /** The text of every user message the prompt stream gave. */
  prompts: string[];
  /** What `canUseTool` answered, in order. */
  decisions: { tool: string; result: PermissionResult }[];
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
      const run: FakeRun = { options, prompts: [], decisions: [], interrupts: 0, closes: 0 };
      fake.runs.push(run);
      let endNow: () => void = () => undefined;
      // Ending the process ends the stream, wherever Claude Code was.
      const ended = new Promise<IteratorReturnResult<undefined>>((resolve) => {
        endNow = () => {
          resolve({ done: true, value: undefined });
        };
      });

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

        let n = 0;
        for (const turn of script) {
          if ('tool' in turn) {
            n += 1;
            const id = `toolu_${String(n)}`;
            const ask = options.canUseTool;
            const result: PermissionResult | null = ask
              ? await ask(turn.tool, turn.input, {
                  signal: new AbortController().signal,
                  toolUseID: id,
                } as CanUseToolOptions)
              : { behavior: 'allow' };
            if (result === null) throw new Error('The fake SDK never expects null from canUseTool');
            run.decisions.push({ tool: turn.tool, result });
            yield {
              type: 'assistant',
              parent_tool_use_id: null,
              ...sessionFields,
              message: { role: 'assistant', content: [{ type: 'tool_use', id, name: turn.tool, input: turn.input }] },
            } as unknown as SDKMessage;
            yield {
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
            } as unknown as SDKMessage;
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
            await ended;
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
          if (!fake.ignoreInterrupt) endNow();
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
