import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { apiPaths } from '@devhub/contracts';
import type { OrynxTicketService } from '../orynx-tickets/ticket-service.ts';
import { ticketTools } from '../orynx-tickets/tools.ts';

/** The header the bridge names its MCP client by, from that client's `initialize` (spec 037, Q12n). */
export const agentNameHeader = 'x-orynx-agent';

/** The client's name as given, if it's one a person could read: printable, and 100 characters at most. */
function agentName(header: string | string[] | undefined): string | null {
  const name = typeof header === 'string' ? header.trim() : '';
  return name === '' || name.length > 100 || /[\p{C}]/u.test(name) ? null : name;
}

/**
 * Orynx's MCP server for agents outside it (spec 037, Q14): the same ticket tools a session's agent gets, without
 * delete, since no session is there to ask you. It keeps nothing between requests (the MCP SDK's stateless
 * Streamable HTTP, answering in JSON), so each request makes its own server. `local-only` lets a request in with the
 * agents' token alone, never the page's.
 */
export const mcpRoutes: FastifyPluginCallbackZod<{ tickets: OrynxTicketService }> = (app, { tickets }, done) => {
  app.post(apiPaths.mcp, async (request, reply) => {
    const server = new McpServer({ name: 'orynx', version: '1.0.0' });
    const actor = { kind: 'agent', name: agentName(request.headers[agentNameHeader]) } as const;
    for (const tool of ticketTools(tickets, actor).filter((candidate) => candidate.access !== 'delete')) {
      server.registerTool(
        tool.name,
        { description: tool.description, inputSchema: tool.input.shape },
        async (input) => {
          const answer = await tool.run(input);
          return {
            content: [{ type: 'text', text: answer.text }],
            ...(answer.error === true ? { isError: true } : {}),
          };
        },
      );
    }
    // No session id generator: stateless.
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    reply.hijack();
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    // The SDK's own two types differ on an optional `onclose` under exactOptionalPropertyTypes; they're one object.
    await server.connect(transport as Transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });

  // Nothing streams from this server, and nothing is kept to end: only POST.
  for (const method of ['GET', 'DELETE'] as const) {
    app.route({
      method,
      url: apiPaths.mcp,
      handler: (_request, reply) =>
        reply
          .code(405)
          .header('allow', 'POST')
          .send({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }),
    });
  }

  done();
};
