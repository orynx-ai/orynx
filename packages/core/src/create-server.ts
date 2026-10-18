import { homedir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { apiPrefix, tokenQueryParam, type ApiError } from '@devhub/contracts';
import { createEventBus, type EventBus } from './events/event-bus.ts';
import { ConnectionError } from './integrations/connection-error.ts';
import { createGitHubClient } from './integrations/github/client.ts';
import { createGitHubConnection } from './integrations/github/connection.ts';
import { createGhCli, type GhCli } from './integrations/github/gh.ts';
import { createJiraClient } from './integrations/jira/client.ts';
import { createJiraConnection } from './integrations/jira/connection.ts';
import { openInboxCache, type InboxCache } from './inbox/inbox-cache.ts';
import { startInboxSchedule } from './inbox/inbox-schedule.ts';
import { createInboxService } from './inbox/inbox-service.ts';
import { registerLocalOnly } from './plugins/local-only.ts';
import { createPreferencesService } from './preferences/preferences-service.ts';
import { createRepositoryService, FolderRejectedError } from './repositories/repository-service.ts';
import { eventsRoutes } from './routes/events.ts';
import { githubRoutes } from './routes/github.ts';
import { inboxRoutes } from './routes/inbox.ts';
import { jiraRoutes } from './routes/jira.ts';
import { preferencesRoutes } from './routes/preferences.ts';
import { repositoriesRoutes } from './routes/repositories.ts';
import { searchRoutes } from './routes/search.ts';
import { sessionsRoutes } from './routes/sessions.ts';
import { ticketsRoutes } from './routes/tickets.ts';
import { statusRoutes } from './routes/status.ts';
import { createSearchService } from './search/search-service.ts';
import type { Keychain } from './secrets/keychain.ts';
import { createMemoryKeychain } from './secrets/memory-keychain.ts';
import { createTokenStore, type EnvTokens, type TokenStore } from './secrets/token-store.ts';
import { createMemorySessionStore, type SessionStore } from './sessions/session-store.ts';
import { createMemorySettingsStore, type SettingsStore } from './settings/settings-store.ts';
import { createTicketsService } from './tickets/tickets-service.ts';
import { readGitUserName } from './status/git-user-name.ts';
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
  /** Where sessions are kept; an empty memory store until spec 011. */
  sessions?: SessionStore;
  /** Who is using DevHub; the name from `git config --global user.name` by default. */
  userName?: () => Promise<string | null>;
  /** Where tokens are saved. Hosts pass `createOsKeychain()`; tests get an empty in-memory keychain. */
  keychain?: Keychain;
  /** Tokens from `.env`, passed only when the user turned on DEVHUB_TOKENS_FROM_ENV. */
  envTokens?: EnvTokens;
  /** Settings kept between runs. Hosts pass the file under DEVHUB_HOME; tests get memory. */
  settings?: SettingsStore;
  /**
   * GitHub's command-line tool. Hosts pass one that searches their PATH; tests pass a folder with a
   * fake gh. Left out, gh is never found, so no test can start the real one (spec 004, AC-20).
   */
  gh?: GhCli;
  /** The person's home folder, which Settings › Repositories shows as `~`. The OS's by default. */
  userHome?: string;
  /** DEVHUB_HOME, which Settings › Repositories never adds. `~/.devhub` by default. */
  dataDir?: string;
  /**
   * The inbox's cache (spec 007). Hosts pass `<DEVHUB_HOME>/cache.db`; tests get one in memory. The server
   * closes it when it closes.
   */
  cache?: InboxCache;
  /**
   * Sync the inbox on its own: at start, every 2 minutes while a page is open, and when a tool connects
   * (spec 007). Hosts turn it on. Left off, only Refresh syncs, so no test reaches Jira or GitHub by surprise.
   */
  autoSync?: boolean;
}

/** The HTTP status for each error a connection route can answer with. */
const statusFor: Record<ConnectionError['code'], number> = {
  bad_request: 400,
  integration_rejected: 422,
  integration_unreachable: 502,
  keychain_unavailable: 503,
};

