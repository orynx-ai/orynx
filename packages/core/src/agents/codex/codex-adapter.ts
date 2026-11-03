import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { AgentModelIdSchema, EffortLevelSchema, type AgentModel, type AgentModels } from '@devhub/contracts';
import { briefText } from '../../sessions/brief.ts';
import { askText, type AgentAdapter, type AgentAsk, type AgentEvent } from '../agent-adapter.ts';
import { decideToolUse, type ToolContext } from '../claude/tool-decision.ts';
import { startAppServer, type AppServer } from './app-server.ts';
import { createCodexReader, type CodexRead, type SeenCommand } from './items.ts';
import { codexCheckArgs, codexSessionArgs } from './launch.ts';
import { innerCommand, plainReadPaths } from './plain-read.ts';

/**
 * Codex behind the agent adapter (spec 052), through `codex app-server`: one program per session, in its worktree,
 * started with Orynx's overrides (`launch.ts`) so `~/.codex`'s settings decide nothing. Every MCP server Codex's own
 * config names is turned off for the thread, so Codex gets none; Orynx's own tools come as its dynamic tools.
 *
 * Codex asks Orynx before every command and edit (`untrusted`), and Orynx answers as it answers Claude: the same
 * decision, the same callout. A turn that ends is the session's end; a follow-up resumes the thread.
 */

export interface CodexAdapterOptions {
  /** The Codex `findCodex()` found; null when there's none, and then a session fails at once. */
  program: string | null;
  /** From `codexEnvironment()`. */
  env: Readonly<Record<string, string>>;
  /** What `~` means in a path Codex gives, and whose `.codex` and keychain the sandbox hides. */
  home: string;
  devhubHome: string;
  /** The temporary folder, which commands may write to. */
  temporary: string;
  platform: NodeJS.Platform;
  /** Whether Codex's sandbox can run here; without it a session gets no commands (spec 012, Q2b). */
  runsCommands: boolean;
  /** How long Stop waits after interrupting before it ends the program; 5 seconds. */
  stopGraceMs?: number;
  /** How long Codex may take to list its models; 15 seconds. */
  modelsTimeoutMs?: number;
  /** How long a list of models is kept before Codex is asked again; 10 minutes. */
  modelsMaxAgeMs?: number;
  /** The clock, in milliseconds. */
  now?: () => number;
}

const unavailable: AgentModels = { state: 'unavailable' };

/** Waits for `promise`, or `ms`, whichever comes first. */
async function within(promise: Promise<unknown>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(resolve, ms);
    }),
  ]);
  clearTimeout(timer);
}

/** How long Codex may take to answer a request a session waits on. */
const requestTimeoutMs = 30_000;

const ConfigReadSchema = z.looseObject({
  config: z.looseObject({ mcp_servers: z.record(z.string(), z.unknown()).nullish() }),
});
const ThreadAnswerSchema = z.looseObject({ thread: z.looseObject({ id: z.string().min(1) }) });
const TurnAnswerSchema = z.looseObject({ turn: z.looseObject({ id: z.string().min(1) }) });
const TurnStartedSchema = z.looseObject({ turn: z.looseObject({ id: z.string().min(1) }) });
const ModelListSchema = z.looseObject({
  data: z.array(
    z.looseObject({
      model: z.string(),
      displayName: z.string(),
      description: z.string(),
      hidden: z.boolean().default(false),
      supportedReasoningEfforts: z.array(z.looseObject({ reasoningEffort: z.unknown() })).default([]),
    }),
  ),
});

/** A model as Codex listed it, with the effort levels Orynx names; nothing when its id isn't safe to pass back. */
function agentModel(listed: z.infer<typeof ModelListSchema>['data'][number]): AgentModel[] {
  const value = AgentModelIdSchema.safeParse(listed.model);
  if (listed.hidden || !value.success) return [];
  const efforts = listed.supportedReasoningEfforts.flatMap(({ reasoningEffort }) => {
    const effort = EffortLevelSchema.safeParse(reasoningEffort);
    return effort.success ? [effort.data] : [];
  });
  return [
    {
      value: value.data,
      displayName: listed.displayName.trim() === '' ? value.data : listed.displayName,
      description: listed.description,
      efforts,
    },
  ];
}

const CommandApprovalSchema = z.looseObject({
  kind: z.string().default('command'),
  itemId: z.string(),
  command: z.string().nullish(),
  /** Codex's own words for an escalation, or a rule of yours that prompts. */
  reason: z.string().nullish(),
  additionalPermissions: z.unknown().nullish(),
});

