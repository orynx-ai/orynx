import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { otherHub, waitForHub } from './hub.ts';

let home: string;
let servers: Server[];

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'devhub-desktop-hub-'));
  servers = [];
});

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise((done) => server.close(done))));
  await rm(home, { recursive: true, force: true });
});

/** A stand-in for a hub: anything that answers HTTP on 127.0.0.1, as the real one answers GET /. */
async function listening(status = 200): Promise<number> {
  const server = createServer((_request, response) => response.writeHead(status).end());
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return (server.address() as AddressInfo).port;
}

async function writeRuntime(info: { port: number; pid: number }): Promise<void> {
  await writeFile(join(home, 'runtime.json'), JSON.stringify({ ...info, token: 'tok' }));
}

/** The pid of a process that has already ended. */
async function endedPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', '']);
  await new Promise((done) => child.on('exit', done));
  if (child.pid === undefined) throw new Error('no pid');
  return child.pid;
}

describe('otherHub', () => {
  it('AC-8: finds another Orynx on this home, such as pnpm start, by its live pid and its answering port', async () => {
    const port = await listening();
    await writeRuntime({ port, pid: process.pid });

    expect(await otherHub(home)).toEqual({ port });
  });

  it('AC-8: counts pnpm dev, whose hub answers GET / with a 404', async () => {
    const port = await listening(404);
    await writeRuntime({ port, pid: process.pid });

    expect(await otherHub(home)).toEqual({ port });
  });

  it("AC-8: ignores a runtime.json left by an Orynx that ended, and one whose port doesn't answer", async () => {
    await writeRuntime({ port: await listening(), pid: await endedPid() });
    expect(await otherHub(home)).toBeNull();

    const closed = await listening();
    await new Promise((done) => servers.pop()?.close(done));
    await writeRuntime({ port: closed, pid: process.pid });
    expect(await otherHub(home)).toBeNull();
  });

  it('finds nothing with no runtime.json, or one it cannot read', async () => {
    expect(await otherHub(home)).toBeNull();

    await writeFile(join(home, 'runtime.json'), '{ "port": ');
    expect(await otherHub(home)).toBeNull();
  });
});

describe('waitForHub', () => {
  it("AC-6: gives this hub's port once runtime.json names its pid and the port answers", async () => {
    const port = await listening();
    const pid = await endedPid();
    await writeRuntime({ port: 1, pid: process.pid });
    setTimeout(() => void writeRuntime({ port, pid }), 300);

    expect(await waitForHub({ home, pid, intervalMs: 50 })).toBe(port);
  });

  it("AC-6: gives up when the hub hasn't answered in time", async () => {
    await expect(waitForHub({ home, pid: 123, timeoutMs: 300, intervalMs: 50 })).rejects.toThrow(
      /didn't answer in 0.3 seconds/,
    );
  });

  it('AC-9: stops waiting as soon as the hub process exits', async () => {
    const stopped = new AbortController();
    const started = Date.now();
    setTimeout(() => {
      stopped.abort();
    }, 100);

    await expect(waitForHub({ home, pid: 123, signal: stopped.signal, intervalMs: 50 })).rejects.toThrow(/stopped/);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
