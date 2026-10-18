import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  apiRoutes,
  ApiErrorSchema,
  SessionSchema,
  tokenHeader,
  type ApprovalDecision,
  type PermissionMode,
} from '@devhub/contracts';
import { gitEnvironment } from '../agents/agent-environment.ts';
import { createClaudeCode } from '../agents/claude/claude-code.ts';
import { createServer } from '../create-server.ts';
import { openFileSessionStore } from '../sessions/file-session-store.ts';
import { createMemorySettingsStore, type SettingsStore } from '../settings/settings-store.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { useFakeClaudeFolder } from '../test/fake-claude.ts';
import { fakeClaudeSdk, type FakeTurn } from '../test/fake-claude-sdk.ts';
import { acceptingIssue, goodToken, jiraEmail, jiraSite, useFakeJira } from '../test/fake-jira.ts';
import { gitSearchPath, useTestRepositories } from '../test/git-repository.ts';

// A real server, real git and a real session store; only Jira and Claude Code are faked.
vi.setConfig({ testTimeout: 30_000 });

const jira = useFakeJira();
const repositories = useTestRepositories();
const fakeClaudeFolder = useFakeClaudeFolder();
const token = 'approvals-session-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };

let app: FastifyInstance | undefined;
let home: string | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
  if (home !== undefined) await rm(home, { recursive: true, force: true });
  home = undefined;
});

interface HubOptions {
  script: readonly FakeTurn[];
  mode?: PermissionMode;
}

/** A hub with one folder for PROJ, Jira connected and Claude Code signed in; saving settings can be made to fail. */
async function hub({ script, mode = 'edit_freely_ask_commands' }: HubOptions) {
  const repos = await repositories();
  home = await realpath(await mkdtemp(join(tmpdir(), 'devhub-approvals-')));
  const folder = await fakeClaudeFolder();
  await folder.install({ kind: 'signed_in' });
  jira.use(acceptingIssue({ key: 'PROJ-1423', summary: 'Add bulk archive' }));

  const memory = createMemorySettingsStore({
    jira: { site: jiraSite, email: jiraEmail },
    agent: { permissionMode: mode },
  });
  const saving = { fails: false };
  const settings: SettingsStore = {
    read: () => memory.read(),
    update: (change) => (saving.fails ? Promise.reject(new Error('disk full')) : memory.update(change)),
  };
  const sdk = fakeClaudeSdk(script);
  const server = await createServer({
    token,
    port,
    version: 'test',
    userName: () => Promise.resolve(null),
    keychain: createMemoryKeychain({ jira: goodToken }),
    settings,
    dataDir: home,
    userHome: repos.root,
    sessions: await openFileSessionStore(home),
    claudeCode: createClaudeCode({
      program: folder.program,
      env: { PATH: '/usr/bin:/bin' },
      workFolder: folder.workFolder,
    }),
    agent: { query: sdk.query, program: '/opt/claude/claude', env: { HOME: repos.root, PATH: gitSearchPath } },
    gitEnvironment: gitEnvironment(repos.env),
  });
  app = server;
  const added = await server.inject({
    method: 'POST',
    url: apiRoutes.repositories,
    headers,
    payload: { path: repos.clone, jiraProject: 'PROJ' },
  });
  expect(added.statusCode).toBe(201);

  const started = await server.inject({
    method: 'POST',
    url: apiRoutes.sessions,
    headers,
    payload: { ticketKey: 'PROJ-1423' },
  });
  const { sessionId } = started.json<{ sessionId: string }>();

  const session = async () =>
    SessionSchema.parse(
      (await server.inject({ method: 'GET', url: apiRoutes.session.replace(':id', sessionId), headers })).json(),
    );
  const waiting = async () => {
    await vi.waitFor(
      async () => {
        expect((await session()).approvals.length).toBeGreaterThan(0);
      },
      { timeout: 10_000 },
    );
    return (await session()).approvals;
  };
  const answer = (approvalId: string, decision: ApprovalDecision | 'maybe', id = sessionId) =>
    server.inject({
      method: 'POST',
      url: apiRoutes.sessionApproval.replace(':id', id).replace(':approvalId', approvalId),
      headers,
      payload: { decision },
    });
  return { server, sessionId, session, waiting, answer, saving, settings: memory };
}

