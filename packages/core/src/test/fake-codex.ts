import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';

/**
 * A fake `codex` program (spec 052), run for real: `codex --version` prints the version the test set, and
 * `codex app-server` passes its stdio to a socket where the test plays Codex's side of the JSON-RPC. Each run is
 * written down with its arguments, folder and environment.
 */

export interface FakeCodexRun {
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

/** A JSON-RPC message as Codex's app-server sends and takes it: no `jsonrpc` field. */
export interface CodexMessage {
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

/** One running app-server, from Codex's side. */
export interface CodexPeer {
  /** The next message Orynx sends that isn't an answer to `ask()`. */
  read(): Promise<CodexMessage>;
  /** Reads until Orynx's request for `method`, failing on anything else first, and gives it. */
  expectRequest(method: string): Promise<{ id: number | string; params: unknown }>;
  reply(id: number | string, result: unknown): void;
  fail(id: number | string, code: number, message: string): void;
  notify(method: string, params?: unknown): void;
  /** Asks Orynx, as Codex's server requests do, and gives Orynx's answer. */
  ask(method: string, params: unknown): Promise<CodexMessage>;
  /** Sends a line exactly as given, for what Codex should never print. */
  raw(line: string): void;
  /** Ends the program, with this exit code. */
  exit(code?: number): void;
  /** Settles once Orynx closes the program's input or the program has ended. */
  closed: Promise<void>;
}

export interface FakeCodex {
  program: string;
  runs(): Promise<FakeCodexRun[]>;
  /** The next `codex app-server` Orynx starts. */
  next(): Promise<CodexPeer>;
  /** What `codex --version` prints from now on; `codex-cli 0.166.0` to start with. */
  printsVersion(text: string): Promise<void>;
  /** From now on, the program ignores SIGTERM, so only SIGKILL ends it. */
  ignoresStop(): Promise<void>;
}

function script(folder: string): string {
  return `#!${process.execPath}
const fs = require('node:fs');
const net = require('node:net');
const folder = ${JSON.stringify(folder)};
fs.appendFileSync(folder + '/runs.jsonl', JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), env: process.env }) + '\\n');
if (process.argv[2] === '--version') {
  process.stdout.write(fs.readFileSync(folder + '/version.txt', 'utf8'));
  process.exit(0);
}
// A stubborn program ignores SIGTERM and the end of its input alike, so only SIGKILL ends it.
const stubborn = fs.existsSync(folder + '/stubborn');
if (stubborn) process.on('SIGTERM', () => {});
const socket = net.connect(folder + '/codex.sock');
process.stdin.pipe(socket, { end: !stubborn });
socket.pipe(process.stdout);
let code = 0;
socket.on('data', () => {});
socket.on('close', () => {
  try { code = Number(fs.readFileSync(folder + '/exit-code.txt', 'utf8')); } catch {}
  process.exit(code);
});
`;
}

function peer(socket: Socket, folder: string): CodexPeer {
  const queue: CodexMessage[] = [];
  const waiting: ((message: CodexMessage) => void)[] = [];
  const answers = new Map<number | string, (message: CodexMessage) => void>();
  let buffered = '';
  let nextId = 1_000_000;
  socket.setEncoding('utf8');
  socket.on('data', (chunk: string) => {
    buffered += chunk;
    let end = buffered.indexOf('\n');
    while (end !== -1) {
      const line = buffered.slice(0, end);
      buffered = buffered.slice(end + 1);
      end = buffered.indexOf('\n');
      if (line.trim() === '') continue;
      const message = JSON.parse(line) as CodexMessage;
      const answered = message.method === undefined && message.id !== undefined ? answers.get(message.id) : undefined;
      if (answered !== undefined && message.id !== undefined) {
        answers.delete(message.id);
        answered(message);
      } else {
        const reader = waiting.shift();
        if (reader === undefined) queue.push(message);
        else reader(message);
      }
    }
  });
  const closed = new Promise<void>((resolve) => {
    socket.on('end', resolve);
    socket.on('close', () => {
      resolve();
    });
  });
  const send = (message: CodexMessage) => {
    socket.write(`${JSON.stringify(message)}\n`);
  };
  const read = () =>
    new Promise<CodexMessage>((resolve) => {
      const message = queue.shift();
      if (message === undefined) waiting.push(resolve);
      else resolve(message);
    });
  return {
    read,
    async expectRequest(method) {
      const message = await read();
      if (message.method !== method || message.id === undefined) {
        throw new Error(`Expected Orynx to ask ${method}, got ${JSON.stringify(message)}`);
      }
      return { id: message.id, params: message.params };
    },
    reply: (id, result) => {
      send({ id, result });
    },
    fail: (id, code, message) => {
      send({ id, error: { code, message } });
    },
    notify: (method, params) => {
      send(params === undefined ? { method } : { method, params });
    },
    ask: (method, params) =>
      new Promise<CodexMessage>((resolve) => {
        const id = nextId++;
        answers.set(id, resolve);
        send({ id, method, params });
      }),
    raw: (line) => {
      socket.write(`${line}\n`);
    },
    exit: (code = 0) => {
      void writeFile(join(folder, 'exit-code.txt'), String(code)).then(() => socket.destroy());
    },
    closed,
  };
}

/** A fake Codex for each test, removed after it. Not on Windows, where the program can't be a script. */
export function useFakeCodex(): () => Promise<FakeCodex> {
  const made: { folder: string; server: Server }[] = [];
  afterEach(async () => {
    for (const { folder, server } of made.splice(0)) {
      server.close();
      await rm(folder, { recursive: true, force: true });
    }
  });
  return async () => {
    const folder = await mkdtemp(join(tmpdir(), 'orynx-codex-'));
    const program = join(folder, 'codex');
    await writeFile(program, script(folder));
    await chmod(program, 0o755);
    await writeFile(join(folder, 'version.txt'), 'codex-cli 0.166.0\n');
    const peers: CodexPeer[] = [];
    const takers: ((peer: CodexPeer) => void)[] = [];
    const server = createServer((socket) => {
      const next = peer(socket, folder);
      const taker = takers.shift();
      if (taker === undefined) peers.push(next);
      else taker(next);
    });
    await new Promise<void>((resolve) => server.listen(join(folder, 'codex.sock'), resolve));
    made.push({ folder, server });
    return {
      program,
      async runs() {
        const text = await readFile(join(folder, 'runs.jsonl'), 'utf8').catch(() => '');
        return text
          .split('\n')
          .filter((line) => line !== '')
          .map((line) => JSON.parse(line) as FakeCodexRun);
      },
      next: () =>
        new Promise<CodexPeer>((resolve) => {
          const ready = peers.shift();
          if (ready === undefined) takers.push(resolve);
          else resolve(ready);
        }),
      printsVersion: (text) => writeFile(join(folder, 'version.txt'), text),
      ignoresStop: () => writeFile(join(folder, 'stubborn'), ''),
    };
  };
}
