import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, SessionSchema, tokenHeader, type ChatAnswers } from '@devhub/contracts';
import { gitEnvironment } from '../agents/agent-environment.ts';
import { createClaudeCode } from '../agents/claude/claude-code.ts';
import { createServer } from '../create-server.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { openFileSessionStore } from '../sessions/file-session-store.ts';
import { createMemorySettingsStore } from '../settings/settings-store.ts';
import { fakeClaudeSdk, type FakeTurn } from '../test/fake-claude-sdk.ts';
import { useFakeClaudeFolder } from '../test/fake-claude.ts';
import { acceptingBot, discordDmConversation, discordToken, discordUserId } from '../test/fake-discord.ts';
import {
  acceptingAuthTest,
  acceptingBotToken,
  knownUsers,
  slackBotToken,
  slackDmConversation,
  slackToken,
  slackUserId,
} from '../test/fake-slack.ts';
import { gitSearchPath, useTestRepositories } from '../test/git-repository.ts';

// A real server, real git and a real session store; only Claude Code, Slack and Discord are faked.
vi.setConfig({ testTimeout: 30_000 });

const tools = setupServer();
beforeAll(() => {
  tools.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  tools.resetHandlers();
});
afterAll(() => {
  tools.close();
});

const repositories = useTestRepositories();
const fakeClaudeFolder = useFakeClaudeFolder();
const token = 'chat-answers-session-token-0123456789';
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

const library = {
  question: 'Which date library should we use?',
  header: 'Library',
  multiSelect: false,
  options: [
    { label: 'date-fns', description: 'Already a dependency' },
    { label: 'Day.js', description: 'Smaller, a new dependency' },
    { label: 'Temporal', description: 'Built in, needs a polyfill' },
  ],
};
const asks: FakeTurn[] = [{ tool: 'AskUserQuestion', input: { questions: [library] } }, { finish: 'Done.' }];

/** A hub with one folder, Slack (with its bot) and Discord connected, and a session started from the composer. */
async function hub({ script, chat }: { script: readonly FakeTurn[]; chat: ChatAnswers }) {
  const repos = await repositories();
  home = await realpath(await mkdtemp(join(tmpdir(), 'devhub-chat-')));
  const folder = await fakeClaudeFolder();
  await folder.install({ kind: 'signed_in' });
  const discord = discordDmConversation();
  const slack = slackDmConversation();
  tools.use(
    ...acceptingBot(),
    ...discord.handlers,
    acceptingBotToken(),
    acceptingAuthTest(),
    knownUsers(),
    ...slack.handlers,
  );

  const sdk = fakeClaudeSdk(script);
  const server = await createServer({
    token,
    port,
    version: 'test',
    userName: () => Promise.resolve(null),
    keychain: createMemoryKeychain({ discord: discordToken, slack: slackToken, slack_bot: slackBotToken }),
    settings: createMemorySettingsStore({
      agent: { permissionMode: 'edit_freely_ask_commands' },
      slack: { workspace: 'Acme', url: 'https://acme.slack.com/', userId: slackUserId, name: 'Neha K.' },
      slackBot: { url: 'https://acme.slack.com/' },
      discord: { bot: 'Orynx', userId: discordUserId },
      notifications: { chatAnswers: chat },
    }),
    dataDir: home,
    userHome: repos.root,
    sessions: await openFileSessionStore(home),
    claudeCode: createClaudeCode({
      program: folder.program,
      env: { PATH: '/usr/bin:/bin' },
      workFolder: folder.workFolder,
    }),
    agent: {
      query: sdk.query,
      program: '/opt/claude/claude',
      env: { HOME: repos.root, PATH: gitSearchPath },
      sandbox: true,
    },
    gitEnvironment: gitEnvironment(repos.env),
    chatAnswersEveryMs: 50,
  });
  app = server;
  const added = await server.inject({
    method: 'POST',
    url: apiRoutes.repositories,
    headers,
    payload: { path: repos.clone, jiraProject: null },
  });
  const { id: repositoryId } = added.json<{ id: string }>();
  const started = await server.inject({
    method: 'POST',
    url: apiRoutes.sessions,
    headers,
    payload: { message: 'Pick a date library', repositoryId, context: [], mode: 'build' },
  });
  const { sessionId } = started.json<{ sessionId: string }>();

  const session = async () =>
    SessionSchema.parse(
      (await server.inject({ method: 'GET', url: apiRoutes.session.replace(':id', sessionId), headers })).json(),
    );
  const waiting = async () => {
    await vi.waitFor(async () => {
      expect((await session()).approvals.length).toBeGreaterThan(0);
    });
    return (await session()).approvals;
  };
  return { discord, slack, session, waiting, sdk };
}

