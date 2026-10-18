import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, tokenHeader, type ServerEvent } from '@devhub/contracts';
import { createServer } from '../../create-server.ts';
import { createEventBus } from '../../events/event-bus.ts';
import type { Keychain } from '../../secrets/keychain.ts';
import { createFileSettingsStore } from '../../settings/settings-store.ts';
import { authStatus, claudeEmail, claudeOrganisation, useFakeClaudeFolder } from '../../test/fake-claude.ts';
import { createClaudeCode } from './claude-code.ts';

const fakeClaudeFolder = useFakeClaudeFolder();
const sessionToken = 'leaks-session-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: sessionToken };
const stderr = 'fake-claude-stderr-for-leaks';
const unreadable = 'fake-claude-output-for-leaks';
// Everything the fake prints that DevHub must keep to itself, from the account to its folders.
const secrets = [claudeEmail, claudeOrganisation, '00000000-0000-4000-8000-000000000000', '/Users/you/.claude', stderr];

let app: FastifyInstance | undefined;
let home: string | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
  if (home !== undefined) await rm(home, { recursive: true, force: true });
  home = undefined;
});

describe.skipIf(process.platform === 'win32')("Claude Code's login stays out of the log and the event stream", () => {
  it('AC-6, AC-11: signed in, signed out and failing, the log names only the problem and nothing is saved', async () => {
    home = await mkdtemp(join(tmpdir(), 'devhub-claude-leaks-'));
    const folder = await fakeClaudeFolder();
    const log: string[] = [];
    const bus = createEventBus();
    const events: ServerEvent[] = [];
    bus.subscribe((event) => events.push(event));
    // The keychain is an outside service: this one writes down every change anyone asks of it.
    const keychainChanges: string[] = [];
    const keychain: Keychain = {
      get: () => Promise.resolve(null),
      set: (account) => {
        keychainChanges.push(`set ${account}`);
        return Promise.resolve();
      },
      delete: (account) => {
        keychainChanges.push(`delete ${account}`);
        return Promise.resolve();
      },
    };
    app = await createServer({
      token: sessionToken,
      port,
      version: 'test',
      events: bus,
      userName: () => Promise.resolve(null),
      keychain,
      settings: createFileSettingsStore(home),
      claudeCode: createClaudeCode({ program: folder.program, env: { PATH: '/usr/bin:/bin' }, timeoutMs: 300 }),
      logger: {
        level: 'trace',
        stream: new Writable({
          write(chunk: Buffer, _encoding, done) {
            log.push(chunk.toString());
            done();
          },
        }),
      },
    });
    const hub = app;
    const check = async () => {
      const response = await hub.inject({ method: 'POST', url: apiRoutes.claudeLoginCheck, headers });
      expect(response.statusCode).toBe(200);
    };

    await folder.install({ kind: 'signed_in' });
    await hub.inject({ method: 'GET', url: apiRoutes.status, headers });
    await hub.inject({ method: 'GET', url: apiRoutes.claudeLogin, headers });
    await folder.install({ kind: 'signed_out' });
    await check();
    await folder.install({ kind: 'crashes', exitCode: 3, stderr });
    await check();
    await folder.install({ kind: 'prints', stdout: authStatus({ loggedIn: unreadable }), exitCode: 0 });
    await check();
    await folder.install({ kind: 'slow' });
    await check();
    await rm(folder.program);
    await check();

    const problems = log
      .map((line) => JSON.parse(line) as { msg: string; claude?: unknown })
      .filter((line) => line.msg === "Claude Code's login check failed")
      .map((line) => line.claude);
    expect(problems).toEqual([
      { kind: 'failed', exitCode: 3 },
      { kind: 'unreadable' },
      { kind: 'timeout' },
      { kind: 'missing' },
    ]);
    const everything = [...log, JSON.stringify(events)].join('\n');
    expect(log.length).toBeGreaterThan(10);
    for (const secret of secrets) expect(everything).not.toContain(secret);
    expect(everything).not.toContain('for-leaks');
    expect(events.length).toBeGreaterThan(0);
    expect(new Set(events.map((event) => event.type))).toEqual(new Set(['status.changed']));
    expect(await readdir(home)).toEqual([]);
    expect(keychainChanges).toEqual([]);
  });
});