const accept = { decision: 'accept' } as const;
const decline = { decision: 'decline' } as const;

/** Whether a plain read names only what Claude's Read would read without asking: the worktree, and the brief's files. */
async function readsInside(command: string, context: ToolContext): Promise<boolean> {
  const paths = plainReadPaths(command);
  if (paths === null) return false;
  for (const path of paths) {
    if ((await decideToolUse('Read', { file_path: path }, context)).behavior !== 'allow') return false;
  }
  return true;
}

/** How a waiting call ended: your answer, Stop, or Codex dropping it. */
type Outcome = 'allow' | 'deny' | 'stopped' | 'dropped';

interface Running {
  handlers: Set<(event: AgentEvent) => void>;
  /** Events nobody has heard yet; null once the first handler has them. */
  waiting: AgentEvent[] | null;
  server: AppServer | null;
  threadId: string | null;
  /** The turn under way, which Stop interrupts; null between turns. */
  turnId: string | null;
  /** Settles once `turn/start` has answered, or failed: Stop pressed before then waits for the turn to interrupt. */
  turnStarted: Promise<void>;
  /** Settles when the turn under way ends. */
  turnOver: Promise<void>;
  endTurn: () => void;
  ended: Promise<void>;
  done: boolean;
  stopping: boolean;
  /** A problem was said, or the run ended as it should: the program's end is no surprise. */
  settled: boolean;
  /** The calls waiting for an answer, by approval id: each ends with one outcome. */
  parked: Map<string, (outcome: Outcome) => void>;
  /** What Orynx made of each command it was asked about, by Codex's item id. */
  seen: Map<string, SeenCommand>;
  /**
   * The decision before this one: calls are decided one at a time, in the order Codex asked, so calls asked together
   * wait in that order whichever reads Settings faster.
   */
  deciding: Promise<unknown>;
}

