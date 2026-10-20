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
  shells: readonly { pid: number; server: string | null }[];
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
}

export interface PortService {
  /** The session's ports, lowest first; null when they couldn't be read. */
  list(places: SessionPlaces): Promise<SessionPort[] | null>;
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

  return {
    probe,
    async list({ worktree, shells }) {
      try {
        const listeners = listenersFrom(await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn']));
        if (listeners.length === 0) return [];
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
        return ports.filter((one) => one !== null).sort((a, b) => a.port - b.port);
      } catch {
        return null;
      }
    },
  };
}
