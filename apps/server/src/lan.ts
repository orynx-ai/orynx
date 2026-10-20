import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import type { ApiError } from '@devhub/contracts';
import type { PasswordStore } from '@devhub/core';
import { announce, lanHost } from './announce.ts';

export const accessCookie = 'orynx_access';
export const accessPath = '/orynx-access';
/** Over plain http, so a device can fetch it before it trusts https://orynx.local. */
export const caPath = '/orynx-ca.crt';

/** Files a browser fetches without cookies (a manifest is fetched with none). None holds the session token. */
const publicFiles: Record<string, string> = {
  '/manifest.webmanifest': 'application/manifest+json',
  '/icon-192.png': 'image/png',
  '/icon-512.png': 'image/png',
  '/apple-touch-icon.png': 'image/png',
  '/favicon.svg': 'image/svg+xml',
};

/** Spec 043, Q7: this many tries within the window, from every device together, and the door stops checking. */
export const maxTries = 10;
export const triesWindowMs = 15 * 60_000;

/** Loopback, or one of this computer's own addresses: opening https://orynx.local here needs no code. */
export function fromThisComputer(address: string | undefined): boolean {
  return Object.values(networkInterfaces())
    .flat()
    .some((info) => info !== undefined && info.address === address);
}

export interface FrontDoorOptions {
  /** The password chosen in Set up Orynx (spec 043), shared with the hub, which saves it. */
  password: PasswordStore;
  /** The built web app, for the public files above. */
  distDir: string;
  /** `127.0.0.1:<port>`: the Host the hub accepts. */
  hubHost: string;
  /** Hands an allowed request to the hub: Fastify's `app.routing`. */
  forward: (request: IncomingMessage, response: ServerResponse) => void;
  fromThisComputer?: (address: string | undefined) => boolean;
}

/**
 * https://orynx.local (spec 040). The hub itself stays on 127.0.0.1; this lets a request through only from this
 * computer or from a device that entered the password chosen in Set up Orynx (spec 043), so the page and its session
 * token never reach anyone else on the wifi. Until a password is saved, no other device gets through at all, so
 * nobody on the wifi can choose it first.
 */
