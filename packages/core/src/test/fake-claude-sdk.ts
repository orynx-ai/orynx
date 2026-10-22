import type { ModelInfo, Options, PermissionResult, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { QueryFunction } from '../agents/claude/claude-adapter.ts';
import { readingInstructions } from '../sessions/ask-reading.ts';

/**
 * The Claude Agent SDK's `query()`, faked at its boundary (agent-runtime skill: Claude is an outside
 * service). It plays a script the way Claude Code would: it starts with the `init` message, asks
 * `canUseTool` about every tool call, sends the call and its result (an error when refused), and ends
 * the turn. A tool named `mcp__<server>__<tool>` is called on that in-process MCP server once it's allowed, as
 * Claude Code calls Orynx's ticket tools (spec 037). It records what it was given, so a test can check the options and the prompt.
 *
 * It reads the prompt stream all the time, as Claude Code does (spec 013). A message that arrives while
 * Claude works waits in a queue and is folded into the turn after Claude's next tool call. One still queued
 * when the turn ends starts a turn of its own. Each result lists the ids of the messages its turn took
 * (`user_message_uuids`) and how many still wait (`queued_turn_count`), as the pinned SDK's types say.
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
  | { crash: string }
  /** Claude waits until a message arrives in the prompt stream (spec 013). */
  | { waitForMessage: true }
  /** Claude waits until the test lets it go on. */
  | { gate: Promise<unknown> };

export interface FakeToolCall {
  tool: string;
  input: Record<string, unknown>;
  /** What the tool gives back once it runs; "ok" when left out (spec 036). */
  output?: string;
  /** It ran and failed, as a command that exits with an error does. */
  fails?: boolean;
  /** Once allowed, it runs until Claude is interrupted, as a server does, and gives no result. */
  hangs?: boolean;
}

export interface FakeRun {
  options: Options;
  /** The text of every user message the prompt stream gave. */
  prompts: string[];
  /** Every user message the prompt stream gave, with its id and priority (spec 013). */
  messages: { text: string; uuid: string | undefined; priority: SDKUserMessage['priority'] }[];
  /** What `canUseTool` answered, in the order it answered. */
  decisions: { tool: string; result: PermissionResult }[];
  /** What each MCP tool answered Claude, in order: what Claude reads, so nothing secret may be in it. */
  results: { tool: string; text: string; isError: boolean }[];
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
  /**
   * What a resume finds (spec 013): the conversation (by default), none, so Claude Code exits before it starts,
   * or a new one under another id, as Claude Code might when it can't find the old one.
   */
  onResume: 'resumes' | 'no_conversation' | 'starts_afresh';
  /** What `supportedModels()` answers: these models, a failure, or nothing at all. */
  models: ModelInfo[] | 'fails' | 'hangs';
  /**
   * The quick reads of your ask (spec 042), kept apart from `runs` so a session's scripts stay in order. Each answers
   * the next of `reads`, or with nothing Orynx can read, so the session starts as it did before spec 042.
   */
  readRuns: FakeRun[];
  reads: string[];
}

const sessionFields = {
  session_id: 'b2c7e0f4-0000-4000-8000-000000000001',
  uuid: 'b2c7e0f4-0000-4000-8000-0000000000aa',
};

/** The id Claude Code gives the new conversation it starts when it can't resume the old one. */
export const freshSessionId = 'b2c7e0f4-0000-4000-8000-0000000000ff';

function textOf(message: SDKUserMessage): string {
  const content = message.message.content;
  if (typeof content === 'string') return content;
  return content.map((block) => ('text' in block && typeof block.text === 'string' ? block.text : '')).join('');
}

type CanUseToolOptions = Parameters<NonNullable<Options['canUseTool']>>[2];

/**
 * Each run plays `script`, unless `later` holds a script for it: the second run plays `later[0]`, and so on,
 * as a follow-up resumes Claude Code for another turn (spec 013).
 */
export function fakeClaudeSdk(first: readonly FakeTurn[], ...later: (readonly FakeTurn[])[]): FakeClaudeSdk {
  const fake: FakeClaudeSdk = {
    runs: [],
    ignoreInterrupt: false,
    onResume: 'resumes',
    models: [],
    readRuns: [],
    reads: [],
    query: ({ prompt, options }) => {
      /** The calls waiting for `canUseTool`: Claude Code cancels them when it's interrupted. */
      const asking = new Set<AbortController>();
      const run: FakeRun = {
        options,
        prompts: [],
        messages: [],
        decisions: [],
        results: [],
        waiting: 0,
        cancelAsks: () => {
          for (const controller of asking) controller.abort();
        },
        interrupts: 0,
        closes: 0,
      };
      const reading = options.systemPrompt === readingInstructions;
      if (reading) fake.readRuns.push(run);
      else fake.runs.push(run);
      const script: readonly FakeTurn[] = reading
        ? [{ finish: fake.reads.shift() ?? '' }]
        : fake.runs.length === 1
          ? first
          : (later[fake.runs.length - 2] ?? first);
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

      /** Messages that came after the first, not yet taken by a turn, and the ids the current turn took. */
      const queued: { uuid: string | undefined }[] = [];
      let taken: string[] = [];
      let heard: () => void = () => undefined;
      let inputEnded: () => void = () => undefined;
      const inputEnd = new Promise<void>((resolve) => {
        inputEnded = resolve;
      });
      function hear(message: SDKUserMessage) {
        const text = textOf(message);
        run.prompts.push(text);
        run.messages.push({ text, uuid: message.uuid, priority: message.priority });
      }
      /** Claude Code folds the queued messages into the turn between tool calls. */
      function fold() {
        for (const message of queued.splice(0)) if (message.uuid !== undefined) taken.push(message.uuid);
      }

      async function decide(call: FakeToolCall, id: string): Promise<PermissionResult> {
        const ask = options.canUseTool;
        if (!ask) return { behavior: 'allow' };
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
          return result;
        } finally {
          run.waiting -= 1;
          asking.delete(controller);
        }
      }

      /** Claude Code's own MCP client for each in-process server, connected at the first call. */
      const clients = new Map<string, Client>();
      async function callMcp(call: FakeToolCall): Promise<{ text: string; isError: boolean } | null> {
        const [, server = '', name = ''] = /^mcp__([^_]+)__(.+)$/.exec(call.tool) ?? [];
        if (server === '') return null;
        const config = options.mcpServers?.[server];
        if (config?.type !== 'sdk' || !('instance' in config))
          return { text: `No MCP server ${server}.`, isError: true };
        let client = clients.get(server);
        if (client === undefined) {
          const [ours, theirs] = InMemoryTransport.createLinkedPair();
          await config.instance.connect(theirs);
          client = new Client({ name: 'fake-claude-code', version: '0.0.0' });
          await client.connect(ours);
          clients.set(server, client);
        }
        const result = await client.callTool({ name, arguments: call.input });
        const content = Array.isArray(result.content) ? (result.content as { text?: unknown }[]) : [];
        const answer = {
          text: content.map((block) => (typeof block.text === 'string' ? block.text : '')).join(''),
          isError: result.isError === true,
        };
        run.results.push({ tool: call.tool, ...answer });
        return answer;
      }

      /** Claude's message with its calls, which Claude Code streams before it asks about them. */
      function useMessage(calls: readonly FakeToolCall[], ids: readonly string[]): SDKMessage {
        const content = calls.map((call, i) => ({ type: 'tool_use', id: ids[i], name: call.tool, input: call.input }));
        return {
          type: 'assistant',
          parent_tool_use_id: null,
          ...sessionFields,
          message: { role: 'assistant', content },
        } as unknown as SDKMessage;
      }

      function resultMessage(
        call: FakeToolCall,
        id: string,
        result: PermissionResult,
        mcp: { text: string; isError: boolean } | null = null,
      ): SDKMessage {
        return {
          type: 'user',
          parent_tool_use_id: null,
          ...sessionFields,
          message: {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: id,
                content: result.behavior === 'allow' ? (mcp?.text ?? call.output ?? 'ok') : result.message,
                is_error: result.behavior !== 'allow' || call.fails === true || mcp?.isError === true,
              },
            ],
          },
        } as unknown as SDKMessage;
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
        if (first.done !== true) {
          hear(first.value);
          if (first.value.uuid !== undefined) taken.push(first.value.uuid);
        }
        if (options.resume !== undefined && fake.onResume === 'no_conversation') {
          throw new Error(`No conversation found with session ID: ${options.resume}`);
        }
        const afresh = options.resume !== undefined && fake.onResume === 'starts_afresh';
        void (async () => {
          for (;;) {
            const next = await input.next();
            if (next.done === true) break;
            hear(next.value);
            queued.push({ uuid: next.value.uuid });
            heard();
          }
          inputEnded();
        })();
        yield {
          type: 'system',
          subtype: 'init',
          ...sessionFields,
          ...(afresh ? { session_id: freshSessionId } : {}),
          cwd: options.cwd,
          tools: Array.isArray(options.tools) ? options.tools : [],
          mcp_servers: Object.keys(options.mcpServers ?? {}).map((name) => ({ name, status: 'connected' })),
          plugins: [],
        } as unknown as SDKMessage;

        for (const turn of script) {
          if ('tool' in turn || 'together' in turn) {
            const calls = 'together' in turn ? turn.together : [turn];
            const ids = calls.map(() => {
              n += 1;
              return `toolu_${String(n)}`;
            });
            yield useMessage(calls, ids);
            const answers = await Promise.all(calls.map((call, i) => decide(call, ids[i] ?? '')));
            const runsOn = (call: FakeToolCall, i: number) => call.hangs === true && answers[i]?.behavior === 'allow';
            for (const [i, call] of calls.entries()) {
              const answer = answers[i];
              if (answer === undefined || runsOn(call, i)) continue;
              const mcp = answer.behavior === 'allow' ? await callMcp(call) : null;
              yield resultMessage(call, ids[i] ?? '', answer, mcp);
            }
            if (calls.some(runsOn)) {
              await interrupted;
              yield interruptedResult;
              break;
            }
            if (wasInterrupted) {
              yield interruptedResult;
              break;
            }
            fold();
          } else if ('finish' in turn) {
            yield {
              type: 'result',
              subtype: 'success',
              is_error: false,
              result: turn.finish,
              num_turns: n,
              user_message_uuids: taken,
              queued_turn_count: queued.length,
              ...sessionFields,
            } as unknown as SDKMessage;
            // A message still queued starts the next turn, which takes it.
            taken = [];
            fold();
          } else if ('waitForMessage' in turn) {
            if (queued.length === 0) {
              await new Promise<void>((resolve) => {
                heard = resolve;
              });
            }
          } else if ('gate' in turn) {
            await turn.gate;
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
        await inputEnd;
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
        supportedModels() {
          if (fake.models === 'fails') return Promise.reject(new Error('Claude Code exited'));
          if (fake.models === 'hangs') return new Promise<ModelInfo[]>(() => undefined);
          return Promise.resolve(fake.models);
        },
      };
    },
  };
  return fake;
}
