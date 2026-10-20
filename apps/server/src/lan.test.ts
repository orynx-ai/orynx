import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '@devhub/core';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import {
  accessCodeFile,
  accessCookie,
  accessPath,
  caPath,
  createAccessCode,
  frontDoor,
  plainDoor,
  readAccessCode,
} from './lan.ts';
import { serveWeb, tokenMetaPlaceholder } from './web.ts';

const token = 'lan-token';
const code = 'ABCD-EFGH-JKMN';
const host = 'orynx.local';
let dist: string;
let app: FastifyInstance;
let door: Server;
let fromThisComputer: boolean;

interface Answer {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/** A request to the front door as a device on the wifi sends it: Host orynx.local. */
function send(
  path: string,
  { method = 'GET', headers = {}, body }: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<Answer> {
  const { port } = door.address() as AddressInfo;
  return new Promise((resolve, reject) => {
    const req = httpRequest({ port, path, method, headers: { host, ...headers } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (text += chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

beforeEach(async () => {
  dist = await mkdtemp(join(tmpdir(), 'devhub-lan-'));
  await writeFile(join(dist, 'index.html'), `<html><head>${tokenMetaPlaceholder}</head><body></body></html>`);
  await writeFile(join(dist, 'manifest.webmanifest'), '{"name":"Orynx"}');
  app = await createServer({ token, port: 4317, version: 'test', userName: () => Promise.resolve(null) });
  await serveWeb(app, { distDir: dist, token });
  await app.ready();
  fromThisComputer = false;
  door = createHttpServer(
    frontDoor({
      code,
      distDir: dist,
      hubHost: '127.0.0.1:4317',
      forward: (request, response) => {
        app.routing(request, response);
      },
      fromThisComputer: () => fromThisComputer,
    }),
  );
  await new Promise<void>((resolve) => door.listen(0, '127.0.0.1', resolve));
});

afterEach(async () => {
  door.close();
  await app.close();
  await rm(dist, { recursive: true, force: true });
});

describe('frontDoor', () => {
  it('040 AC-4: asks a device on the wifi for the access code, and never shows it the page or its token', async () => {
    const page = await send('/');
    const deep = await send('/tickets');
    const api = await send(apiRoutes.status, { headers: { [tokenHeader]: token } });

    expect(page.status).toBe(401);
    expect(page.body).toContain('Enter the access code');
    expect(page.body).not.toContain(token);
    expect(deep.body).not.toContain(token);
    expect(api.status).toBe(401);
    expect(api.body).not.toContain('"version"');
  });

  it('040 AC-5: lets the device in once it enters the code, in any case and without dashes', async () => {
    const signIn = await send(accessPath, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'code=abcd%20efgh-jkmn',
    });
    const cookie = String(signIn.headers['set-cookie']).split(';')[0] ?? '';
    const page = await send('/', { headers: { cookie } });
    const api = await send(apiRoutes.status, { headers: { cookie, [tokenHeader]: token } });

    expect(signIn.status).toBe(303);
    expect(signIn.headers['location']).toBe('/');
    expect(signIn.headers['set-cookie']).toEqual([
      `${accessCookie}=ABCDEFGHJKMN; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
    ]);
    expect(page.status).toBe(200);
    expect(page.body).toContain(`content="${token}"`);
    expect(api.status).toBe(200);
  });

  it('040 AC-6: says so when the code is wrong, and sets no cookie', async () => {
    const signIn = await send(accessPath, { method: 'POST', body: 'code=ABCD-EFGH-JKMP' });
    const forged = await send('/', { headers: { cookie: `${accessCookie}=ABCDEFGHJKMP` } });

    expect(signIn.status).toBe(401);
    expect(signIn.body).toContain('role="alert"');
    expect(signIn.headers['set-cookie']).toBeUndefined();
    expect(forged.body).not.toContain(token);
  });

  it('040 AC-7: lets this computer in without a code', async () => {
    fromThisComputer = true;
    const page = await send('/');
    expect(page.body).toContain(`content="${token}"`);
  });

  it('040 AC-8: refuses any other name, so a DNS-rebinding page can’t read the page even with the code', async () => {
    const answer = await send('/', { headers: { host: 'evil.example', cookie: `${accessCookie}=${code}` } });
    expect(answer.status).toBe(403);
    expect(answer.body).not.toContain(token);
  });

  it('040 AC-9: serves the manifest without the code, so a browser can install the app', async () => {
    const manifest = await send('/manifest.webmanifest');
    // Parsed as a URL this would be /manifest.webmanifest on host x; the hub would answer it with the page.
    const sneaky = await send('//x/manifest.webmanifest');

    expect(manifest.status).toBe(200);
    expect(manifest.headers['content-type']).toBe('application/manifest+json');
    expect(manifest.body).toBe('{"name":"Orynx"}');
    expect(sneaky.status).toBe(401);
    expect(sneaky.body).not.toContain(token);
  });

  it('refuses a sign-in body too long to be a code', async () => {
    const answer = await send(accessPath, { method: 'POST', body: `code=${'A'.repeat(3000)}` });
    expect(answer.status).toBe(413);
  });
});

describe('plainDoor', () => {
  it('040 AC-10: hands out the certificate to trust over http and sends everything else to https', async () => {
    const plain = createHttpServer(plainDoor(Buffer.from('-----BEGIN CERTIFICATE-----')));
    await new Promise<void>((resolve) => plain.listen(0, '127.0.0.1', resolve));
    const { port } = plain.address() as AddressInfo;
    const get = (path: string) => fetch(`http://127.0.0.1:${String(port)}${path}`, { redirect: 'manual' });

    const ca = await get(caPath);
    const other = await get('/tickets?view=board');

    expect(ca.headers.get('content-type')).toBe('application/x-x509-ca-cert');
    expect(await ca.text()).toBe('-----BEGIN CERTIFICATE-----');
    expect(other.status).toBe(302);
    expect(other.headers.get('location')).toBe('https://orynx.local/tickets?view=board');
    plain.close();
  });
});

describe('readAccessCode', () => {
  it('040 AC-3: makes a 12-character code once, readable only by you, and keeps it', async () => {
    const home = await mkdtemp(join(tmpdir(), 'devhub-lan-home-'));
    try {
      const first = await readAccessCode(home);
      const again = await readAccessCode(home);

      expect(first).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(again).toBe(first);
      expect((await readFile(accessCodeFile(home), 'utf8')).trim()).toBe(first);
      expect((await stat(accessCodeFile(home))).mode & 0o777).toBe(0o600);

      await writeFile(accessCodeFile(home), '\n');
      await expect(readAccessCode(home)).rejects.toThrow(/holds no access code/);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it('makes a different code each time', () => {
    expect(createAccessCode()).not.toBe(createAccessCode());
  });
});
