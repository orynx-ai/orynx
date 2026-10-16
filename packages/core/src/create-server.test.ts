import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, ApiErrorSchema, StatusSchema, tokenHeader } from '@devhub/contracts';
import { createServer, redactToken } from './create-server.ts';

const token = 'test-token-0123456789';
const port = 4317;
const host = `127.0.0.1:${String(port)}`;

let app: FastifyInstance | undefined;

async function server(): Promise<FastifyInstance> {
  app = await createServer({ token, port, version: '1.2.3' });
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /api/status', () => {
  it('returns the status for a request with the session token', async () => {
    const res = await (
      await server()
    ).inject({
      method: 'GET',
      url: apiRoutes.status,
      headers: { host, [tokenHeader]: token },
    });

    expect(res.statusCode).toBe(200);
    const status = StatusSchema.parse(res.json());
    expect(status.version).toBe('1.2.3');
    expect(status.integrations.jira.state).toBe('not_connected');
  });

  it('accepts localhost as well as 127.0.0.1', async () => {
    const res = await (
      await server()
    ).inject({
      method: 'GET',
      url: apiRoutes.status,
      headers: { host: `localhost:${String(port)}`, [tokenHeader]: token },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('local-only security', () => {
  it('rejects a request without the token with 401 and says to reload', async () => {
    const res = await (await server()).inject({ method: 'GET', url: apiRoutes.status, headers: { host } });

    expect(res.statusCode).toBe(401);
    expect(ApiErrorSchema.parse(res.json())).toEqual({
      code: 'unauthorized',
      message: 'DevHub restarted or this page is out of date. Reload the page.',
    });
  });

  it('rejects a wrong token of the same length', async () => {
    const res = await (
      await server()
    ).inject({
      method: 'GET',
      url: apiRoutes.status,
      headers: { host, [tokenHeader]: token.replace('0', 'x') },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a DNS-rebinding Host header even with the right token', async () => {
    const res = await (
      await server()
    ).inject({
      method: 'GET',
      url: apiRoutes.status,
      headers: { host: `evil.example:${String(port)}`, [tokenHeader]: token },
    });

    expect(res.statusCode).toBe(403);
    expect(ApiErrorSchema.parse(res.json()).code).toBe('forbidden_host');
  });

  it('only accepts the token as a query parameter on the event stream', async () => {
    const res = await (
      await server()
    ).inject({ method: 'GET', url: `${apiRoutes.status}?token=${token}`, headers: { host } });
    expect(res.statusCode).toBe(401);
  });

  it('lets non-API paths through so the host can serve the page', async () => {
    const res = await (await server()).inject({ method: 'GET', url: '/', headers: { host } });
    // No host route is registered here, so Fastify's own 404 answers, not the 401.
    expect(res.statusCode).toBe(404);
  });
});

describe('unknown API routes', () => {
  it('answer 404 with an ApiError body', async () => {
    const res = await (
      await server()
    ).inject({
      method: 'GET',
      url: '/api/nope',
      headers: { host, [tokenHeader]: token },
    });

    expect(res.statusCode).toBe(404);
    expect(ApiErrorSchema.parse(res.json())).toEqual({ code: 'not_found', message: 'No API route for GET /api/nope.' });
  });
});

describe('redactToken', () => {
  it('hides the token value and keeps the rest of the URL', () => {
    expect(redactToken('/api/events?token=abc&x=1')).toBe('/api/events?token=[redacted]&x=1');
    expect(redactToken('/api/status')).toBe('/api/status');
  });
});
