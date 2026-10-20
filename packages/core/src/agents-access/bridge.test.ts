import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, McpConfigSchema, tokenHeader } from '@devhub/contracts';
import { createServer } from '../create-server.ts';
import { createOrynxTicketStore } from '../orynx-tickets/ticket-store.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';

const token = 'test-token-0123456789';
const servers: FastifyInstance[] = [];
const bridges: ChildProcessWithoutNullStreams[] = [];
const homes: string[] = [];

afterEach(async () => {
  for (const bridge of bridges.splice(0)) bridge.kill();
  await Promise.all(servers.splice(0).map((app) => app.close()));
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

/** One Orynx on a free port, with its runtime.json written as the server host writes it. */
async function orynx(home: string, shared: Pick<Parameters<typeof createServer>[0], 'keychain' | 'orynxTickets'>) {
  const app = await createServer({ token, port: 0, version: '1.2.3', dataDir: home, ...shared });
  servers.push(app);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const { port } = app.server.address() as AddressInfo;
  await writeFile(join(home, 'runtime.json'), JSON.stringify({ port, token, pid: process.pid }), { mode: 0o600 });
  const page = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };
  return { app, page };
}

/** Starts the bridge as an MCP client would, from the config Copy MCP config gave, and talks to it line by line. */
function run(config: string) {
  const { command, args } = (JSON.parse(config) as { mcpServers: { orynx: { command: string; args: string[] } } })
    .mcpServers.orynx;
  const bridge = spawn(command, args, { stdio: 'pipe' });
  bridges.push(bridge);
  const waiting = new Map<number, (message: Record<string, unknown>) => void>();
  createInterface({ input: bridge.stdout }).on('line', (line) => {
    const message = JSON.parse(line) as Record<string, unknown>;
    waiting.get(message['id'] as number)?.(message);
  });
  let next = 0;
  return {
    ask(method: string, params: object = {}) {
      next += 1;
      const id = next;
      const answer = new Promise<Record<string, unknown>>((resolve) => waiting.set(id, resolve));
      bridge.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      return answer;
    },
    tell(method: string) {
      bridge.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
    },
  };
}

describe('the bridge (spec 037)', () => {
  it('AC-40, AC-43: an MCP client lists and uses the tools through it, by name, before and after Orynx moves port', async () => {
    const home = await mkdtemp(join(tmpdir(), 'orynx-bridge-'));
    homes.push(home);
    const shared = { keychain: createMemoryKeychain(), orynxTickets: createOrynxTicketStore() };
    const first = await orynx(home, shared);
    await first.app.inject({
      method: 'PUT',
      url: apiRoutes.agentsAccess,
      headers: first.page,
      payload: { enabled: true },
    });
    const copied = await first.app.inject({ method: 'POST', url: apiRoutes.agentsAccessConfig, headers: first.page });
    const { config } = McpConfigSchema.parse(copied.json());
    const client = run(config);

    const hello = await client.ask('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'Cursor', version: '1.0.0' },
    });
    client.tell('notifications/initialized');
    expect(hello).toMatchObject({ result: { serverInfo: { name: 'orynx' } } });
    const listed = await client.ask('tools/list');
    expect((listed['result'] as { tools: { name: string }[] }).tools.map((tool) => tool.name)).toEqual([
      'list_tickets',
      'get_ticket',
      'create_ticket',
      'update_ticket',
    ]);
    await client.ask('tools/call', { name: 'create_ticket', arguments: { title: 'Login times out' } });
    const made = await first.app.inject({
      method: 'GET',
      url: apiRoutes.orynxTicket.replace(':key', 'ORX-1'),
      headers: first.page,
    });
    expect(made.json()).toMatchObject({ ticket: { createdBy: { kind: 'agent', name: 'Cursor' } } });

    // Orynx starts again on another port, as the desktop app does at each launch.
    await first.app.close();
    await orynx(home, shared);
    const again = await client.ask('tools/call', { name: 'list_tickets', arguments: {} });
    expect(JSON.stringify(again)).toContain('ORX-1');
  });

  it('says Orynx isn’t running when there’s nothing to reach', async () => {
    const home = await mkdtemp(join(tmpdir(), 'orynx-bridge-'));
    homes.push(home);
    const { app, page } = await orynx(home, { keychain: createMemoryKeychain() });
    await app.inject({ method: 'PUT', url: apiRoutes.agentsAccess, headers: page, payload: { enabled: true } });
    const { config } = McpConfigSchema.parse(
      (await app.inject({ method: 'POST', url: apiRoutes.agentsAccessConfig, headers: page })).json(),
    );
    await rm(join(home, 'runtime.json'));

    expect(await run(config).ask('tools/list')).toMatchObject({
      error: { message: "Orynx isn't running. Open it, then try again." },
    });
  });

  it('AC-42: off deletes the bridge, and one still running is turned away', async () => {
    const home = await mkdtemp(join(tmpdir(), 'orynx-bridge-'));
    homes.push(home);
    const { app, page } = await orynx(home, { keychain: createMemoryKeychain() });
    await app.inject({ method: 'PUT', url: apiRoutes.agentsAccess, headers: page, payload: { enabled: true } });
    const { config } = McpConfigSchema.parse(
      (await app.inject({ method: 'POST', url: apiRoutes.agentsAccessConfig, headers: page })).json(),
    );
    const client = run(config);
    expect(await client.ask('tools/list')).toHaveProperty('result');

    await app.inject({ method: 'PUT', url: apiRoutes.agentsAccess, headers: page, payload: { enabled: false } });

    const [bridge = ''] = (JSON.parse(config) as { mcpServers: { orynx: { args: string[] } } }).mcpServers.orynx.args;
    await expect(stat(bridge)).rejects.toThrow();
    expect(await client.ask('tools/list')).toMatchObject({
      error: { message: 'Orynx no longer lets this agent in. Copy the MCP config from Settings › Coding agent again.' },
    });
    const refused = await app.inject({ method: 'POST', url: apiRoutes.agentsAccessConfig, headers: page });
    expect(refused.statusCode).toBe(400);
  });
});