export function createCodexAdapter({
  program,
  env,
  home,
  devhubHome,
  temporary,
  platform,
  runsCommands,
  stopGraceMs = 5_000,
  modelsTimeoutMs = 15_000,
  modelsMaxAgeMs = 10 * 60_000,
  now = Date.now,
}: CodexAdapterOptions): AgentAdapter {
  const sessions = new Map<string, Running>();
  /** The last list Codex gave, and when; a read under way is shared. */
  let listed: { at: number; models: AgentModels } | null = null;
  let listing: Promise<AgentModels> | null = null;

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
  function waitForAnswer(sessionId: string, running: Running, ask: AgentAsk): Promise<Outcome> {
    if (running.done || running.stopping) return Promise.resolve('stopped');
    const approvalId = randomUUID();
    const answer = new Promise<Outcome>((resolve) => {
      running.parked.set(approvalId, resolve);
    });
    emit(running, { type: 'approval', sessionId, approvalId, ask });
    return answer;
  }

  /**
   * A command Codex wants to run (spec 052, part C), decided as Claude's `Bash` is: its rows, its list, its callout.
   * A plain read inside the worktree runs as Claude's Read does. Every command stays in Codex's sandbox, so an allowed
   * network command runs there too; one Codex asks to run with more than the sandbox gives is the unsandboxed row's.
   */
  async function decideCommand(
    sessionId: string,
    running: Running,
    params: unknown,
    context: () => Promise<ToolContext>,
  ): Promise<unknown> {
    const asked = CommandApprovalSchema.safeParse(params);
    // Without a sandbox nothing runs (Q2b); writing to a running command's input is never asked about.
    if (!asked.success || !runsCommands || running.stopping || asked.data.kind !== 'command') return decline;
    const { itemId, command: given, reason, additionalPermissions } = asked.data;
    if (given == null || given === '') return decline;
    const command = innerCommand(given);
    const escalated = reason != null || additionalPermissions != null;
    const rows = await context();
    if (!escalated && (await readsInside(command, rows))) {
      running.seen.set(itemId, 'read');
      return accept;
    }
    running.seen.set(itemId, 'command');
    const input = {
      command,
      ...(escalated ? { dangerouslyDisableSandbox: true } : {}),
      ...(reason == null ? {} : { description: reason }),
    };
    const decision = await decideToolUse('Bash', input, rows);
    const runs = () => {
      emit(running, { type: 'work', sessionId, work: { kind: 'command', id: itemId, command } });
      return accept;
    };
    if (decision.behavior === 'allow') return runs();
    if (decision.behavior === 'deny') {
      if (decision.refusal !== null) {
        emit(running, { type: 'work', sessionId, work: { kind: 'refused', refusal: decision.refusal } });
      }
      return decline;
    }
    const { ask } = decision;
    const outcome = await waitForAnswer(sessionId, running, ask);
    if (outcome === 'allow') return runs();
    if (outcome === 'deny') {
      emit(running, { type: 'work', sessionId, work: { kind: 'denied', about: ask.kind, text: askText(ask) } });
    }
    return decline;
  }

  /** Codex's own requests to a session, decided one at a time in the order Codex asked. */
  function answer(
    sessionId: string,
    running: Running,
    method: string,
    params: unknown,
    context: () => Promise<ToolContext>,
  ): Promise<unknown> {
    const decide = (): Promise<unknown> => {
      if (method === 'item/commandExecution/requestApproval') return decideCommand(sessionId, running, params, context);
      if (method === 'item/fileChange/requestApproval') return Promise.resolve(decline);
      if (method === 'item/tool/call') {
        return Promise.resolve({
          contentItems: [{ type: 'inputText', text: 'Orynx has no such tool.' }],
          success: false,
        });
      }
      return Promise.reject(new Error(`Orynx takes no ${method}`));
    };
    const turn = running.deciding.then(decide);
    running.deciding = turn.catch(() => undefined);
    return turn;
  }

  async function listModels(): Promise<AgentModels> {
    if (program === null) return unavailable;
    const folder = await mkdtemp(join(tmpdir(), 'orynx-codex-models-'));
    let server: AppServer | null = null;
    try {
      server = await startAppServer({
        program,
        args: codexCheckArgs,
        cwd: folder,
        env,
        startTimeoutMs: modelsTimeoutMs,
      });
      const list = ModelListSchema.safeParse(
        await server.request('model/list', { includeHidden: false }, modelsTimeoutMs),
      );
      return list.success ? { state: 'ready', models: list.data.data.flatMap(agentModel) } : unavailable;
    } catch {
      // Codex couldn't start or say: its words can hold anything, so only the fact is kept.
      return unavailable;
    } finally {
      await server?.close(1_000);
      await rm(folder, { recursive: true, force: true });
    }
  }

  return {
    id: 'codex',
    runsCommands,

    models() {
      if (listed !== null && now() - listed.at < modelsMaxAgeMs) return Promise.resolve(listed.models);
      listing ??= listModels()
        .then((models) => {
          // Only a list is kept: after a failure, the next picker asks again.
          if (models.state === 'ready') listed = { at: now(), models };
          return models;
        })
        .finally(() => {
          listing = null;
        });
      return listing;
    },

    write() {
      return Promise.resolve({ ok: false, problem: 'other' });
    },

    startSession(brief, worktree, permissions, instructions, { resume, model, effort } = {}) {
      const id = randomUUID();
      let endTurn: () => void = () => undefined;
      let turnStarted: () => void = () => undefined;
      const running: Running = {
        handlers: new Set(),
        waiting: [],
        server: null,
        threadId: null,
        turnId: null,
        turnStarted: new Promise((resolve) => {
          turnStarted = resolve;
        }),
        turnOver: new Promise((resolve) => {
          endTurn = resolve;
        }),
        endTurn: () => {
          endTurn();
        },
        ended: Promise.resolve(),
        done: false,
        stopping: false,
        settled: false,
        parked: new Map(),
        seen: new Map(),
        deciding: Promise.resolve(),
      };
      sessions.set(id, running);
      /** The rows, the list and the session's branch, read again for every call (spec 012, AC-11). */
      const context = async (): Promise<ToolContext> => ({ worktree, home, ...(await permissions()) });

      const problem = (code: string) => {
        if (running.settled) return;
        running.settled = true;
        emit(running, { type: 'problem', sessionId: id, kind: 'other', code });
      };

      function heard(said: CodexRead, server: AppServer) {
        if (said.type === 'work') emit(running, { type: 'work', sessionId: id, work: said.work });
        else if (said.type === 'files_changed') emit(running, { type: 'files_changed', sessionId: id });
        else if (said.type === 'command_ended') emit(running, { ...said, sessionId: id });
        else {
          running.turnId = null;
          running.endTurn();
          emit(running, { type: 'usage', sessionId: id, turns: 1, costUsd: null });
          if (said.status === 'completed') {
            emit(running, { type: 'work', sessionId: id, work: { kind: 'finished', summary: said.summary } });
          } else if (said.problem !== null && !running.stopping && !running.settled) {
            emit(running, { type: 'problem', sessionId: id, ...said.problem });
          }
          // Codex's turn is the run: once it's over, so is the program.
          running.settled = true;
          void server.close(stopGraceMs);
        }
      }

      async function run(): Promise<void> {
        if (program === null) {
          problem('no_codex');
          return;
        }
        const { readOnly } = await permissions();
        const places = { platform, worktree, devhubHome, home, temporary, readOnly: readOnly === true };
        let server: AppServer;
        try {
          server = await startAppServer({ program, args: codexSessionArgs(places), cwd: worktree, env });
        } catch {
          problem('exited');
          return;
        }
        running.server = server;
        server.onRequest((method, params) => answer(id, running, method, params, context));
        const read = createCodexReader({ worktree, seen: (itemId) => running.seen.get(itemId) ?? null });
        server.onNotification((method, params) => {
          if (method === 'turn/started') {
            const turn = TurnStartedSchema.safeParse(params);
            if (turn.success) running.turnId = turn.data.turn.id;
          }
          for (const said of read(method, params)) heard(said, server);
        });

        try {
          const config = ConfigReadSchema.safeParse(await server.request('config/read', {}, requestTimeoutMs));
          const servers = config.success ? Object.keys(config.data.config.mcp_servers ?? {}) : [];
          const thread = ThreadAnswerSchema.safeParse(
            await server.request(
              resume === undefined ? 'thread/start' : 'thread/resume',
              {
                ...(resume === undefined ? {} : { threadId: resume }),
                cwd: worktree,
                ...(model === undefined ? {} : { model }),
                developerInstructions: instructions,
                // The same as the launch's overrides, so no profile of Codex's can change them for this thread.
                approvalPolicy: 'untrusted',
                approvalsReviewer: 'user',
                config: Object.fromEntries(servers.map((name) => [`mcp_servers.${name}.enabled`, false])),
              },
              requestTimeoutMs,
            ),
          );
          if (!thread.success) throw new Error('unreadable thread');
          const threadId = thread.data.thread.id;
          running.threadId = threadId;
          emit(running, {
            type: 'started',
            sessionId: id,
            agentSessionId: threadId,
            loaded: { tools: 0, mcpServers: 0, plugins: 0 },
          });
          if (!runsCommands) emit(running, { type: 'work', sessionId: id, work: { kind: 'no_commands' } });
          const turn = TurnAnswerSchema.safeParse(
            await server.request(
              'turn/start',
              {
                threadId,
                input: [{ type: 'text', text: briefText(brief) }],
                ...(model === undefined ? {} : { model }),
                ...(effort === undefined ? {} : { effort }),
              },
              requestTimeoutMs,
            ),
          );
          // A turn that has already ended said so first.
          if (turn.success && !running.settled) running.turnId = turn.data.turn.id;
        } catch {
          if (!running.stopping) problem(running.threadId === null ? 'thread_start' : 'turn_start');
          void server.close(stopGraceMs);
        } finally {
          turnStarted();
        }
        await server.ended;
        // The program ended with no turn over: it died.
        if (!running.stopping) problem('exited');
      }

      running.ended = run()
        .catch(() => {
          problem('exited');
        })
        .finally(() => {
          turnStarted();
          // Codex is gone, so nobody waits for these answers any more.
          for (const approvalId of [...running.parked.keys()]) settle(id, running, approvalId, 'dropped');
          running.done = true;
          running.endTurn();
          emit(running, { type: 'ended', sessionId: id });
        });
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

    sendMessage() {
      return Promise.resolve(false);
    },

    async stop(sessionId) {
      const running = sessions.get(sessionId);
      if (running === undefined || running.done) return;
      running.stopping = true;
      // A call waiting for you would hold Codex's turn open: deny it before interrupting.
      for (const approvalId of [...running.parked.keys()]) settle(sessionId, running, approvalId, 'stopped');
      await within(running.turnStarted, stopGraceMs);
      const { server, threadId, turnId } = running;
      if (server !== null && threadId !== null && turnId !== null) {
        await server.request('turn/interrupt', { threadId, turnId }, stopGraceMs).catch(() => undefined);
        await within(running.turnOver, stopGraceMs);
      }
      await server?.close(stopGraceMs);
      await running.ended;
    },
  };
}