declare module 'fastify' {
  interface FastifyInstance {
    /** Jira, GitHub and Slack tokens (spec 002). Routes read them here; a token never leaves core. */
    tokens: TokenStore;
  }
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
    // A second guard behind client.ts, which never logs a request: an Authorization header holds a
    // Jira token in base64, wherever a log line might carry one (spec 003).
    redact: {
      // Header objects keep the casing they were given (axios, undici), so both spellings are listed.
      paths: [
        'authorization',
        'Authorization',
        'proxy-authorization',
        'Proxy-Authorization',
        'cookie',
        'Cookie',
        'x-devhub-token',
        'X-Devhub-Token',
      ].flatMap((name) => ['', '*.', '*.*.', '*.*.*.', '*.*.*.*.'].map((depth) => `${depth}headers["${name}"]`)),
      censor: '[redacted]',
    },
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
  // Nothing reads the keychain here: the first read happens when a route or the inbox's sync needs a token.
  app.decorate(
    'tokens',
    createTokenStore({
      keychain: options.keychain ?? createMemoryKeychain(),
      events,
      ...(options.envTokens === undefined ? {} : { envTokens: options.envTokens }),
    }),
  );
  const settings = options.settings ?? createMemorySettingsStore();
  const jiraClient = createJiraClient();
  const githubClient = createGitHubClient();
  const jira = createJiraConnection({
    settings,
    tokens: app.tokens,
    jira: jiraClient,
    events,
    envToken: options.envTokens?.jira !== undefined,
    onProblem: (problem) => {
      app.log.warn(
        { jira: problem },
        problem.kind === 'keychain_unavailable' ? 'The keychain could not be reached' : 'Jira did not accept the check',
      );
    },
    onError: (error) => {
      app.log.error(error, "Jira's status line failed");
    },
  });
  const github = createGitHubConnection({
    settings,
    tokens: app.tokens,
    github: githubClient,
    gh: options.gh ?? createGhCli({ searchPath: '' }),
    events,
    envToken: options.envTokens?.github !== undefined,
    onProblem: (problem) => {
      app.log.warn(
        { github: problem },
        problem.kind === 'keychain_unavailable' ? 'The keychain could not be reached' : 'The GitHub check failed',
      );
    },
    onError: (error) => {
      app.log.error(error, "GitHub's status line failed");
    },
  });
  const sessions = options.sessions ?? createMemorySessionStore();
  const preferences = createPreferencesService({ settings, events });
  const cache = options.cache ?? openInboxCache(':memory:');
  const tickets = createTicketsService({
    cache,
    settings,
    connection: jira,
    jira: jiraClient,
    sessions,
    onProblem: (problem) => {
      app.log.warn({ problem }, 'The sprint sync could not read Jira');
    },
    onError: (error) => {
      app.log.error(error, 'The sprint sync failed');
    },
  });
  const inbox = createInboxService({
    cache,
    settings,
    sprint: tickets,
    connections: { jira, github },
    jira: jiraClient,
    github: githubClient,
    sessions,
    preferences,
    events,
    onProblem: (tool, problem) => {
      app.log.warn({ tool, problem }, 'The inbox sync could not read this tool');
    },
    onError: (error) => {
      app.log.error(error, 'The inbox sync failed');
    },
  });
  const schedule =
    options.autoSync === true
      ? startInboxSchedule({
          inbox,
          settings,
          events,
          onError: (error) => {
            app.log.error(error, 'The inbox sync failed');
          },
        })
      : undefined;
  // One hook, in order: no new sync, then the running one ends, then the cache closes after its last write.
  app.addHook('onClose', async () => {
    schedule?.stop();
    await inbox.idle();
    cache.close();
  });
  const status = createStatusService({
    version: options.version,
    userName: options.userName ?? readGitUserName,
    jira: () => jira.status(),
    github: () => github.status(),
  });

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
        if (error instanceof FolderRejectedError) {
          const body: ApiError = { code: error.code, message: error.message };
          return reply.code(422).send(body);
        }
        if (error instanceof ConnectionError) {
          const body: ApiError = { code: error.code, message: error.message };
          return reply.code(statusFor[error.code]).send(body);
        }
        request.log.error(error);
        const body: ApiError = {
          code: 'internal',
          message: 'Something went wrong in the local server. See the terminal for details.',
        };
        return reply.code(500).send(body);
      });

      await api.register(statusRoutes, { status });
      await api.register(sessionsRoutes, { sessions });
      await api.register(jiraRoutes, { jira });
      await api.register(githubRoutes, { github });
      await api.register(preferencesRoutes, { preferences });
      await api.register(inboxRoutes, { inbox });
      await api.register(ticketsRoutes, { tickets });
      await api.register(searchRoutes, { search: createSearchService({ inbox, tickets, sessions }) });
      await api.register(repositoriesRoutes, {
        repositories: createRepositoryService({
          settings,
          events,
          home: options.userHome ?? homedir(),
          devhubHome: options.dataDir ?? join(homedir(), '.devhub'),
        }),
      });
      await api.register(eventsRoutes, {
        events,
        ...(options.eventsKeepAliveMs === undefined ? {} : { keepAliveMs: options.eventsKeepAliveMs }),
      });
    },
    { prefix: apiPrefix },
  );

  return app;
}
