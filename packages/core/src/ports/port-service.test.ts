import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPortService } from './port-service.ts';

vi.setConfig({ testTimeout: 20_000 });

const children: ChildProcess[] = [];
const folders: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  for (const child of children.splice(0)) child.kill('SIGKILL');
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

async function folder(): Promise<string> {
  const made = await realpath(await mkdtemp(join(tmpdir(), 'orynx-ports-')));
  folders.push(made);
  return made;
}

/** A server like `next dev`: a program that listens on a port the OS picks, and says which. */
async function listening(cwd: string, through?: 'shell'): Promise<{ port: number; child: ChildProcess }> {
  const script = `const s = require('net').createServer().listen(0, () => console.log(s.address().port))`;
  const child =
    through === 'shell'
      ? spawn('/bin/sh', ['-c', `node -e "${script}"; true`], { cwd })
      : spawn(process.execPath, ['-e', script], { cwd });
  children.push(child);
  const port = await new Promise<number>((resolve, reject) => {
    child.stdout.once('data', (data: Buffer) => {
      resolve(Number(String(data).trim()));
    });
    child.once('exit', () => {
      reject(new Error('the server ended'));
    });
  });
  return { port, child };
}

describe('the session’s ports (spec 042)', () => {
  it('AC-6: finds a server running from inside the worktree, however it was started', async () => {
    const worktree = await folder();
    const { port, child } = await listening(worktree);
    const ports = createPortService({ probe: () => Promise.resolve(null) });
    const found = await ports.list({ worktree, shells: [] });
    expect(found).toContainEqual(
      expect.objectContaining({
        port,
        pid: child.pid,
        program: 'node',
        startedBy: 'found',
        restartable: false,
        url: null,
      }),
    );
  });

  it('AC-2, AC-7: finds a server under one of the session’s Terminal tabs, and never one that isn’t the session’s', async () => {
    const worktree = await folder();
    const elsewhere = await folder();
    const tab = await listening(elsewhere, 'shell');
    const other = await listening(elsewhere);
    const ports = createPortService({ probe: () => Promise.resolve(null) });
    const shells = [{ pid: tab.child.pid ?? 0, server: 'node -e server' }];
    const found = (await ports.list({ worktree, shells })) ?? [];
    expect(found.map((one) => one.port)).toEqual([tab.port]);
    expect(found[0]).toMatchObject({ startedBy: 'claude', restartable: true });
    expect((await ports.list({ worktree, shells: [{ pid: tab.child.pid ?? 0, server: null }] }))?.[0]).toMatchObject({
      startedBy: 'you',
      restartable: false,
    });
    expect(found.map((one) => one.port)).not.toContain(other.port);
  });

  it('AC-10, AC-11: names a database, and links a web server by what answered', async () => {
    const worktree = await folder();
    const web = await listening(worktree);
    const ports = createPortService({
      probe: (port) => Promise.resolve(port === web.port ? 'https' : null),
      names: { [web.port]: 'Something' },
    });
    expect((await ports.list({ worktree, shells: [] }))?.find((one) => one.port === web.port)).toMatchObject({
      url: `https://localhost:${String(web.port)}`,
      name: 'Something',
    });
  });

  it('AC-11: the real probe tells an http server from nothing', async () => {
    const worktree = await folder();
    const http = createServer((_request, response) => response.end('ok'));
    servers.push(http);
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const address = http.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const quiet = await listening(worktree);
    const { probe } = createPortService({});
    expect(await probe(port)).toBe('http');
    expect(await probe(quiet.port)).toBeNull();
  });

  it('AC-8: a worktree nothing runs from has no ports', async () => {
    const ports = createPortService({ probe: () => Promise.resolve(null) });
    expect(await ports.list({ worktree: await folder(), shells: [] })).toEqual([]);
  });

  it('AC-9: says it couldn’t read the ports when lsof isn’t there', async () => {
    const ports = createPortService({ run: () => Promise.reject(new Error('lsof: not found')) });
    expect(await ports.list({ worktree: await folder(), shells: [] })).toBeNull();
  });
});

describe('stopping a session’s server (spec 042)', () => {
  const alive = (pid: number | undefined) => {
    try {
      process.kill(pid ?? 0, 0);
      return true;
    } catch {
      return false;
    }
  };

  it('AC-4: stops what listens on the port, and a second stop finds it gone', async () => {
    const worktree = await folder();
    const { port, child } = await listening(worktree);
    const ports = createPortService({ probe: () => Promise.resolve(null) });
    expect(await ports.stop({ worktree, shells: [] }, port)).toBe('done');
    expect(alive(child.pid)).toBe(false);
    expect(await ports.stop({ worktree, shells: [] }, port)).toBe('gone');
  });

  it('AC-4: one that ignores SIGTERM is killed after the wait', async () => {
    const worktree = await folder();
    const script =
      "process.on('SIGTERM', () => {}); const s = require('net').createServer().listen(0, () => console.log(s.address().port))";
    const child = spawn(process.execPath, ['-e', script], { cwd: worktree });
    children.push(child);
    const port = await new Promise<number>((resolve) =>
      child.stdout.once('data', (data: Buffer) => {
        resolve(Number(String(data).trim()));
      }),
    );
    const ports = createPortService({ probe: () => Promise.resolve(null), stopGraceMs: 300 });
    expect(await ports.stop({ worktree, shells: [] }, port)).toBe('done');
    expect(alive(child.pid)).toBe(false);
  });

  it('AC-7: never stops a port that isn’t the session’s', async () => {
    const worktree = await folder();
    const other = await listening(await folder());
    const ports = createPortService({ probe: () => Promise.resolve(null) });
    expect(await ports.stop({ worktree, shells: [] }, other.port)).toBe('gone');
    expect(alive(other.child.pid)).toBe(true);
  });
});