describe.skipIf(process.platform === 'win32')("answering Claude's question from chat (spec 057, A)", () => {
  it('AC-1, AC-2, AC-16: the bot DMs you the question, and your reply answers it with no Orynx page open', async () => {
    const { discord, session, waiting } = await hub({ script: asks, chat: { on: true, to: 'discord' } });
    await waiting();
    await vi.waitFor(() => {
      expect(discord.sent()).toHaveLength(1);
    });
    const [question] = discord.sent();
    expect(question?.content).toBe(
      [
        'Claude has a question · Pick a date library',
        '',
        'Which date library should we use?',
        '',
        '1. date-fns: Already a dependency',
        '2. Day.js: Smaller, a new dependency',
        '3. Temporal: Built in, needs a polyfill',
        '',
        'Reply with a number, your own answer, or skip.',
      ].join('\n'),
    );

    // Someone else's message in the DM is never an answer.
    discord.from('80351110224678999', '1', question?.id);
    const yours = discord.reply('2', question?.id);

    await vi.waitFor(async () => {
      expect((await session()).activities).toContainEqual(
        expect.objectContaining({
          kind: 'answered',
          answers: [{ header: 'Library', answer: 'Day.js' }],
          from: 'discord',
        }),
      );
    });
    await vi.waitFor(() => {
      expect(discord.sent().at(-1)).toMatchObject({
        content: 'Sent to Claude.',
        message_reference: { message_id: yours },
      });
    });
  });

  it('AC-3: any other text, in the Slack thread, is the Other answer', async () => {
    const { slack, session, waiting } = await hub({ script: asks, chat: { on: true, to: 'slack' } });
    await waiting();
    await vi.waitFor(() => {
      expect(slack.sent()).toHaveLength(1);
    });
    const thread = slack.sent()[0]?.ts ?? '';

    slack.reply("Use date-fns, it's already a dependency", thread);

    await vi.waitFor(async () => {
      expect((await session()).activities).toContainEqual(
        expect.objectContaining({
          kind: 'answered',
          answers: [{ header: 'Library', answer: "Use date-fns, it's already a dependency" }],
          from: 'slack',
        }),
      );
    });
    await vi.waitFor(() => {
      expect(slack.sent().at(-1)).toMatchObject({ text: 'Sent to Claude.', thread_ts: thread });
    });
  });

  it('AC-5: a number out of range asks again and the question waits, then skip skips', async () => {
    const { discord, session, waiting } = await hub({ script: asks, chat: { on: true, to: 'discord' } });
    await waiting();
    await vi.waitFor(() => {
      expect(discord.sent()).toHaveLength(1);
    });
    const question = discord.sent()[0]?.id;

    discord.reply('7', question);
    await vi.waitFor(() => {
      expect(discord.sent().at(-1)?.content).toBe('Pick 1 to 3, or type your answer.');
    });
    expect((await session()).approvals).toHaveLength(1);

    discord.reply('skip', question);
    await vi.waitFor(async () => {
      expect((await session()).activities).toContainEqual(
        expect.objectContaining({ kind: 'denied', about: 'question' }),
      );
    });
  });

  it('AC-9: three questions in one call say to answer in Orynx, and a reply changes nothing', async () => {
    const three = { questions: [library, { ...library, question: 'Which tests?' }, { ...library, question: 'Why?' }] };
    const { discord, waiting } = await hub({
      script: [{ tool: 'AskUserQuestion', input: three }, { finish: 'Done.' }],
      chat: { on: true, to: 'discord' },
    });
    await waiting();
    await vi.waitFor(() => {
      expect(discord.sent()).toHaveLength(1);
    });
    expect(discord.sent()[0]?.content).toBe('Claude has 3 questions in Pick a date library. Answer them in Orynx.');

    discord.reply('1', discord.sent()[0]?.id);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await waiting()).toHaveLength(1);
    expect(discord.sent()).toHaveLength(1);
  });

  it('AC-10: a command waiting sends a ping without the command, and replying allow changes nothing', async () => {
    const npmTest: FakeTurn = { tool: 'Bash', input: { command: 'npm test', description: 'Run the tests' } };
    const { discord, waiting } = await hub({
      script: [npmTest, { finish: 'Ran the tests.' }],
      chat: { on: true, to: 'both' },
    });
    await waiting();
    await vi.waitFor(() => {
      expect(discord.sent()).toHaveLength(1);
    });
    expect(discord.sent()[0]?.content).toBe('Claude is waiting for you in Pick a date library. Answer it in Orynx.');

    discord.reply('allow', discord.sent()[0]?.id);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await waiting()).toMatchObject([{ kind: 'command' }]);
  });

  it('AC-11: with the row off, nothing goes to Slack or Discord', async () => {
    const { discord, slack, waiting } = await hub({ script: asks, chat: { on: false, to: 'both' } });
    await waiting();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(discord.sent()).toEqual([]);
    expect(slack.sent()).toEqual([]);
  });
});
