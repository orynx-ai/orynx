import { execFile } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { basename, sep } from 'node:path';
import { promisify } from 'node:util';
import type { SessionPort } from '@devhub/contracts';
import { cwdsFrom, listenersFrom, processesFrom, type ProcessRow } from './listeners.ts';

/**
 * The Ports tab (spec 042, Q8): what listens from one session, and nothing else on the computer. A port is the
 * session's when its process runs under one of the session's Terminal tabs, or runs from inside its worktree. Read
 * with `lsof` and `ps`, which macOS and Linux have.
 */

const execute = promisify(execFile);

/** Where a session's processes come from: its worktree, and each Terminal tab's shell with the server Claude started there. */
export interface SessionPlaces {
  worktree: string;
  shells: readonly { pid: number; server: string | null; tabId?: string }[];
}

export type Scheme = 'http' | 'https';

export interface PortServiceOptions {
  /** Runs a program and gives what it wrote; the real one by default. */
  run?: (file: string, args: readonly string[]) => Promise<string>;
  /** Whether a port answers HTTPS or HTTP; the real one by default, once for each new server. */
  probe?: (port: number) => Promise<Scheme | null>;
  /** Names of well-known ports, for what isn't a web server. */
  names?: Readonly<Record<number, string>>;
  now?: () => number;
  /** How long Stop waits after SIGTERM before SIGKILL; 5 seconds, as a Terminal tab closes. */
  stopGraceMs?: number;
}

export interface PortService {
  /** The session's ports, lowest first; null when they couldn't be read. */
  list(places: SessionPlaces): Promise<SessionPort[] | null>;
  /**
   * Stops what listens on `port`, once it's checked as the session's again now: SIGTERM to it and its children, then
   * SIGKILL to what's left after the wait. `gone` when nothing of the session's listens there.
   */
  stop(places: SessionPlaces, port: number): Promise<'done' | 'gone'>;
  probe: (port: number) => Promise<Scheme | null>;
}

const knownNames: Record<number, string> = {
  3306: 'MySQL',
  5432: 'PostgreSQL',
  5672: 'RabbitMQ',
  6379: 'Redis',
  9200: 'Elasticsearch',
  11211: 'Memcached',
  27017: 'MongoDB',
};

async function runFile(file: string, args: readonly string[]): Promise<string> {
  try {
    return (await execute(file, args, { timeout: 5_000, maxBuffer: 8 * 1024 * 1024 })).stdout;
  } catch (error) {
    // lsof exits 1 when it finds nothing; what it wrote still counts.
    const said = (error as { stdout?: unknown }).stdout;
    if (typeof said === 'string' && (error as { code?: unknown }).code === 1) return said;
    throw error;
  }
}

/** Whether a local port answers HTTPS, else HTTP, within a second each; a dev server's own certificate is fine. */
async function probeScheme(port: number): Promise<Scheme | null> {
  const answers = (scheme: Scheme) =>
    new Promise<boolean>((resolve) => {
      const send = scheme === 'https' ? httpsRequest : httpRequest;
      const asking = send(
        { host: 'localhost', port, method: 'HEAD', path: '/', timeout: 1_000, rejectUnauthorized: false },
        (response) => {
          response.resume();
          resolve(true);
        },
      );
      asking.on('timeout', () => asking.destroy());
      asking.on('error', () => {
        resolve(false);
      });
      asking.end();
    });
  if (await answers('https')) return 'https';
  return (await answers('http')) ? 'http' : null;
}

export function createPortService(options: PortServiceOptions): PortService {
  const run = options.run ?? runFile;
  const probe = options.probe ?? probeScheme;
  const names = options.names ?? knownNames;
  const now = options.now ?? Date.now;
  /** What each server answered, by process and port, so each is probed once. */
  const schemes = new Map<string, Scheme | null>();

  /** The shell a process runs under, if it's one of these. */
  function shellOf(pid: number, parents: Map<number, ProcessRow>, shells: SessionPlaces['shells']) {
    let at = parents.get(pid);
    for (let hops = 0; at !== undefined && hops < 64; hops++) {
      const here = at.pid;
      const shell = shells.find((one) => one.pid === here);
      if (shell !== undefined) return shell;
      at = parents.get(at.ppid);
    }
    return null;
  }

  const stopGraceMs = options.stopGraceMs ?? 5_000;

  function exists(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  function signal(pids: readonly number[], name: NodeJS.Signals) {
    for (const pid of pids) {
      try {
        process.kill(pid, name);
      } catch {
        // Gone already.
      }
    }
  }

  async function read(
    places: SessionPlaces,
  ): Promise<{ ports: SessionPort[]; parents: Map<number, ProcessRow> } | null> {
    const { worktree, shells } = places;
    {
      try {
        const listeners = listenersFrom(await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn']));
        if (listeners.length === 0) return { ports: [], parents: new Map() };
        const pids = [...new Set(listeners.map((one) => one.pid))];
        const [cwdText, psText] = await Promise.all([
          run('lsof', ['-a', '-d', 'cwd', '-Fpn', '-p', pids.join(',')]),
          run('ps', ['-A', '-o', 'pid=,ppid=,etime=,command=']),
        ]);
        const cwds = cwdsFrom(cwdText);
        const parents = new Map(processesFrom(psText).map((row) => [row.pid, row]));
        const inside = (path: string | undefined) =>
          path !== undefined && (path === worktree || path.startsWith(worktree + sep));
        const ports = await Promise.all(
          listeners.map(async ({ pid, port }): Promise<SessionPort | null> => {
            const shell = shellOf(pid, parents, shells);
            if (shell === null && !inside(cwds.get(pid))) return null;
            const row = parents.get(pid);
            const key = `${String(pid)}:${String(port)}`;
            if (!schemes.has(key)) schemes.set(key, await probe(port));
            const scheme = schemes.get(key) ?? null;
            return {
              port,
              pid,
              program: basename(row?.command.split(' ')[0] ?? '') || 'unknown',
              command: row?.command ?? 'unknown',
              name: names[port] ?? null,
              url: scheme === null ? null : `${scheme}://localhost:${String(port)}`,
              startedBy: shell === null ? 'found' : shell.server === null ? 'you' : 'claude',
              since: new Date(now() - (row?.seconds ?? 0) * 1000).toISOString(),
              restartable: shell?.server != null,
            };
          }),
        );
        return { ports: ports.filter((one) => one !== null).sort((a, b) => a.port - b.port), parents };
      } catch {
        return null;
      }
    }
  }

  return {
    probe,
    async list(places) {
      return (await read(places))?.ports ?? null;
    },
    async stop(places, port) {
      const found = await read(places);
      const listening = found?.ports.find((one) => one.port === port);
      if (found === null || listening === undefined) return 'gone';
      // It and everything it started, children first, so a parent can't start one again.
      const tree = [listening.pid];
      // The loop reaches the children it adds, so it walks the whole tree.
      for (const pid of tree) {
        for (const row of found.parents.values()) if (row.ppid === pid) tree.push(row.pid);
      }
      const order = tree.toReversed();
      signal(order, 'SIGTERM');
      const until = now() + stopGraceMs;
      while (order.some(exists) && now() < until) await new Promise((resolve) => setTimeout(resolve, 50));
      signal(order.filter(exists), 'SIGKILL');
      // A killed process is listed until it's reaped: give that a moment, so Stop answers once it's gone.
      while (order.some(exists) && now() < until + 1_000) await new Promise((resolve) => setTimeout(resolve, 50));
      return 'done';
    },
  };
}
