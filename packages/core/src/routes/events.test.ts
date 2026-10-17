import { request as httpRequest, type IncomingMessage } from 'node:http';
import { Writable } from 'node:stream';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, ServerEventSchema, type ServerEvent } from '@devhub/contracts';
import { createEventBus } from '../events/event-bus.ts';
import { createServer } from '../create-server.ts';

const token = 'events-token-0123456789';
let app: FastifyInstance | undefined;
let response: IncomingMessage | undefined;

afterEach(async () => {
  response?.destroy();
  await app?.close();
  app = undefined;
  response = undefined;
});

/** Opens the real stream over a real socket, the way a browser EventSource does. */
async function openStream(events = createEventBus(), log?: Writable) {
  app = await createServer({
    token,
    port: 0,
    version: 'test',
    events,
    eventsKeepAliveMs: 20,
    ...(log ? { logger: { level: 'info', stream: log } } : {}),
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const { port } = app.server.address() as AddressInfo;

  response = await new Promise<IncomingMessage>((resolve, reject) => {
    httpRequest({ host: '127.0.0.1', port, path: `${apiRoutes.events}?token=${token}` }, resolve)
      .on('error', reject)
      .end();
  });
  response.setEncoding('utf8');

  const received: ServerEvent[] = [];
  const comments: string[] = [];
  let buffer = '';
  response.on('data', (chunk: string) => {
    buffer += chunk;
    let end = buffer.indexOf('\n\n');
    while (end !== -1) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (frame.startsWith('data: ')) received.push(ServerEventSchema.parse(JSON.parse(frame.slice(6))));
      else comments.push(frame);
      end = buffer.indexOf('\n\n');
    }
  });

  return { events, received, comments, res: response };
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(check()).toBe(true);
}

describe('GET /api/events', () => {
  it('opens a text/event-stream and says hello first', async () => {
    const { received, res } = await openStream();

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    await until(() => received.length > 0);
    expect(received[0]?.type).toBe('hello');
  });

  it('forwards every event published on the bus', async () => {
    const { events, received } = await openStream();
    await until(() => received.length === 1);

    events.publish({ type: 'status.changed' });

    await until(() => received.length === 2);
    expect(received[1]).toEqual({ type: 'status.changed' });
  });

  it('sends keep-alive comments so the connection stays open', async () => {
    const { comments } = await openStream();
    await until(() => comments.length > 0);
    expect(comments[0]).toBe(': keep-alive');
  });

  it('never writes the token from the stream URL to the log', async () => {
    const lines: string[] = [];
    const log = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const { received } = await openStream(createEventBus(), log);
    await until(() => received.length === 1);

    const output = lines.join('');
    expect(output).toContain(`${apiRoutes.events}?token=[redacted]`);
    expect(output).not.toContain(token);
  });

  it('stops listening when the client goes away', async () => {
    const { events, received, res } = await openStream();
    await until(() => received.length === 1);
    expect(events.listenerCount()).toBe(1);
    expect(events.pageCount()).toBe(1);

    res.destroy();

    await until(() => events.listenerCount() === 0 && events.pageCount() === 0);
  });
});
