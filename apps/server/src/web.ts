import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { apiPrefix } from '@devhub/contracts';

/** The placeholder apps/web/index.html ships with; the server fills in the token. */
export const tokenMetaPlaceholder = '<meta name="devhub-token" content="" />';

export function injectToken(html: string, token: string): string {
  if (!html.includes(tokenMetaPlaceholder)) {
    throw new Error('index.html has no devhub-token meta tag; the page could not call the API.');
  }
  return html.replace(tokenMetaPlaceholder, `<meta name="devhub-token" content="${token}" />`);
}

/**
 * Serves the built web app (apps/web/dist) with the token injected into index.html.
 * Every non-API GET that is not a file gets index.html, so client routes like /tickets work on reload.
 */
export async function serveWeb(app: FastifyInstance, options: { distDir: string; token: string }): Promise<void> {
  const indexPath = join(options.distDir, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error(`No web build at ${options.distDir}. Run "pnpm build" first, or use "pnpm dev".`);
  }
  const indexHtml = injectToken(await readFile(indexPath, 'utf8'), options.token);

  await app.register(fastifyStatic, { root: options.distDir, index: false, wildcard: true });

  app.setNotFoundHandler((request, reply) => {
    if (request.method !== 'GET' || request.url.startsWith(`${apiPrefix}/`)) {
      return reply.code(404).send({ code: 'not_found', message: `Nothing at ${request.method} ${request.url}.` });
    }
    return reply.type('text/html; charset=utf-8').header('cache-control', 'no-store').send(indexHtml);
  });

  app.get('/', (_request, reply) =>
    reply.type('text/html; charset=utf-8').header('cache-control', 'no-store').send(indexHtml),
  );
}