const npmTest: FakeTurn = { tool: 'Bash', input: { command: 'npm test', description: 'Run the tests' } };

describe.skipIf(process.platform === 'win32')('POST /api/sessions/:id/approvals/:approvalId', () => {
  it('AC-1, AC-2: GET shows the waiting call, and an answer gets 204 and lets Claude work on', async () => {
    const { session, waiting, answer } = await hub({ script: [npmTest, { finish: 'Ran the tests.' }] });
    const [approval] = await waiting();
    expect(approval).toMatchObject({ kind: 'command', command: 'npm test', description: 'Run the tests' });
    expect((await session()).state).toBe('needs_you');

    const res = await answer(approval?.id ?? '', 'allow_once');

    expect(res.statusCode).toBe(204);
    await vi.waitFor(async () => {
      expect((await session()).state).toBe('done');
    });
  });

  it('AC-13: a second answer to the same call gets 409, and the first one stands', async () => {
    const { session, waiting, answer } = await hub({ script: [npmTest, { finish: 'Skipped.' }] });
    const [approval] = await waiting();
    expect((await answer(approval?.id ?? '', 'deny')).statusCode).toBe(204);

    const late = await answer(approval?.id ?? '', 'allow_once');

    expect(late.statusCode).toBe(409);
    expect(ApiErrorSchema.parse(late.json()).code).toBe('already_answered');
    await vi.waitFor(async () => {
      expect((await session()).activities).toContainEqual(expect.objectContaining({ kind: 'denied' }) as unknown);
    });
  });

  it('answers 404 for a call or a session it doesn’t have, and 400 for an answer it can’t read', async () => {
    const { sessionId, waiting, answer } = await hub({ script: [npmTest, { finish: 'Done.' }] });
    const [approval] = await waiting();

    expect((await answer('no-such-call', 'deny')).statusCode).toBe(404);
    expect((await answer(approval?.id ?? '', 'deny', 'ffffffffffffffff')).statusCode).toBe(404);
    const unread = await answer(approval?.id ?? '', 'maybe');
    expect(unread.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(unread.json()).code).toBe('bad_request');
    expect((await answer(approval?.id ?? '', 'allow_once', sessionId)).statusCode).toBe(204);
  });

  it('Q1: answers 400 for Always allow where it isn’t offered, and decides nothing', async () => {
    const { session, waiting, answer } = await hub({ script: [npmTest, { finish: 'Done.' }] });
    const [approval] = await waiting();
    const res = await answer(approval?.id ?? '', 'always_allow');
    expect(res.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(res.json()).code).toBe('bad_request');
    expect((await session()).approvals).toHaveLength(1);
    expect((await answer(approval?.id ?? '', 'deny')).statusCode).toBe(204);
  });

  it('AC-5, AC-14: Always allow saves the entry; when it can’t, 503 and the call keeps waiting', async () => {
    const { session, waiting, answer, saving, settings } = await hub({
      mode: 'edit_and_run_allowed',
      script: [{ tool: 'Bash', input: { command: 'npm run lint -- --fix' } }, { finish: 'Linted.' }],
    });
    const [approval] = await waiting();
    expect(approval).toMatchObject({ alwaysAllow: 'npm run lint' });

    saving.fails = true;
    const refused = await answer(approval?.id ?? '', 'always_allow');
    expect(refused.statusCode).toBe(503);
    expect(ApiErrorSchema.parse(refused.json()).code).toBe('settings_unsaved');
    expect((await session()).approvals).toHaveLength(1);

    saving.fails = false;
    expect((await answer(approval?.id ?? '', 'always_allow')).statusCode).toBe(204);
    expect((await settings.read()).agent).toMatchObject({ allowedCommands: ['npm run lint'] });
  });

  it('answers 401 without the session token', async () => {
    const { server, sessionId, waiting } = await hub({ script: [npmTest, { finish: 'Done.' }] });
    const [approval] = await waiting();
    const res = await server.inject({
      method: 'POST',
      url: apiRoutes.sessionApproval.replace(':id', sessionId).replace(':approvalId', approval?.id ?? ''),
      headers: { host: headers.host },
      payload: { decision: 'allow_once' },
    });
    expect(res.statusCode).toBe(401);
  });
});
