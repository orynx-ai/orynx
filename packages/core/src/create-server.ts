import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { apiPrefix, tokenQueryParam, type ApiError, type TicketColumn } from '@devhub/contracts';
import { createClaudeCode, type ClaudeCode } from './agents/claude/claude-code.ts';
import { createClaudeLogin } from './agents/claude/claude-login.ts';
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
import { createSyncActivityService } from './inbox/sync-activity-service.ts';
import { registerLocalOnly } from './plugins/local-only.ts';
import { createNotificationService } from './notifications/notification-service.ts';
import { createNotificationSettingsService } from './notifications/notification-settings.ts';
import { createPreferencesService } from './preferences/preferences-service.ts';
import { createRepositoryService, FolderRejectedError } from './repositories/repository-service.ts';
import { createSkillStore, orynxSkillsFolder, SkillRejectedError } from './skills/skill-store.ts';
import { orynxSkillUses } from './skills/skill-uses.ts';
import {
  createFilePicker,
  createFolderPicker,
  type FilePicker,
  type FolderPicker,
} from './folder-picker/folder-picker.ts';
import { agentRoutes } from './routes/agent.ts';
import { claudeRoutes } from './routes/claude.ts';
import { eventsRoutes } from './routes/events.ts';
import { githubRoutes } from './routes/github.ts';
import { inboxRoutes } from './routes/inbox.ts';
import { syncActivityRoutes } from './routes/sync-activity.ts';
import { jiraRoutes } from './routes/jira.ts';
import { notificationsRoutes } from './routes/notifications.ts';
import { preferencesRoutes } from './routes/preferences.ts';
import { repositoriesRoutes } from './routes/repositories.ts';
import { filesRoutes } from './routes/files.ts';
import { orynxSkillsRoutes } from './routes/orynx-skills.ts';
import { skillsRoutes } from './routes/skills.ts';
import { createSkillsService } from './skills/skills-service.ts';
import { folderPickerRoutes } from './routes/folder-picker.ts';
import { searchRoutes } from './routes/search.ts';
import { sessionsRoutes } from './routes/sessions.ts';
import { terminalRoutes } from './routes/terminal.ts';
import { ticketsRoutes } from './routes/tickets.ts';
import { statusRoutes } from './routes/status.ts';
import { createSearchService } from './search/search-service.ts';
import type { Keychain } from './secrets/keychain.ts';
import { createMemoryKeychain } from './secrets/memory-keychain.ts';
import { createTokenStore, type EnvTokens, type TokenStore } from './secrets/token-store.ts';
import { createClaudeAdapter, type QueryFunction } from './agents/claude/claude-adapter.ts';
import { sandboxSettings } from './agents/claude/sandbox.ts';
import { createChangesReader } from './sessions/changes.ts';
import { createContextReader } from './sessions/context-reader.ts';
import { createSessionService } from './sessions/session-service.ts';
import { createMemorySessionStore, type SessionRecords } from './sessions/session-store.ts';
import { createTerminalService } from './terminal/terminal-service.ts';
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
  /** Where sessions are kept. Hosts pass the store under DEVHUB_HOME (spec 011); tests get memory. */
  sessions?: SessionRecords;
  /**
   * What runs Claude in a session (spec 011): the Agent SDK's `query()`, the Claude Code to run and the
   * allow-listed environment. Hosts pass the SDK's; tests pass a fake. Left out, no session can start, so no
   * test can run the real Claude Code (AC-22).
   */
  agent?: {
    query: QueryFunction;
    program: string;
    env: Readonly<Record<string, string>>;
    /** Claude Code's sandbox can run here (spec 012, Q2b). Left out, sessions get no commands. */
    sandbox?: boolean;
  };
  /** The environment a session's git runs with, from `gitEnvironment()`. Empty by default. */
  gitEnvironment?: Readonly<Record<string, string>>;
  /**
   * Your shell tabs in a session's Terminal (spec 036, spec 038), with the environment your shells get, from
   * `terminalEnvironment()`. Left out (Windows, and tests that don't need one), no session offers its Terminal.
   */
  terminal?: { env: Readonly<Record<string, string>> };
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
  /**
   * Claude Code, for its login check (spec 010). Hosts pass the one in the Claude Agent SDK; tests pass a
   * fake. Left out, no program is found, so no test can start the real one (AC-12).
   */
  claudeCode?: ClaudeCode;
  /**
   * The computer's folder picker, for Choose folder (spec 020). Hosts pass one that searches their PATH;
   * tests pass a folder with a fake one. Left out, none is found, so no test opens a real picker.
   */
  folderPicker?: FolderPicker;
  /** The computer's file picker, for the composer's File from this computer (spec 022); found as the folder one is. */
  filePicker?: FilePicker;
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

