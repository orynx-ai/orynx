import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
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
const secrets = [description, summary, words, devhubToken, goodToken, sessionToken, claudeEmail, claudeOrganisation];

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
  it('AC-20, AC-21: finished, stopped and failing, nothing of the ticket, the brief or Claude leaks', async () => {
    const repos = await repositories();
    home = await realpath(await mkdtemp(join(tmpdir(), 'devhub-session-leaks-')));
    const folder = await fakeClaudeFolder();
    await folder.install({ kind: 'signed_in' });
    jira.use(
      acceptingIssue(
        ['PROJ-1', 'PROJ-2', 'PROJ-3'].map((key) => ({
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
    await hub.close();

    const told = log.join('') + JSON.stringify(events);
    for (const secret of secrets) expect(told).not.toContain(secret);
    expect(told).toContain('Claude started a session');
    expect(told).toContain('rate_limit');

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
