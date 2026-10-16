import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { apiPrefix, tokenQueryParam, type ApiError } from '@devhub/contracts';
import { createEventBus, type EventBus } from './events/event-bus.ts';
import { registerLocalOnly } from './plugins/local-only.ts';
import { eventsRoutes } from './routes/events.ts';
import { statusRoutes } from './routes/status.ts';
import { createStatusService } from './status/status-service.ts';

export interface CoreOptions {
  /** Per-start session token; every /api request must carry it. */
  token: string;
  /** Port the host will listen on (always on 127.0.0.1). */
  port: number;
  /** DevHub version shown in GET /api/status. */
  version: string;
  logger?: FastifyServerOptions['logger'];
  /** Pass a bus to publish events from outside, for example from a test. */
  events?: EventBus;
  /** Keep-alive interval for the event stream. */
  eventsKeepAliveMs?: number;
}

const tokenInUrl = new RegExp(`([?&]${tokenQueryParam}=)[^&#]*`, 'g');

/** The event stream carries the token in its URL; it must never reach the terminal or a log file. */
export function redactToken(url: string): string {
  return url.replace(tokenInUrl, '$1[redacted]');
}

function withTokenRedaction(logger: CoreOptions['logger']): NonNullable<FastifyServerOptions['logger']> {
  if (logger === undefined || logger === false) return false;
  const base = logger === true ? {} : logger;
  return {
    ...base,
    serializers: {
      ...base.serializers,
      req: (request: { method: string; url: string }) => ({ method: request.method, url: redactToken(request.url) }),
    },
  };
}

/**
 * Builds the hub: security, then every /api route. The host (apps/server, or a future
 * desktop main process) adds static files and calls listen() on 127.0.0.1.
 */
export async function createServer(options: CoreOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: withTokenRedaction(options.logger) });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerLocalOnly(app, { token: options.token, port: options.port });

  const events = options.events ?? createEventBus();
  const status = createStatusService({ version: options.version });

  await app.register(
    async (api) => {
      api.setNotFoundHandler((request, reply) => {
        const body: ApiError = { code: 'not_found', message: `No API route for ${request.method} ${request.url}.` };
        return reply.code(404).send(body);
      });

      api.setErrorHandler((error, request, reply) => {
        if (hasZodFastifySchemaValidationErrors(error)) {
          const body: ApiError = { code: 'bad_request', message: error.message };
          return reply.code(400).send(body);
        }
        request.log.error(error);
        const body: ApiError = {
          code: 'internal',
          message: 'Something went wrong in the local server. See the terminal for details.',
        };
        return reply.code(500).send(body);
      });

      await api.register(statusRoutes, { status });
      await api.register(eventsRoutes, {
        events,
        ...(options.eventsKeepAliveMs === undefined ? {} : { keepAliveMs: options.eventsKeepAliveMs }),
      });
    },
    { prefix: apiPrefix },
  );

  return app;
}