const pathInUrl = /([?&]path=)[^&#]*/g;

/** A changed file's diff is asked for by its path, which must never reach the terminal either (spec 013, AC-23). */
export function redactPath(url: string): string {
  return url.replace(pathInUrl, '$1[redacted]');
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
      req: (request: { method: string; url: string }) => ({
        method: request.method,
        url: redactPath(redactToken(request.url)),
      }),
    },
  };
}

/**
 * Builds the hub: security, then every /api route. The host (apps/server, or a future
 * desktop main process) adds static files and calls listen() on 127.0.0.1.
 */
/** An error Fastify raised about the request itself, with the status it chose. */
function isFastifyError(error: unknown): error is { code: string; statusCode: number; message: string } {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('FST_ERR_') &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
  );
}

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
  const claude = createClaudeLogin({
    // No program, so the folder is never made and nothing runs.
    claudeCode: options.claudeCode ?? createClaudeCode({ program: null, env: {}, workFolder: tmpdir() }),
    events,
    // Which of the four it was, and the exit code: never the output, the email or the organisation (AC-6).
    onProblem: (problem) => {
      app.log.warn({ claude: problem }, "Claude Code's login check failed");
    },
  });
  const sessions = options.sessions ?? createMemorySessionStore();
  const preferences = createPreferencesService({ settings, events });
  const cache = options.cache ?? openInboxCache(':memory:');
  // Spec 029: what sessions and syncs raise. Its failures go to the terminal as the error alone, never the text.
  const notifications = createNotificationService({
    cache,
    events,
    onError: (error) => {
      app.log.error(error, 'A notification could not be saved');
    },
  });
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
    onSynced: (tool, before, after) => {
      notifications.inboxSynced(tool, before, after);
    },
  });
  const syncActivity = createSyncActivityService({ cache, states: async () => (await inbox.records()).tools });
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
  const userHome = options.userHome ?? homedir();
  const devhubHome = options.dataDir ?? join(homedir(), '.devhub');
  const repositories = createRepositoryService({ settings, events, home: userHome, devhubHome });
  const skills = createSkillsService({ repositories, home: userHome, orynx: orynxSkillsFolder(devhubHome) });
  const orynxSkills = createSkillStore({
    devhubHome,
    home: userHome,
    events,
    uses: () => orynxSkillUses(sessions),
  });
  const adapter =
    options.agent === undefined
      ? null
      : createClaudeAdapter({
          query: options.agent.query,
          program: options.agent.program,
          env: options.agent.env,
          home: userHome,
          // Every command runs sandboxed, writing only in its own worktree (spec 012, Q2a).
          sandbox:
            options.agent.sandbox === true
              ? (worktree) =>
                  sandboxSettings({
                    platform: process.platform,
                    worktree,
                    devhubHome,
                    home: userHome,
                    temporary: tmpdir(),
                  })
              : null,
        });
  const terminal =
    options.terminal === undefined
      ? null
      : createTerminalService({ events, env: options.terminal.env, home: userHome });
  if (terminal !== null) {
    // Nothing you started in a Terminal outlives Orynx.
    app.addHook('onClose', () => terminal.close());
  }
  const sessionService = createSessionService({
    skills,
    records: sessions,
    repositories,
    claude,
    connection: jira,
    jira: jiraClient,
    context: createContextReader({
      home: userHome,
      jira: jiraClient,
      jiraConnection: jira,
      github: githubClient,
      githubConnection: github,
    }),
    describeTicket: async (key) => {
      // A status with no name is left out: the Ticket tab can't word it (spec 013).
      const status = (name: string, column: TicketColumn) => (name === '' ? null : { name, column });
      const sprint = await tickets.read();
      const ticket = sprint.tickets.find((candidate) => candidate.key === key);
      if (ticket !== undefined) {
        return {
          title: ticket.title,
          sprint: sprint.sprint?.name ?? null,
          status: status(ticket.status, ticket.column),
          dueDate: ticket.dueDate,
        };
      }
      const assigned = (await inbox.records()).jira.find((record) => record.key === key);
      return assigned === undefined
        ? null
        : {
            title: assigned.summary,
            sprint: null,
            status: status(assigned.status, assigned.category),
            dueDate: assigned.dueDate,
          };
    },
    preferences,
    worktrees: { env: options.gitEnvironment ?? {}, root: join(devhubHome, 'worktrees') },
    changes: createChangesReader({ env: options.gitEnvironment ?? {} }),
    // The pull request's token, the gh way or the token way, and the client that opens it (spec 014).
    github,
    githubClient,
    adapter,
    events,
    ...(terminal === null ? {} : { terminal }),
    onChange: (before, after, change) => {
      notifications.sessionChanged(before, after, change);
    },
    // Kinds, ids and codes only: never the ticket's text or Claude's words (AC-21).
    onReport: (report) => {
      switch (report.what) {
        case 'started':
          app.log.info(report, 'Claude started a session');
          return;
        case 'asked':
          app.log.info(report, 'Claude is waiting for an answer');
          return;
        case 'answered':
          app.log.info(report, 'A waiting call ended');
          return;
        case 'failed':
          app.log.warn(report, 'A session stopped with a problem');
          return;
        case 'followed_up':
          app.log.info(report, 'You sent Claude a follow-up');
          return;
        case 'pull_request':
          app.log.info(report, report.step === 'create' ? 'Create pull request ended' : 'Push changes ended');
          return;
      }
    },
  });
  app.addHook('onClose', async () => {
    await sessionService.close();
  });
  const status = createStatusService({
    version: options.version,
    userName: options.userName ?? readGitUserName,
    jira: () => jira.status(),
    github: () => github.status(),
    claude: () => claude.connected(),
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
        if (error instanceof FolderRejectedError || error instanceof SkillRejectedError) {
          const body: ApiError = { code: error.code, message: error.message };
          return reply.code(422).send(body);
        }
        if (error instanceof ConnectionError) {
          const body: ApiError = { code: error.code, message: error.message };
          return reply.code(statusFor[error.code]).send(body);
        }
        // Fastify's own refusals of a request, such as a body over the route's limit (413) or JSON it can't read.
        if (isFastifyError(error) && error.statusCode >= 400 && error.statusCode < 500) {
          const body: ApiError = { code: 'bad_request', message: error.message };
          return reply.code(error.statusCode).send(body);
        }
        request.log.error(error);
        const body: ApiError = {
          code: 'internal',
          message: 'Something went wrong in the local server. See the terminal for details.',
        };
        return reply.code(500).send(body);
      });

      await api.register(statusRoutes, { status });
      await api.register(sessionsRoutes, { sessions, service: sessionService });
      if (terminal !== null) await api.register(terminalRoutes, { sessions, terminal });
      await api.register(jiraRoutes, { jira });
      await api.register(githubRoutes, { github });
      await api.register(claudeRoutes, { claude });
      await api.register(agentRoutes, {
        // Signed out, Claude Code has nothing to offer, so it isn't started.
        models: async () =>
          adapter === null || !(await claude.connected()) ? { state: 'unavailable' } : adapter.models(),
      });
      await api.register(preferencesRoutes, { preferences });
      await api.register(notificationsRoutes, {
        notifications,
        settings: createNotificationSettingsService({ settings, events }),
      });
      await api.register(inboxRoutes, { inbox });
      await api.register(syncActivityRoutes, { syncActivity });
      await api.register(ticketsRoutes, { tickets, inbox, jira });
      await api.register(searchRoutes, { search: createSearchService({ inbox, tickets, sessions }) });
      await api.register(repositoriesRoutes, { repositories });
      await api.register(skillsRoutes, { skills });
      await api.register(folderPickerRoutes, {
        picker: options.folderPicker ?? createFolderPicker({ searchPath: '', platform: process.platform }),
        home: userHome,
      });
      await api.register(orynxSkillsRoutes, { store: orynxSkills });
      await api.register(filesRoutes, {
        picker: options.filePicker ?? createFilePicker({ searchPath: '', platform: process.platform }),
        home: userHome,
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