export function frontDoor(options: FrontDoorOptions): (request: IncomingMessage, response: ServerResponse) => void {
  const isLocal = options.fromThisComputer ?? fromThisComputer;
  // When each try in the window was made: every wrong one, and each one still being checked.
  const tries: number[] = [];

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    // DNS rebinding (learn/local-security.md): a page on evil.example that resolves here sends its own Host.
    if (request.headers.host !== lanHost && request.headers.host !== `${lanHost}:443`) {
      sendJson(response, 403, { code: 'forbidden_host', message: `Open Orynx at https://${lanHost}.` });
      return;
    }
    // The raw path, never a parsed URL: `//x/manifest.webmanifest` must not count as a public file.
    const path = (request.url ?? '/').split('?')[0] ?? '/';
    const type = publicFiles[path];
    if (type !== undefined) {
      await sendFile(response, join(options.distDir, path), type);
      return;
    }
    const forward = () => {
      // The hub checks the Host as for any request to 127.0.0.1; this one passed the check above.
      request.headers.host = options.hubHost;
      options.forward(request, response);
    };
    // Before the password is read, so even a broken password file never locks this computer out.
    if (isLocal(request.socket.remoteAddress)) {
      forward();
      return;
    }
    const secret = await options.password.cookie();
    if (secret !== null && matches(readCookie(request.headers.cookie), secret)) {
      forward();
      return;
    }
    if (secret === null) {
      if (request.method === 'GET') sendPage(response, 401, setupPage);
      else
        sendJson(response, 401, { code: 'unauthorized', message: 'Set up Orynx on the computer that runs it first.' });
      return;
    }
    if (request.method === 'POST' && path === accessPath) {
      await signIn(request, response);
      return;
    }
    if (request.method === 'GET') {
      sendPage(response, 401, passwordPage(null));
      return;
    }
    sendJson(response, 401, { code: 'unauthorized', message: `Enter your password at https://${lanHost} first.` });
  }

  async function signIn(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await readForm(request);
    if (body === null) {
      sendJson(response, 413, { code: 'bad_request', message: 'That is too long for a password.' });
      return;
    }
    const now = Date.now();
    while (tries[0] !== undefined && tries[0] <= now - triesWindowMs) tries.shift();
    // Counted before the check, so many tries sent at once can't all slip in under the limit.
    if (tries.length >= maxTries) {
      sendPage(response, 429, passwordPage('too_many'));
      return;
    }
    tries.push(now);
    if (!(await options.password.verify(body.get('password') ?? ''))) {
      sendPage(response, 401, passwordPage('wrong'));
      return;
    }
    tries.splice(tries.indexOf(now), 1);
    const secret = await options.password.cookie();
    response
      .writeHead(303, {
        location: '/',
        // HttpOnly: no script reads it. Lax: other sites can't post with it, and the API wants the session token too.
        // It holds a secret made from the saved hash, never the password, and a new password changes it.
        'set-cookie': `${accessCookie}=${secret ?? ''}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
      })
      .end();
  }

  return (request, response) => {
    handle(request, response).catch((error: unknown) => {
      // The password file can't be read: say so, as the hub would, and let nothing through.
      sendJson(response, 500, { code: 'internal', message: error instanceof Error ? error.message : String(error) });
    });
  };
}

function matches(given: string | undefined, secret: string): boolean {
  const a = Buffer.from(given ?? '');
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The posted form, or null when it's longer than any password. */
async function readForm(request: IncomingMessage): Promise<URLSearchParams | null> {
  let body = '';
  request.setEncoding('utf8');
  for await (const chunk of request) {
    body += String(chunk);
    if (body.length > 2048) return null;
  }
  return new URLSearchParams(body);
}

/** http://orynx.local: the certificate to trust, and a redirect to https for everything else. */
export function plainDoor(ca: Buffer): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    if ((request.url ?? '/').split('?')[0] === caPath) {
      response.writeHead(200, { 'content-type': 'application/x-x509-ca-cert' }).end(ca);
      return;
    }
    response.writeHead(302, { location: `https://${lanHost}${request.url ?? '/'}` }).end();
  };
}

export interface LanOptions {
  home: string;
  password: PasswordStore;
  distDir: string;
  hubPort: number;
  forward: FrontDoorOptions['forward'];
  platform: NodeJS.Platform;
  log: { info(message: string): void; warn(message: string): void };
}

/** Opens https://orynx.local (443) and http://orynx.local (80) to your wifi and announces the name. Returns stop. */
export async function startLan(options: LanOptions): Promise<() => void> {
  const tls = join(options.home, 'tls');
  const [key, cert, ca] = await Promise.all([
    readFile(join(tls, 'orynx.key')),
    readFile(join(tls, 'orynx.crt')),
    readFile(join(tls, 'ca.crt')),
  ]).catch(() => {
    throw new Error(`DEVHUB_LAN is on, but ${tls} has no certificate. Run ./install.sh to make one.`);
  });
  const secure = createHttpsServer(
    { key, cert },
    frontDoor({
      password: options.password,
      distDir: options.distDir,
      hubHost: `127.0.0.1:${String(options.hubPort)}`,
      forward: options.forward,
    }),
  );
  const plain = createHttpServer(plainDoor(ca));
  await Promise.all([listen(secure, 443), listen(plain, 80)]);
  const stopAnnouncing = announce({ platform: options.platform, log: options.log });
  options.log.info(
    (await options.password.isSet())
      ? `Orynx is open to your wifi at https://${lanHost}. Other devices ask for your Orynx password.`
      : `Orynx is open to your wifi at https://${lanHost} once you set it up: open Orynx on this computer first.`,
  );
  return () => {
    stopAnnouncing();
    for (const server of [secure, plain]) {
      server.closeAllConnections();
      server.close();
    }
  };
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', (error) => {
      reject(new Error(`Orynx can't listen on port ${String(port)} for ${lanHost}: ${error.message}`));
    });
    // Every address, so the wifi reaches it. macOS lets any user listen below 1024 this way; Linux needs install.sh's sysctl.
    server.listen(port, '0.0.0.0', resolve);
  });
}

function readCookie(header: string | undefined): string | undefined {
  return header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${accessCookie}=`))
    ?.slice(accessCookie.length + 1);
}

async function sendFile(response: ServerResponse, path: string, type: string): Promise<void> {
  try {
    const file = await readFile(path);
    response.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' }).end(file);
  } catch {
    sendJson(response, 404, {
      code: 'not_found',
      message: 'This Orynx build has no such file. Run ./install.sh again.',
    });
  }
}

function sendJson(response: ServerResponse, status: number, body: ApiError): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
}

function sendPage(response: ServerResponse, status: number, html: string): void {
  response.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html);
}

// System colours (Canvas, CanvasText), so it follows light and dark without the app's styles.
const page = (body: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <title>Orynx</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 16px/1.5 system-ui, sans-serif; background: Canvas; color: CanvasText; }
      main, form { display: grid; gap: 12px; width: min(360px, calc(100vw - 32px)); }
      h1 { margin: 0; font-size: 24px; font-weight: 500; }
      p { margin: 0; }
      input, button { font: inherit; padding: 8px 12px; border: 1px solid GrayText; border-radius: 8px; }
      button { background: CanvasText; color: Canvas; border-color: CanvasText; cursor: pointer; }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>
`;

const problems = {
  wrong: 'That password doesn’t match. Try again.',
  too_many: 'Too many wrong passwords. Try again in 15 minutes.',
} as const;

const passwordPage = (problem: keyof typeof problems | null): string =>
  page(`<form method="post" action="${accessPath}">
      <h1>Enter your password</h1>
      <p>The one you chose when you set up Orynx.</p>
      ${problem === null ? '' : `<p role="alert">${problems[problem]}</p>`}
      <label for="password">Password</label>
      <input id="password" name="password" type="password" required autofocus autocomplete="current-password" />
      <button type="submit">Open Orynx</button>
    </form>`);

const setupPage = page(`<main>
      <h1>Finish setting up Orynx</h1>
      <p>Open Orynx on the computer that runs it and choose a password. Then come back here.</p>
    </main>`);
