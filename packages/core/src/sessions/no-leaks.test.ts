import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, tokenHeader, type ServerEvent } from '@devhub/contracts';
import { agentEnvironment, gitEnvironment } from '../agents/agent-environment.ts';
import type { QueryFunction } from '../agents/claude/claude-adapter.ts';
import { createClaudeCode } from '../agents/claude/claude-code.ts';
import { sessionToolsWithoutCommands } from '../agents/claude/tool-decision.ts';
import { createServer } from '../create-server.ts';
import { createEventBus } from '../events/event-bus.ts';
import type { Keychain } from '../secrets/keychain.ts';
import { createFileSettingsStore, settingsFilePath } from '../settings/settings-store.ts';
import { claudeEmail, claudeOrganisation, useFakeClaudeFolder } from '../test/fake-claude.ts';
import { fakeClaudeSdk, type FakeClaudeSdk, type FakeTurn } from '../test/fake-claude-sdk.ts';
import { acceptingPullContext, acceptingPullDiff, githubToken } from '../test/fake-github.ts';
import { acceptingIssue, goodToken, jiraEmail, jiraSite, useFakeJira } from '../test/fake-jira.ts';
import { gitSearchPath, useTestRepositories } from '../test/git-repository.ts';
import { openFileSessionStore } from './file-session-store.ts';

vi.setConfig({ testTimeout: 30_000 });

const jira = useFakeJira();
const repositories = useTestRepositories();
const fakeClaudeFolder = useFakeClaudeFolder();
const sessionToken = 'leaks-session-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: sessionToken };

// Everything a session holds that must never reach the terminal or the event stream.
const description = 'fake-ticket-description-for-leaks';
const summary = 'fake-claude-summary-for-leaks';
const words = 'fake-claude-words-for-leaks';
const devhubToken = 'fake-devhub-github-token-for-leaks';
// A command Claude asks about, and its own line about it (spec 012, AC-22).
const command = 'echo fake-command-for-leaks';
const commandLine = 'fake-command-description-for-leaks';
const secrets = [
  description,
  summary,
  words,
  devhubToken,
  goodToken,
  sessionToken,
  claudeEmail,
  claudeOrganisation,
  command,
  commandLine,
];

let app: FastifyInstance | undefined;
let home: string | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
  if (home !== undefined) await rm(home, { recursive: true, force: true });
  home = undefined;
});

/** One fake SDK per session, in the order the sessions start. */
function scriptsInTurn(scripts: readonly (readonly FakeTurn[])[]): { query: QueryFunction; fakes: FakeClaudeSdk[] } {
  const fakes = scripts.map((script) => fakeClaudeSdk(script));
  let next = 0;
  return {
    fakes,
    query: (params) => {
      const fake = fakes[next];
      next += 1;
      if (fake === undefined) throw new Error('More sessions than scripts');
      return fake.query(params);
    },
  };
}

const text = (said: string) => ({
  message: { type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'text', text: said }] } },
});

