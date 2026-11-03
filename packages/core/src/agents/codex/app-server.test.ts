import { realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { useFakeCodex, type CodexPeer } from '../../test/fake-codex.ts';
import { AppServerError, startAppServer, type AppServer } from './app-server.ts';

const fakeCodex = useFakeCodex();
/** The shell's own variables a test passes in; tests never read process.env (CLAUDE.md rule 9). */
const env = { PATH: '/usr/bin:/bin', HOME: '/Users/you' };

/** Starts an app-server on the fake, answering its `initialize` as Codex does. */
async function started(args: readonly string[] = ['app-server']): Promise<{ server: AppServer; codex: CodexPeer }> {
  const fake = await fakeCodex();
  const starting = startAppServer({ program: fake.program, args, cwd: tmpdir(), env });
  const codex = await fake.next();
  const { id } = await codex.expectRequest('initialize');
  codex.reply(id, { userAgent: 'codex_cli_rs/0.166.0' });
  expect(await codex.read()).toEqual({ method: 'initialized' });
  return { server: await starting, codex };
}

describe.skipIf(process.platform === 'win32')('the Codex app-server connection (spec 052)', () => {
  it('starts the program with exactly its arguments, in its folder, with only the environment given', async () => {
    const fake = await fakeCodex();
    const starting = startAppServer({ program: fake.program, args: ['app-server', '-c', 'x=1'], cwd: tmpdir(), env });
    const codex = await fake.next();
    const { id, params } = await codex.expectRequest('initialize');
    // Orynx opts into the experimental API, for its own tools (dynamicTools).
    expect(params).toEqual({
      clientInfo: { name: 'orynx', title: 'Orynx', version: '1' },
      capabilities: { experimentalApi: true },
    });
    codex.reply(id, {});
    await starting;

    const [run] = await fake.runs();
    expect(run?.args).toEqual(['app-server', '-c', 'x=1']);
    expect(run?.cwd).toBe(await realpath(tmpdir()));
    expect(Object.keys(run?.env ?? {}).filter((name) => name !== '__CF_USER_TEXT_ENCODING')).toEqual(['PATH', 'HOME']);
  });

  it('gives each request its own answer, matched by id, in whatever order Codex answers', async () => {
    const { server, codex } = await started();
    const first = server.request('model/list', {});
    const second = server.request('account/read', { refreshToken: false });
    const one = await codex.expectRequest('model/list');
    const two = await codex.expectRequest('account/read');
    expect(two.params).toEqual({ refreshToken: false });
    codex.reply(two.id, { account: null });
    codex.reply(one.id, { data: [] });

    expect(await first).toEqual({ data: [] });
    expect(await second).toEqual({ account: null });
  });

  it("rejects a request Codex answers with an error, with Codex's code and message", async () => {
    const { server, codex } = await started();
    const asked = server.request('thread/resume', { threadId: 'gone' });
    const { id } = await codex.expectRequest('thread/resume');
    codex.fail(id, -32600, 'no rollout found for thread id gone');

    const error = await asked.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppServerError);
    expect(error).toMatchObject({ code: -32600, message: 'no rollout found for thread id gone' });
  });

  it("passes Codex's notifications on, and answers its requests with the handler's result, by their id", async () => {
    const { server, codex } = await started();
    const heard: [string, unknown][] = [];
    server.onNotification((method, params) => {
      heard.push([method, params]);
    });
    server.onRequest((method, params) =>
      Promise.resolve(method === 'item/tool/call' ? { success: true, params } : { decision: 'decline' }),
    );

    codex.notify('turn/started', { turn: { id: 'turn-1' } });
    const answer = await codex.ask('item/tool/call', { tool: 'list_tickets' });

    expect(answer).toEqual({ id: answer.id, result: { success: true, params: { tool: 'list_tickets' } } });
    expect(heard).toEqual([['turn/started', { turn: { id: 'turn-1' } }]]);
  });

  it("answers Codex's request with an error when the handler throws, and carries on", async () => {
    const { server, codex } = await started();
    server.onRequest(() => Promise.reject(new Error('Orynx has no answer')));

    const answer = await codex.ask('item/commandExecution/requestApproval', { command: 'ls' });

    expect(answer.error).toEqual({ code: -32603, message: 'Orynx has no answer' });
    const asked = server.request('model/list', {});
    codex.reply((await codex.expectRequest('model/list')).id, { data: [] });
    expect(await asked).toEqual({ data: [] });
  });

  it('skips a line that is not a JSON-RPC message, and carries on', async () => {
    const { server, codex } = await started();
    const asked = server.request('model/list', {});
    const { id } = await codex.expectRequest('model/list');
    codex.raw('Codex printed this by mistake');
    codex.raw('{"id": true}');
    codex.reply(id, { data: [] });

    expect(await asked).toEqual({ data: [] });
  });

  it('AC-20: once the program ends, a waiting request rejects and `ended` settles', async () => {
    const { server, codex } = await started();
    const asked = server.request('turn/start', {});
    await codex.expectRequest('turn/start');
    codex.exit(1);

    await expect(asked).rejects.toThrow('Codex ended');
    await expect(server.ended).resolves.toBeUndefined();
    await expect(server.request('model/list', {})).rejects.toThrow('Codex ended');
  });

  it('AC-20: close ends the input, and a program that ignores SIGTERM is killed after the grace', async () => {
    const fake = await fakeCodex();
    await fake.ignoresStop();
    const starting = startAppServer({ program: fake.program, args: ['app-server'], cwd: tmpdir(), env });
    const codex = await fake.next();
    codex.reply((await codex.expectRequest('initialize')).id, {});
    const server = await starting;

    const startedAt = Date.now();
    await server.close(200);

    await codex.closed;
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(150);
    await expect(server.ended).resolves.toBeUndefined();
  });

  it('a request Codex never answers gives up after its time limit', async () => {
    const { server, codex } = await started();
    const asked = server.request('account/read', {}, 50);
    await codex.expectRequest('account/read');

    await expect(asked).rejects.toThrow('Codex did not answer account/read in time');
  });

  it("fails to start when the program can't run, or ends before it answers initialize", async () => {
    await expect(
      startAppServer({ program: '/nonexistent/codex', args: ['app-server'], cwd: tmpdir(), env }),
    ).rejects.toThrow();
    const fake = await fakeCodex();
    const starting = startAppServer({ program: fake.program, args: ['app-server'], cwd: tmpdir(), env });
    const codex = await fake.next();
    await codex.expectRequest('initialize');
    codex.exit(1);
    await expect(starting).rejects.toThrow('Codex ended');
  });
});
