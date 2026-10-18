import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, ApiErrorSchema, StatusSchema, tokenHeader } from '@devhub/contracts';
import { createServer, redactPath, redactToken } from './create-server.ts';

const token = 'test-token-0123456789';
const port = 4317;
const host = `127.0.0.1:${String(port)}`;

let app: FastifyInstance | undefined;

async function server(): Promise<FastifyInstance> {
  app = await createServer({ token, port, version: '1.2.3', userName: () => Promise.resolve(null) });
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

describe('GET /api/status user', () => {
  it('AC-16: names the user, and asks for the name only once', async () => {
    let asked = 0;
    app = await createServer({
      token,
      port,
      version: '1.2.3',
      userName: () => {
        asked += 1;
        return Promise.resolve('Ada Lovelace');
      },
    });
    const request = { method: 'GET', url: apiRoutes.status, headers: { host, [tokenHeader]: token } } as const;

    const first = StatusSchema.parse((await app.inject(request)).json());
    await app.inject(request);

    expect(first.user).toEqual({ name: 'Ada Lovelace' });
    expect(asked).toBe(1);
  });

  it('AC-16: says null instead of failing when the name lookup throws', async () => {
    app = await createServer({ token, port, version: '1.2.3', userName: () => Promise.reject(new Error('no git')) });
    const res = await app.inject({ method: 'GET', url: apiRoutes.status, headers: { host, [tokenHeader]: token } });

    expect(res.statusCode).toBe(200);
    expect(StatusSchema.parse(res.json()).user).toEqual({ name: null });
  });

  it('AC-16: says null when nobody is known', async () => {
    app = await createServer({ token, port, version: '1.2.3', userName: () => Promise.resolve(null) });
    const res = await app.inject({ method: 'GET', url: apiRoutes.status, headers: { host, [tokenHeader]: token } });

    expect(StatusSchema.parse(res.json()).user).toEqual({ name: null });
  });
});

describe('local-only security', () => {
  it.each(['/%61pi/status', '/%61pi/sessions', '/%61%70%69/status', '/api/%73essions'])(
    'rejects %s without the token: an encoded path routes to /api too',
    async (url) => {
      const res = await (await server()).inject({ method: 'GET', url, headers: { host } });

      expect(res.statusCode).toBe(401);
      expect(ApiErrorSchema.parse(res.json()).code).toBe('unauthorized');
    },
  );

  it('still answers an encoded /api path that carries the token', async () => {
    const res = await (
      await server()
    ).inject({ method: 'GET', url: '/%61pi/status', headers: { host, [tokenHeader]: token } });

    expect(res.statusCode).toBe(200);
  });

  it('rejects a request without the token with 401 and says to reload', async () => {
    const res = await (await server()).inject({ method: 'GET', url: apiRoutes.status, headers: { host } });

    expect(res.statusCode).toBe(401);
    expect(ApiErrorSchema.parse(res.json())).toEqual({
      code: 'unauthorized',
      message: 'Orynx restarted or this page is out of date. Reload the page.',
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

describe('redactPath', () => {
  it('013 AC-23: keeps a changed file’s path out of the logged URL', () => {
    expect(redactPath('/api/sessions/0123456789abcdef/changes/diff?path=src%2Fsecret.ts')).toBe(
      '/api/sessions/0123456789abcdef/changes/diff?path=[redacted]',
    );
    expect(redactPath('/api/sessions/0123456789abcdef/changes')).toBe('/api/sessions/0123456789abcdef/changes');
  });
});

describe('redactToken', () => {
  it('hides the token value and keeps the rest of the URL', () => {
    expect(redactToken('/api/events?token=abc&x=1')).toBe('/api/events?token=[redacted]&x=1');
    expect(redactToken('/api/status')).toBe('/api/status');
  });
});