async function until(check: () => Promise<boolean>) {
  for (let tries = 0; tries < 1000; tries++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Never happened');
}

describe.skipIf(process.platform === 'win32')('a session stays out of the log and the event stream', () => {
  it('AC-20, AC-21, 012 AC-22: finished, stopped, failing and asking, nothing of the ticket, the brief, Claude or a command leaks', async () => {
    const repos = await repositories();
    home = await realpath(await mkdtemp(join(tmpdir(), 'devhub-session-leaks-')));
    const folder = await fakeClaudeFolder();
    await folder.install({ kind: 'signed_in' });
    jira.use(
      acceptingIssue(
        ['PROJ-1', 'PROJ-2', 'PROJ-3', 'PROJ-4'].map((key) => ({
          key,
          summary: `Work on ${key}`,
          description: {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
          },
        })),
      ),
    );

    const log: string[] = [];
    const bus = createEventBus();
    const events: ServerEvent[] = [];
    bus.subscribe((event) => events.push(event));
    const keychainChanges: string[] = [];
    const keychain: Keychain = {
      get: (account) => Promise.resolve(account === 'jira' ? goodToken : null),
      set: (account) => {
        keychainChanges.push(`set ${account}`);
        return Promise.resolve();
      },
      delete: (account) => {
        keychainChanges.push(`delete ${account}`);
        return Promise.resolve();
      },
    };
    const settings = createFileSettingsStore(home);
    await settings.update(() => ({ jira: { site: jiraSite, email: jiraEmail } }));

    const { query, fakes } = scriptsInTurn([
      [text(words), { tool: 'Read', input: { file_path: 'README.md' } }, { finish: summary }],
      [text(words), { hang: true }],
      [
        text(words),
        { message: { type: 'assistant', parent_tool_use_id: null, error: 'rate_limit', message: { content: [] } } },
      ],
      [text(words), { tool: 'Bash', input: { command, description: commandLine } }, { finish: summary }],
    ]);
    // The shell that started Orynx holds Orynx's own settings and a token; none may reach Claude Code.
    const shell = { HOME: repos.root, PATH: gitSearchPath, DEVHUB_GITHUB_TOKEN: devhubToken };

    app = await createServer({
      token: sessionToken,
      port,
      version: 'test',
      events: bus,
      userName: () => Promise.resolve(null),
      keychain,
      settings,
      dataDir: home,
      userHome: repos.root,
      sessions: await openFileSessionStore(home),
      claudeCode: createClaudeCode({
        program: folder.program,
        env: { PATH: '/usr/bin:/bin' },
        workFolder: folder.workFolder,
      }),
      agent: { query, program: '/opt/claude/claude', env: agentEnvironment(shell) },
      gitEnvironment: gitEnvironment({ ...repos.env, ...shell }),
      logger: {
        level: 'trace',
        stream: new Writable({
          write(chunk: Buffer, _encoding, done) {
            log.push(chunk.toString());
            done();
          },
        }),
      },
    });
    const hub = app;
    const added = await hub.inject({
      method: 'POST',
      url: apiRoutes.repositories,
      headers,
      payload: { path: repos.clone, jiraProject: 'PROJ' },
    });
    expect(added.statusCode).toBe(201);
    const settingsBefore = await readFile(settingsFilePath(home), 'utf8');

    const start = async (ticketKey: string) => {
      const res = await hub.inject({ method: 'POST', url: apiRoutes.sessions, headers, payload: { ticketKey } });
      const answer = res.json<{ result: string; sessionId: string }>();
      expect(answer.result).toBe('started');
      return answer.sessionId;
    };
    const stateOf = async (id: string) =>
      (await hub.inject({ method: 'GET', url: apiRoutes.session.replace(':id', id), headers })).json<{
        state: string;
      }>().state;

    const finished = await start('PROJ-1');
    await until(async () => (await stateOf(finished)) === 'done');
    const stopped = await start('PROJ-2');
    await until(() => Promise.resolve(fakes[1]?.runs.length === 1));
    expect(
      (await hub.inject({ method: 'POST', url: apiRoutes.sessionStop.replace(':id', stopped), headers })).statusCode,
    ).toBe(204);
    const failing = await start('PROJ-3');
    await until(async () => (await stateOf(failing)) === 'stopped');
    const asking = await start('PROJ-4');
    let approvalId = '';
    await until(async () => {
      const waiting = (
        await hub.inject({ method: 'GET', url: apiRoutes.session.replace(':id', asking), headers })
      ).json<{ approvals: { id: string }[] }>().approvals;
      approvalId = waiting[0]?.id ?? '';
      return approvalId !== '';
    });
    const denied = await hub.inject({
      method: 'POST',
      url: apiRoutes.sessionApproval.replace(':id', asking).replace(':approvalId', approvalId),
      headers,
      payload: { decision: 'deny' },
    });
    expect(denied.statusCode).toBe(204);
    await until(async () => (await stateOf(asking)) === 'done');
    await hub.close();

    const told = log.join('') + JSON.stringify(events);
    for (const secret of secrets) expect(told).not.toContain(secret);
    expect(told).toContain('Claude started a session');
    expect(told).toContain('rate_limit');
    expect(told).toContain('Claude is waiting for an answer');
    expect(told).toContain('A waiting call ended');

    for (const fake of fakes) {
      const options = fake.runs[0]?.options;
      expect(options?.settingSources).toEqual([]);
      expect(options?.settings).toEqual({ disableAllHooks: true });
      expect(options?.tools).toEqual([...sessionToolsWithoutCommands]);
      expect(Object.keys(options?.env ?? {}).filter((name) => name.startsWith('DEVHUB_'))).toEqual([]);
      expect(JSON.stringify(options?.env)).not.toContain(devhubToken);
    }

    expect(await readFile(settingsFilePath(home), 'utf8')).toBe(settingsBefore);
    expect(keychainChanges).toEqual([]);
  });
});

describe.skipIf(process.platform === 'win32')('spec 013 stays out of the log and the event stream', () => {
  it('AC-23: a follow-up’s text, a changed file’s path and its lines never leak', async () => {
    const followUp = 'fake-follow-up-for-leaks';
    const secretFile = 'fake-secret-path-for-leaks.ts';
    const secretLine = 'fake-file-line-for-leaks';
    const repos = await repositories();
    home = await realpath(await mkdtemp(join(tmpdir(), 'devhub-session-leaks-013-')));
    const folder = await fakeClaudeFolder();
    await folder.install({ kind: 'signed_in' });
    jira.use(acceptingIssue({ key: 'PROJ-1', summary: 'Work on PROJ-1' }));
    const log: string[] = [];
    const bus = createEventBus();
    const events: ServerEvent[] = [];
    bus.subscribe((event) => events.push(event));
    const settings = createFileSettingsStore(home);
    await settings.update(() => ({ jira: { site: jiraSite, email: jiraEmail } }));
    const keychain: Keychain = {
      get: (account) => Promise.resolve(account === 'jira' ? goodToken : null),
      set: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    };
    const sdk = fakeClaudeSdk([{ finish: summary }], [{ finish: summary }]);
    const shell = { HOME: repos.root, PATH: gitSearchPath };

    app = await createServer({
      token: sessionToken,
      port,
      version: 'test',
      events: bus,
      userName: () => Promise.resolve(null),
      keychain,
      settings,
      dataDir: home,
      userHome: repos.root,
      sessions: await openFileSessionStore(home),
      claudeCode: createClaudeCode({
        program: folder.program,
        env: { PATH: '/usr/bin:/bin' },
        workFolder: folder.workFolder,
      }),
      agent: { query: sdk.query, program: '/opt/claude/claude', env: agentEnvironment(shell) },
      gitEnvironment: gitEnvironment({ ...repos.env, ...shell }),
      logger: {
        level: 'trace',
        stream: new Writable({
          write(chunk: Buffer, _encoding, done) {
            log.push(chunk.toString());
            done();
          },
        }),
      },
    });
    const hub = app;
    await hub.inject({
      method: 'POST',
      url: apiRoutes.repositories,
      headers,
      payload: { path: repos.clone, jiraProject: 'PROJ' },
    });
    const started = await hub.inject({
      method: 'POST',
      url: apiRoutes.sessions,
      headers,
      payload: { ticketKey: 'PROJ-1' },
    });
    const id = started.json<{ sessionId: string }>().sessionId;
    const stateOf = async () =>
      (await hub.inject({ method: 'GET', url: apiRoutes.session.replace(':id', id), headers })).json<{
        state: string;
      }>().state;
    await until(async () => (await stateOf()) === 'done');

    await writeFile(join(home, 'worktrees', id, secretFile), `${secretLine}\n`);
    const changes = await hub.inject({ method: 'GET', url: apiRoutes.sessionChanges.replace(':id', id), headers });
    expect(changes.json<{ files: { path: string }[] }>().files.map((file) => file.path)).toEqual([secretFile]);
    const diff = await hub.inject({
      method: 'GET',
      url: `${apiRoutes.sessionChangesDiff.replace(':id', id)}?path=${secretFile}`,
      headers,
    });
    expect(diff.statusCode).toBe(200);
    const sent = await hub.inject({
      method: 'POST',
      url: apiRoutes.sessionMessages.replace(':id', id),
      headers,
      payload: { text: followUp },
    });
    expect(sent.json()).toEqual({ result: 'sent' });
    await until(() => Promise.resolve(sdk.runs.length === 2));
    await until(async () => (await stateOf()) === 'done');
    await hub.close();

    const told = log.join('') + JSON.stringify(events);
    for (const secret of [followUp, secretFile, secretLine, summary]) expect(told).not.toContain(secret);
    expect(told).toContain('You sent Claude a follow-up');
    expect(sdk.runs[1]?.prompts).toEqual([followUp]);
  });
});

describe.skipIf(process.platform === 'win32')('spec 015 stays out of the log and the event stream', () => {
  it('AC-35: a composer start leaks nothing of your message, the ticket, the pull request or the file, nor a token', async () => {
    const message = 'fake-composer-message-for-leaks';
    const fileText = 'fake-file-text-for-leaks';
    const comment = 'fake-jira-comment-for-leaks';
    const pullBody = 'fake-pull-body-for-leaks';
    const diffLine = 'fake-diff-line-for-leaks';
    const review = 'fake-review-comment-for-leaks';
    const said = [message, fileText, comment, pullBody, diffLine, review, description, githubToken, goodToken];
    const doc = (words: string) => ({
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: words }] }],
    });
    const repos = await repositories();
    home = await realpath(await mkdtemp(join(tmpdir(), 'devhub-session-leaks-015-')));
    const folder = await fakeClaudeFolder();
    await folder.install({ kind: 'signed_in' });
    jira.use(
      acceptingIssue({
        key: 'PROJ-1',
        summary: 'Work on PROJ-1',
        description: doc(description),
        comments: [{ author: 'Priya', created: '2026-10-14T09:00:00.000+0100', body: doc(comment) }],
      }),
      acceptingPullContext([
        {
          number: 2836,
          body: pullBody,
          threads: [{ resolved: false, path: 'src/a.ts', line: 1, comments: [{ author: 'octocat', body: review }] }],
        },
      ]),
      acceptingPullDiff([{ number: 2836, diff: `diff --git a/src/a.ts b/src/a.ts\n+${diffLine}` }]),
    );
    const log: string[] = [];
    const bus = createEventBus();
    const events: ServerEvent[] = [];
    bus.subscribe((event) => events.push(event));
    const settings = createFileSettingsStore(home);
    await settings.update(() => ({ jira: { site: jiraSite, email: jiraEmail }, github: { method: 'token' } }));
    const keychain: Keychain = {
      get: (account) => Promise.resolve(account === 'jira' ? goodToken : account === 'github' ? githubToken : null),
      set: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    };
    const sdk = fakeClaudeSdk([{ finish: summary }]);
    const shell = { HOME: repos.root, PATH: gitSearchPath };

    app = await createServer({
      token: sessionToken,
      port,
      version: 'test',
      events: bus,
      userName: () => Promise.resolve(null),
      keychain,
      settings,
      dataDir: home,
      userHome: repos.root,
      sessions: await openFileSessionStore(home),
      claudeCode: createClaudeCode({
        program: folder.program,
        env: { PATH: '/usr/bin:/bin' },
        workFolder: folder.workFolder,
      }),
      agent: { query: sdk.query, program: '/opt/claude/claude', env: agentEnvironment(shell) },
      gitEnvironment: gitEnvironment({ ...repos.env, ...shell }),
      logger: {
        level: 'trace',
        stream: new Writable({
          write(chunk: Buffer, _encoding, done) {
            log.push(chunk.toString());
            done();
          },
        }),
      },
    });
    const hub = app;
    await hub.inject({
      method: 'POST',
      url: apiRoutes.repositories,
      headers,
      payload: { path: repos.clone, jiraProject: 'PROJ' },
    });
    const context = [
      { kind: 'jira', key: 'PROJ-1' },
      { kind: 'pull_request', owner: 'acme', name: 'web-app', number: 2836 },
      { kind: 'file', name: 'notes.md', text: fileText },
    ];
    const failed = await hub.inject({
      method: 'POST',
      url: apiRoutes.sessions,
      headers,
      payload: { message, context: [...context, { kind: 'pull_request', owner: 'acme', name: 'web-app', number: 9 }] },
    });
    expect(failed.json()).toEqual({ result: 'context_failed', chip: 3, problem: 'not_found' });
    const started = await hub.inject({
      method: 'POST',
      url: apiRoutes.sessions,
      headers,
      payload: { message, context },
    });
    const id = started.json<{ sessionId: string }>().sessionId;
    await until(async () => {
      const session = await hub.inject({ method: 'GET', url: apiRoutes.session.replace(':id', id), headers });
      return session.json<{ state: string }>().state === 'done';
    });
    // Claude got all of it; nothing else did.
    const brief = sdk.runs[0]?.prompts[0] ?? '';
    for (const secret of [message, fileText, comment, pullBody, diffLine, review, description]) {
      expect(brief).toContain(secret);
    }
    await hub.close();

    const told = log.join('') + JSON.stringify(events);
    for (const secret of said) expect(told).not.toContain(secret);
    expect(told).toContain('Claude started a session');
  });
});
