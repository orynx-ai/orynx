import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import type { ApiError } from '@devhub/contracts';
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

// Crockford's base32 (no I, L, O or U to misread). 12 characters are 60 bits: too many to guess over a network.
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function createAccessCode(): string {
  const chars = [...randomBytes(12)].map((byte) => alphabet[byte % 32]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

/** Upper case, without the dashes and spaces people type or leave out. */
function normalize(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export const accessCodeFile = (home: string): string => join(home, 'lan-access-code');

/** The code in DEVHUB_HOME/lan-access-code (0600), made on first use. Delete the file and restart for a new one. */
export async function readAccessCode(home: string): Promise<string> {
  const path = accessCodeFile(home);
  try {
    const code = (await readFile(path, 'utf8')).trim();
    if (normalize(code).length < 12) throw new Error(`${path} holds no access code. Delete it and restart Orynx.`);
    return code;
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const code = createAccessCode();
  await mkdir(home, { recursive: true, mode: 0o700 });
  await writeFile(path, `${code}\n`, { mode: 0o600 });
  return code;
}

/** Loopback, or one of this computer's own addresses: opening https://orynx.local here needs no code. */
export function fromThisComputer(address: string | undefined): boolean {
  return Object.values(networkInterfaces())
    .flat()
    .some((info) => info !== undefined && info.address === address);
}

export interface FrontDoorOptions {
  code: string;
  /** The built web app, for the public files above. */
  distDir: string;
  /** `127.0.0.1:<port>`: the Host the hub accepts. */
  hubHost: string;
  /** Hands an allowed request to the hub: Fastify's `app.routing`. */
  forward: (request: IncomingMessage, response: ServerResponse) => void;
  fromThisComputer?: (address: string | undefined) => boolean;
}

/**
 * https://orynx.local (spec 040). The hub itself stays on 127.0.0.1; this lets a request through only from
 * this computer or from a device that entered the access code, so the page and its session token never
 * reach anyone else on the wifi. Without the code nothing reaches the hub.
 */
export function frontDoor(options: FrontDoorOptions): (request: IncomingMessage, response: ServerResponse) => void {
  const expected = Buffer.from(normalize(options.code));
  const matches = (candidate: string | undefined): boolean => {
    const given = Buffer.from(normalize(candidate ?? ''));
    return given.length === expected.length && timingSafeEqual(given, expected);
  };
  const isLocal = options.fromThisComputer ?? fromThisComputer;

  return (request, response) => {
    // DNS rebinding (learn/local-security.md): a page on evil.example that resolves here sends its own Host.
    if (request.headers.host !== lanHost && request.headers.host !== `${lanHost}:443`) {
      sendJson(response, 403, { code: 'forbidden_host', message: `Open Orynx at https://${lanHost}.` });
      return;
    }
    // The raw path, never a parsed URL: `//x/manifest.webmanifest` must not count as a public file.
    const path = (request.url ?? '/').split('?')[0] ?? '/';
    const type = publicFiles[path];
    if (type !== undefined) {
      void sendFile(response, join(options.distDir, path), type);
      return;
    }
    if (isLocal(request.socket.remoteAddress) || matches(readCookie(request.headers.cookie))) {
      // The hub checks the Host as for any request to 127.0.0.1; this one passed the check above.
      request.headers.host = options.hubHost;
      options.forward(request, response);
      return;
    }
    if (request.method === 'POST' && path === accessPath) {
      void signIn(request, response, matches);
      return;
    }
    if (request.method === 'GET') {
      sendPage(response, false);
      return;
    }
    sendJson(response, 401, { code: 'unauthorized', message: `Enter the access code at https://${lanHost} first.` });
  };
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
  const code = await readAccessCode(options.home);
  const secure = createHttpsServer(
    { key, cert },
    frontDoor({
      code,
      distDir: options.distDir,
      hubHost: `127.0.0.1:${String(options.hubPort)}`,
      forward: options.forward,
    }),
  );
  const plain = createHttpServer(plainDoor(ca));
  await Promise.all([listen(secure, 443), listen(plain, 80)]);
  const stopAnnouncing = announce({ platform: options.platform, log: options.log });
  options.log.info(
    `Orynx is open to your wifi at https://${lanHost}. Other devices need the code in ${accessCodeFile(options.home)}.`,
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

async function signIn(
  request: IncomingMessage,
  response: ServerResponse,
  matches: (code: string | undefined) => boolean,
): Promise<void> {
  let body = '';
  request.setEncoding('utf8');
  for await (const chunk of request) {
    body += String(chunk);
    if (body.length > 2048) {
      sendJson(response, 413, { code: 'bad_request', message: 'That is too long for an access code.' });
      return;
    }
  }
  const code = new URLSearchParams(body).get('code') ?? undefined;
  if (!matches(code)) {
    sendPage(response, true);
    return;
  }
  response
    .writeHead(303, {
      location: '/',
      // HttpOnly: no script reads it. Lax: other sites can't post with it, and the API wants the session token too.
      'set-cookie': `${accessCookie}=${normalize(code ?? '')}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
    })
    .end();
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

function sendPage(response: ServerResponse, wrongCode: boolean): void {
  response
    .writeHead(401, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    .end(accessPage(wrongCode));
}

// System colours (Canvas, CanvasText), so it follows light and dark without the app's styles.
const accessPage = (wrongCode: boolean): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <title>Orynx</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 16px/1.5 system-ui, sans-serif; background: Canvas; color: CanvasText; }
      form { display: grid; gap: 12px; width: min(360px, calc(100vw - 32px)); }
      h1 { margin: 0; font-size: 24px; font-weight: 500; }
      p { margin: 0; }
      input, button { font: inherit; padding: 8px 12px; border: 1px solid GrayText; border-radius: 8px; }
      button { background: CanvasText; color: Canvas; border-color: CanvasText; cursor: pointer; }
    </style>
  </head>
  <body>
    <form method="post" action="${accessPath}">
      <h1>Enter the access code</h1>
      <p>./install.sh printed it on the computer that runs Orynx. It's also in ~/.devhub/lan-access-code there.</p>
      ${wrongCode ? '<p role="alert">That code doesn’t match. Check it and try again.</p>' : ''}
      <label for="code">Access code</label>
      <input id="code" name="code" required autofocus autocomplete="off" autocapitalize="characters" spellcheck="false" />
      <button type="submit">Open Orynx</button>
    </form>
  </body>
</html>
`;
