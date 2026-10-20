import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createPasswordStore, createServer, type PasswordStore } from '@devhub/core';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { accessCookie, accessPath, caPath, frontDoor, maxTries, plainDoor, triesWindowMs } from './lan.ts';
import { serveWeb, tokenMetaPlaceholder } from './web.ts';

const token = 'lan-token';
const secret = 'correct horse battery';
const host = 'orynx.local';
let dist: string;
let app: FastifyInstance;
let door: Server | undefined;
let fromThisComputer: boolean;
let password: PasswordStore;

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
  const { port } = door?.address() as AddressInfo;
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
  password = createPasswordStore();
  await password.set(secret);
  await openDoor(password);
});

/** The front door in front of the hub, checking `store`; another call replaces it. */
async function openDoor(store: PasswordStore): Promise<void> {
  door?.close();
  const next = createHttpServer(
    frontDoor({
      password: store,
      distDir: dist,
      hubHost: '127.0.0.1:4317',
      forward: (request, response) => {
        app.routing(request, response);
      },
      fromThisComputer: () => fromThisComputer,
    }),
  );
  await new Promise<void>((resolve) => next.listen(0, '127.0.0.1', resolve));
  door = next;
}

afterEach(async () => {
  vi.useRealTimers();
  door?.close();
  door = undefined;
  await app.close();
  await rm(dist, { recursive: true, force: true });
});

/** Posts a password to the sign-in form, as the page's form does. */
function signIn(given: string) {
  return send(accessPath, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password: given }).toString(),
  });
}

describe('frontDoor', () => {
  it('043 AC-8: asks a device on the wifi for the password, and never shows it the page or its token', async () => {
    const page = await send('/');
    const deep = await send('/tickets');
    const api = await send(apiRoutes.status, { headers: { [tokenHeader]: token } });

    expect(page.status).toBe(401);
    expect(page.body).toContain('Enter your password');
    expect(page.body).toContain('autocomplete="current-password"');
    expect(page.body).not.toContain(token);
    expect(deep.body).not.toContain(token);
    expect(api.status).toBe(401);
    expect(api.body).not.toContain('"version"');
  });

  it('043 AC-9: lets the device in once it enters the password, with a cookie that is not the password', async () => {
    const answer = await signIn(secret);
    const cookie = String(answer.headers['set-cookie']).split(';')[0] ?? '';
    const page = await send('/', { headers: { cookie } });
    const api = await send(apiRoutes.status, { headers: { cookie, [tokenHeader]: token } });

    expect(answer.status).toBe(303);
    expect(answer.headers['location']).toBe('/');
    expect(answer.headers['set-cookie']).toEqual([
      `${accessCookie}=${(await password.cookie()) ?? ''}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
    ]);
    expect(cookie).not.toContain('correct');
    expect(page.status).toBe(200);
    expect(page.body).toContain(`content="${token}"`);
    expect(api.status).toBe(200);
  });

  it('043 AC-10: says so when the password is wrong, sets no cookie, and lets no made-up cookie in', async () => {
    const answer = await signIn('correct horse');
    const forged = await send('/', { headers: { cookie: `${accessCookie}=${secret}` } });

    expect(answer.status).toBe(401);
    expect(answer.body).toContain('<p role="alert">That password doesn’t match. Try again.</p>');
    expect(answer.headers['set-cookie']).toBeUndefined();
    expect(forged.body).not.toContain(token);
  });

  it('043 AC-11: stops checking after 10 wrong passwords in 15 minutes, from any device, until the oldest is 15 minutes old', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    for (let wrong = 0; wrong < maxTries; wrong += 1) expect((await signIn(`guess ${String(wrong)}`)).status).toBe(401);

    const refused = await signIn(secret);
    expect(refused.status).toBe(429);
    expect(refused.body).toContain('Too many wrong passwords. Try again in 15 minutes.');
    expect(refused.headers['set-cookie']).toBeUndefined();

    vi.setSystemTime(Date.now() + triesWindowMs);
    expect((await signIn(secret)).status).toBe(303);
  });

  it('043 AC-11: counts tries sent all at once before checking any, so a burst gets no more than 10', async () => {
    const answers = await Promise.all(Array.from({ length: maxTries + 5 }, (_, n) => signIn(`guess ${String(n)}`)));
    expect(answers.filter((answer) => answer.status === 429)).toHaveLength(5);
  });

  it('043 AC-12: a new password signs every device out', async () => {
    const cookie = String((await signIn(secret)).headers['set-cookie']).split(';')[0] ?? '';
    await password.set('another long password');

    const page = await send('/', { headers: { cookie } });
    expect(page.status).toBe(401);
    expect(page.body).not.toContain(token);
  });

  it('043 AC-7: before setup lets no other device in, not even to choose the password', async () => {
    password = createPasswordStore();
    await openDoor(password);

    const page = await send('/');
    const api = await send(apiRoutes.setup, {
      method: 'POST',
      headers: { [tokenHeader]: token, 'content-type': 'application/json' },
      body: JSON.stringify({ profile: { name: 'Mallory', bio: '', picture: null }, password: 'mine now!' }),
    });
    const tried = await signIn('anything at all');

    expect(page.status).toBe(401);
    expect(page.body).toContain('Finish setting up Orynx');
    expect(page.body).not.toContain('<form');
    expect(page.body).not.toContain(token);
    expect(api.status).toBe(401);
    expect(tried.status).toBe(401);
    expect(tried.headers['set-cookie']).toBeUndefined();
    expect(await password.isSet()).toBe(false);
  });

  it('040 AC-7: lets this computer in without a password', async () => {
    fromThisComputer = true;
    const page = await send('/');
    expect(page.body).toContain(`content="${token}"`);
  });

  it('040 AC-8: refuses any other name, so a DNS-rebinding page can’t read the page even with the cookie', async () => {
    const cookie = String((await signIn(secret)).headers['set-cookie']).split(';')[0] ?? '';
    const answer = await send('/', { headers: { host: 'evil.example', cookie } });
    expect(answer.status).toBe(403);
    expect(answer.body).not.toContain(token);
  });

  it('040 AC-9: serves the manifest without the password, so a browser can install the app', async () => {
    const manifest = await send('/manifest.webmanifest');
    // Parsed as a URL this would be /manifest.webmanifest on host x; the hub would answer it with the page.
    const sneaky = await send('//x/manifest.webmanifest');

    expect(manifest.status).toBe(200);
    expect(manifest.headers['content-type']).toBe('application/manifest+json');
    expect(manifest.body).toBe('{"name":"Orynx"}');
    expect(sneaky.status).toBe(401);
    expect(sneaky.body).not.toContain(token);
  });

  it('refuses a sign-in body too long to be a password', async () => {
    const answer = await send(accessPath, { method: 'POST', body: `password=${'A'.repeat(3000)}` });
    expect(answer.status).toBe(413);
  });

  it('lets nothing through, and says why, when the password file can’t be read', async () => {
    await writeFile(join(dist, 'password'), 'hunter2\n');
    await openDoor(createPasswordStore(join(dist, 'password')));

    const answer = await send('/');
    expect(answer.status).toBe(500);
    expect(answer.body).toContain('holds no password Orynx can read');
    expect(answer.body).not.toContain(token);
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
