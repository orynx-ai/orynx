import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { createServer } from '../create-server.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';

const token = 'test-token-0123456789';
const servers: FastifyInstance[] = [];
const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((app) => app.close()));
});

/** A listening hub with the agents' door open, and its token. */
async function hub({ open = true } = {}) {
  const keychain = createMemoryKeychain();
  const app = await createServer({ token, port: 0, version: '1.2.3', keychain });
  servers.push(app);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const { port } = app.server.address() as AddressInfo;
  const page = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };
  if (open) {
    await app.inject({ method: 'PUT', url: apiRoutes.agentsAccess, headers: page, payload: { enabled: true } });
  }
  return { app, port, page, agentToken: (await keychain.get('agents')) ?? '' };
}

async function connect(port: number, headers: Record<string, string>) {
  const client = new Client({ name: 'test-agent', version: '0.0.0' });
  clients.push(client);
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${String(port)}${apiRoutes.mcp}`), {
    requestInit: { headers },
  });
  // The SDK's own two types differ on an optional `onclose` under exactOptionalPropertyTypes; they're one object.
  await client.connect(transport as Transport);
  return client;
}

describe('the MCP server for agents outside Orynx (spec 037)', () => {
  it('AC-44: offers the ticket tools without delete', async () => {
    const { port, agentToken } = await hub();
    const client = await connect(port, { authorization: `Bearer ${agentToken}` });

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual(['list_tickets', 'get_ticket', 'create_ticket', 'update_ticket']);
    expect(tools.find((tool) => tool.name === 'create_ticket')?.inputSchema.required).toEqual(['title']);
  });

  it('AC-40, AC-41: an agent files and moves a ticket as itself, named by its client', async () => {
    const { app, port, page, agentToken } = await hub();
    const client = await connect(port, { authorization: `Bearer ${agentToken}`, 'x-orynx-agent': 'Cursor' });

    const made = await client.callTool({ name: 'create_ticket', arguments: { title: 'Login times out' } });
    const moved = await client.callTool({ name: 'update_ticket', arguments: { key: 'ORX-1', status: 'in_progress' } });

    expect(made.isError).toBeUndefined();
    expect(moved.isError).toBeUndefined();
    const read = await app.inject({
      method: 'GET',
      url: apiRoutes.orynxTicket.replace(':key', 'ORX-1'),
      headers: page,
    });
    expect(read.json()).toMatchObject({
      result: 'found',
      ticket: { title: 'Login times out', status: 'in_progress', createdBy: { kind: 'agent', name: 'Cursor' } },
    });
  });

  it('AC-41: an agent can’t delete: there is no such tool for it', async () => {
    const { port, agentToken } = await hub();
    const client = await connect(port, { authorization: `Bearer ${agentToken}` });
    await client.callTool({ name: 'create_ticket', arguments: { title: 'Keep me' } });

    const deleted = await client.callTool({ name: 'delete_ticket', arguments: { key: 'ORX-1' } });

    expect(deleted.isError).toBe(true);
    const listed = await client.callTool({ name: 'list_tickets', arguments: {} });
    expect(JSON.stringify(listed.content)).toContain('ORX-1');
  });

  it('AC-42: refuses no token, the page’s token, a wrong one, a foreign Host, and an encoded path', async () => {
    const { app, page, agentToken } = await hub();
    const list = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };
    const accept = { accept: 'application/json, text/event-stream', 'content-type': 'application/json' };
    const post = (url: string, headers: Record<string, string>) =>
      app.inject({ method: 'POST', url, headers: { ...accept, ...headers }, payload: list });

    expect((await post(apiRoutes.mcp, { host: page.host })).statusCode).toBe(401);
    expect((await post(apiRoutes.mcp, page)).statusCode).toBe(401);
    expect((await post(apiRoutes.mcp, { host: page.host, authorization: 'Bearer wrong' })).statusCode).toBe(401);
    expect((await post(apiRoutes.mcp, { host: page.host, authorization: agentToken })).statusCode).toBe(401);
    expect(
      (await post(apiRoutes.mcp, { host: 'evil.example:4317', authorization: `Bearer ${agentToken}` })).statusCode,
    ).toBe(403);
    expect((await post('/%61pi/mcp', page)).statusCode).toBe(401);
    expect((await post(apiRoutes.mcp, { host: page.host, authorization: `Bearer ${agentToken}` })).statusCode).toBe(
      200,
    );
  });

  it('AC-42: the agents’ token opens nothing else', async () => {
    const { app, page, agentToken } = await hub();
    const answer = await app.inject({
      method: 'GET',
      url: apiRoutes.tickets,
      headers: { host: page.host, authorization: `Bearer ${agentToken}` },
    });
    expect(answer.statusCode).toBe(401);
  });

  it('AC-39, AC-42: refuses everyone while off, and again once turned off', async () => {
    const shut = await hub({ open: false });
    const asked = { host: shut.page.host, authorization: 'Bearer anything', 'content-type': 'application/json' };
    expect(
      (await shut.app.inject({ method: 'POST', url: apiRoutes.mcp, headers: asked, payload: {} })).statusCode,
    ).toBe(401);

    const { app, page, agentToken } = await hub();
    await app.inject({ method: 'PUT', url: apiRoutes.agentsAccess, headers: page, payload: { enabled: false } });
    const after = { host: page.host, authorization: `Bearer ${agentToken}`, 'content-type': 'application/json' };
    expect((await app.inject({ method: 'POST', url: apiRoutes.mcp, headers: after, payload: {} })).statusCode).toBe(
      401,
    );
    expect((await app.inject({ method: 'GET', url: apiRoutes.agentsAccess, headers: page })).json()).toEqual({
      enabled: false,
    });
  });

  it('answers only POST', async () => {
    const { app, page, agentToken } = await hub();
    const answer = await app.inject({
      method: 'GET',
      url: apiRoutes.mcp,
      headers: { host: page.host, authorization: `Bearer ${agentToken}` },
    });
    expect(answer.statusCode).toBe(405);
  });
});
