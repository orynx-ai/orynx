import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '@devhub/core';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { injectToken, serveWeb, tokenMetaPlaceholder } from './web.ts';

const token = 'web-token';
const host = '127.0.0.1:4317';
let dist: string;
let app: FastifyInstance;

beforeEach(async () => {
  dist = await mkdtemp(join(tmpdir(), 'devhub-web-'));
  await mkdir(join(dist, 'assets'));
  await writeFile(join(dist, 'index.html'), `<html><head>${tokenMetaPlaceholder}</head><body></body></html>`);
  await writeFile(join(dist, 'assets', 'app.js'), 'console.log("devhub")');
  app = await createServer({ token, port: 4317, version: 'test' });
  await serveWeb(app, { distDir: dist, token });
});

afterEach(async () => {
  await app.close();
  await rm(dist, { recursive: true, force: true });
});

describe('serveWeb', () => {
  it('serves index.html with the session token filled in and no caching', async () => {
    const res = await app.inject({ method: 'GET', url: '/', headers: { host } });

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toContain(`<meta name="devhub-token" content="${token}" />`);
  });

  it('answers client routes like /tickets with the app, so reloads work', async () => {
    const res = await app.inject({ method: 'GET', url: '/settings/appearance', headers: { host } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain(token);
  });

  it('serves built files as they are', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/app.js', headers: { host } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('console.log("devhub")');
  });

  it('still protects the API', async () => {
    const withoutToken = await app.inject({ method: 'GET', url: apiRoutes.status, headers: { host } });
    const withToken = await app.inject({
      method: 'GET',
      url: apiRoutes.status,
      headers: { host, [tokenHeader]: token },
    });

    expect(withoutToken.statusCode).toBe(401);
    expect(withToken.statusCode).toBe(200);
  });

  it('does not answer other methods with the page', async () => {
    const res = await app.inject({ method: 'POST', url: '/tickets', headers: { host } });
    expect(res.statusCode).toBe(404);
  });

  it('refuses to start without a web build', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'devhub-empty-'));
    const other = await createServer({ token, port: 4317, version: 'test' });

    await expect(serveWeb(other, { distDir: empty, token })).rejects.toThrow('Run "pnpm build" first');

    await other.close();
    await rm(empty, { recursive: true, force: true });
  });
});

describe('injectToken', () => {
  it('fails loudly when the page has no token tag', () => {
    expect(() => injectToken('<html></html>', 't')).toThrow('no devhub-token meta tag');
  });
});
