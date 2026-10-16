/// <reference types="node" />
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { EventSource } from 'eventsource';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes, type ServerEvent } from '@devhub/contracts';
import { createApiClient, parseServerEvent, subscribeToEvents } from './index.ts';

let server: Server | undefined;
let close: (() => void) | undefined;

afterEach(async () => {
  close?.();
  await new Promise<void>((resolve) => {
    if (server) {
      server.closeAllConnections();
      server.close(() => {
        resolve();
      });
    } else resolve();
  });
  server = undefined;
  close = undefined;
});

/** A stand-in for the network: a plain HTTP server speaking SSE, so the real client code runs. */
async function sseServer(frames: string[]) {
  const seen: string[] = [];
  let response: ServerResponse | undefined;
  server = createServer((req, res) => {
    seen.push(req.url ?? '');
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const frame of frames) res.write(frame);
    response = res;
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { baseURL: `http://127.0.0.1:${String(port)}`, seen, push: (frame: string) => response?.write(frame) };
}

async function until(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(check()).toBe(true);
}

describe('parseServerEvent', () => {
  it('returns the event for a valid frame', () => {
    expect(parseServerEvent('{"type":"status.changed"}')).toEqual({ type: 'status.changed' });
  });

  it('drops malformed JSON and unknown event types', () => {
    expect(parseServerEvent('not json')).toBeNull();
    expect(parseServerEvent('{"type":"nope"}')).toBeNull();
  });
});

describe('subscribeToEvents', () => {
  it('passes the token in the query string and delivers parsed events', async () => {
    const { baseURL, seen } = await sseServer([
      'data: {"type":"hello","at":"2026-10-16T10:00:00.000Z"}\n\n',
      'data: {"type":"bogus"}\n\n',
      'data: {"type":"status.changed"}\n\n',
    ]);
    const received: ServerEvent[] = [];

    close = subscribeToEvents({ baseURL, token: 'tok', onEvent: (e) => received.push(e), EventSource });

    await until(() => received.length === 2);
    expect(seen[0]).toBe(`${apiRoutes.events}?token=tok`);
    expect(received.map((e) => e.type)).toEqual(['hello', 'status.changed']);
  });

  it('reports a dropped stream through onError', async () => {
    const { baseURL } = await sseServer([]);
    const onError = vi.fn();
    close = subscribeToEvents({ baseURL, token: 't', onEvent: vi.fn(), onError, EventSource });
    await new Promise((r) => setTimeout(r, 50));

    server?.closeAllConnections();

    await until(() => onError.mock.calls.length > 0);
  });

  it('is reachable through the api client with the client token', async () => {
    const { baseURL, seen, push } = await sseServer([]);
    const received: ServerEvent[] = [];

    close = createApiClient({ baseURL, token: 'from-client', EventSource }).subscribe((e) => received.push(e));
    await until(() => seen.length === 1);
    push('data: {"type":"status.changed"}\n\n');

    await until(() => received.length === 1);
    expect(seen[0]).toBe(`${apiRoutes.events}?token=from-client`);
  });

  it('explains when no EventSource exists', () => {
    expect(() => subscribeToEvents({ baseURL: 'http://127.0.0.1:1', token: 't', onEvent: vi.fn() })).toThrow(
      'EventSource is not available in this environment.',
    );
  });
});
