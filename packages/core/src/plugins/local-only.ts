import { timingSafeEqual } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { apiPrefix, apiRoutes, tokenHeader, tokenQueryParam, type ApiError } from '@devhub/contracts';

export interface LocalOnlyOptions {
  /** The per-start session token the page carries in <meta name="devhub-token">. */
  token: string;
  /** The port the server was asked to listen on; the real port is used once listening. */
  port: number;
}

/**
 * Keeps the hub private to this laptop (spec: "Safety rules built in"; learn/local-security.md).
 *
 * 1. Host check on every request: a DNS-rebinding page on evil.example that resolves to
 *    127.0.0.1 sends `Host: evil.example:4317`, so it can never read index.html or the token.
 * 2. Token check on every /api request, so other sites and local processes that cannot read
 *    the page cannot call the API.
 *
 * Added to the root instance (not an encapsulated plugin) so it also guards the static files
 * the host registers later.
 */
export function registerLocalOnly(app: FastifyInstance, options: LocalOnlyOptions): void {
  const expected = Buffer.from(options.token);

  const allowedHosts = (): Set<string> => {
    const address: AddressInfo | string | null = app.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : options.port;
    return new Set([`127.0.0.1:${String(port)}`, `localhost:${String(port)}`]);
  };

  const tokenMatches = (candidate: string | undefined): boolean => {
    if (candidate === undefined) return false;
    const given = Buffer.from(candidate);
    return given.length === expected.length && timingSafeEqual(given, expected);
  };

  app.addHook('onRequest', async (request, reply) => {
    if (!allowedHosts().has(request.headers.host ?? '')) {
      const body: ApiError = {
        code: 'forbidden_host',
        message: 'Orynx only answers on 127.0.0.1 or localhost.',
      };
      return reply.code(403).send(body);
    }

    const url = new URL(request.url, 'http://127.0.0.1');
    // Decide on the path the router uses, not the raw URL: the router decodes `/%61pi/status`
    // to /api/status, so a raw-URL check alone would let an encoded path skip the token.
    const paths = [url.pathname, decodedPath(url.pathname), request.routeOptions.url];
    if (!paths.some(isApiPath)) return;

    const header = request.headers[tokenHeader];
    const fromHeader = typeof header === 'string' ? header : undefined;
    const fromQuery = paths.includes(apiRoutes.events)
      ? (url.searchParams.get(tokenQueryParam) ?? undefined)
      : undefined;

    if (!tokenMatches(fromHeader ?? fromQuery)) {
      const body: ApiError = {
        code: 'unauthorized',
        message: 'Orynx restarted or this page is out of date. Reload the page.',
      };
      return reply.code(401).send(body);
    }
  });
}

function isApiPath(path: string | undefined): boolean {
  return path === apiPrefix || (path?.startsWith(`${apiPrefix}/`) ?? false);
}

/** The path as the router sees it; a malformed escape stays as it is (the router answers 400). */
function decodedPath(pathname: string): string {
  try {
    return decodeURI(pathname);
  } catch {
    return pathname;
  }
}
