import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { ErrorAnswerSchema, NotificationSchema, ResultAnswerSchema, ServerRequestSchema } from './protocol.ts';

/**
 * One `codex app-server` (spec 052): the only place Orynx runs Codex for a session or a check. It speaks Codex's
 * JSON-RPC over the program's stdio, one message per line, and starts with `initialize`, opting into the experimental
 * API that Orynx's own tools need (`dynamicTools`). Codex's stderr is never read: it can hold paths and prompts.
 */

export interface AppServerOptions {
  program: string;
  args: readonly string[];
  /** Where Codex runs: the session's worktree, or a folder of Orynx's own. */
  cwd: string;
  /** The whole environment: nothing else of Orynx's reaches Codex. */
  env: Readonly<Record<string, string>>;
  /** How long `initialize` may take; 15 seconds. */
  startTimeoutMs?: number;
}

export interface AppServer {
  /** Asks Codex, and gives its result; rejects with its error, when it ends, or after `timeoutMs` when one is given. */
  request(method: string, params: unknown, timeoutMs?: number): Promise<unknown>;
  notify(method: string, params?: unknown): void;
  onNotification(handler: (method: string, params: unknown) => void): void;
  /** Answers Codex's own requests (approvals, Orynx's tools); a handler that throws answers an error. */
  onRequest(handler: (method: string, params: unknown) => Promise<unknown>): void;
  /** Settles once the program has ended, however it ended. */
  readonly ended: Promise<void>;
  /** Ends Codex's input and asks the program to stop, then kills it after `graceMs` (5 seconds). */
  close(graceMs?: number): Promise<void>;
}

/** Codex answered a request with an error. */
export class AppServerError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'AppServerError';
    this.code = code;
  }
}

/** JSON-RPC's own code for a failure inside the one answering. */
const internalError = -32603;

export async function startAppServer({
  program,
  args,
  cwd,
  env,
  startTimeoutMs = 15_000,
}: AppServerOptions): Promise<AppServer> {
  const child = spawn(program, args, { cwd, env, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  const pending = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void }>();
  let notificationHandler: (method: string, params: unknown) => void = () => undefined;
  let requestHandler: (method: string, params: unknown) => Promise<unknown> = () =>
    Promise.reject(new Error('Orynx takes no requests here'));
  let nextId = 1;
  let over = false;

  const ended = new Promise<void>((resolve) => {
    const end = () => {
      if (over) return;
      over = true;
      for (const waiting of pending.values()) waiting.reject(new Error('Codex ended'));
      pending.clear();
      resolve();
    };
    child.on('exit', end);
    child.on('error', end);
  });

  function send(message: Record<string, unknown>): void {
    if (over || child.stdin.destroyed) return;
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }
  // A write after the program has gone fails here, not as an unhandled error.
  child.stdin.on('error', () => undefined);

  createInterface({ input: child.stdout }).on('line', (line) => {
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      return;
    }
    const asked = ServerRequestSchema.safeParse(json);
    if (asked.success) {
      const { id, method, params } = asked.data;
      requestHandler(method, params).then(
        (result) => {
          send({ id, result });
        },
        (error: unknown) => {
          send({ id, error: { code: internalError, message: error instanceof Error ? error.message : 'Failed' } });
        },
      );
      return;
    }
    const notified = NotificationSchema.safeParse(json);
    if (notified.success) {
      notificationHandler(notified.data.method, notified.data.params);
      return;
    }
    // Orynx's own ids are numbers, so an answer with any other id isn't to Orynx.
    const failed = ErrorAnswerSchema.safeParse(json);
    const answered = ResultAnswerSchema.safeParse(json);
    const id = failed.success ? failed.data.id : answered.success ? answered.data.id : null;
    const waiting = typeof id === 'number' ? pending.get(id) : undefined;
    if (waiting === undefined || typeof id !== 'number') return;
    pending.delete(id);
    if (failed.success) waiting.reject(new AppServerError(failed.data.error.code, failed.data.error.message));
    else waiting.resolve(answered.data?.result);
  });

  function request(method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
    if (over) return Promise.reject(new Error('Codex ended'));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer =
        timeoutMs === undefined
          ? undefined
          : setTimeout(() => {
              pending.delete(id);
              reject(new Error(`Codex did not answer ${method} in time`));
            }, timeoutMs);
      const settle =
        <T>(then: (value: T) => void) =>
        (value: T) => {
          clearTimeout(timer);
          then(value);
        };
      pending.set(id, { resolve: settle(resolve), reject: settle(reject) });
      send({ id, method, params });
    });
  }

  const server: AppServer = {
    request,
    notify(method, params) {
      send(params === undefined ? { method } : { method, params });
    },
    onNotification(handler) {
      notificationHandler = handler;
    },
    onRequest(handler) {
      requestHandler = handler;
    },
    ended,
    async close(graceMs = 5_000) {
      if (over) return;
      child.stdin.end();
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), graceMs);
      await ended;
      clearTimeout(timer);
    },
  };

  try {
    await request(
      'initialize',
      { clientInfo: { name: 'orynx', title: 'Orynx', version: '1' }, capabilities: { experimentalApi: true } },
      startTimeoutMs,
    );
  } catch (error) {
    child.kill('SIGKILL');
    throw error;
  }
  server.notify('initialized');
  return server;
}
