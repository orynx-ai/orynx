import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  apiRoutes,
  SessionSchema,
  StatusSchema,
  tokenHeader,
  type ChatAnswers,
  type DesktopQuestion,
} from '@devhub/contracts';
import { gitEnvironment } from '../agents/agent-environment.ts';
import { createClaudeCode } from '../agents/claude/claude-code.ts';
import { createServer } from '../create-server.ts';
import type { DesktopQuestions } from './chat-answers.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { openFileSessionStore } from '../sessions/file-session-store.ts';
import { createMemorySettingsStore } from '../settings/settings-store.ts';
import { fakeClaudeSdk, type FakeTurn } from '../test/fake-claude-sdk.ts';
import { useFakeClaudeFolder } from '../test/fake-claude.ts';
import {
  acceptingBot,
  discordDmClosed,
  discordDmConversation,
  discordToken,
  discordUserId,
} from '../test/fake-discord.ts';
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
/** The desktop app's notifications, outside the hub: what it was asked to show, and your reply in one. */
function fakeDesktop() {
  const shown: DesktopQuestion[] = [];
  const withdrawn: string[] = [];
  const listeners: ((id: string, text: string) => void)[] = [];
  const questions: DesktopQuestions = {
    show: (question) => shown.push(question),
    withdraw: (id) => withdrawn.push(id),
    onReply: (listener) => listeners.push(listener),
  };
  return {
    questions,
    shown,
    withdrawn,
    reply: (id: string, text: string) => {
      for (const listener of listeners) listener(id, text);
    },
  };
}

async function hub({
  script,
  chat,
  dmsClosed = false,
  desktop,
  notifications = {},
}: {
  script: readonly FakeTurn[];
  chat: ChatAnswers;
  /** You don't take the Discord bot's DMs. */
  dmsClosed?: boolean;
  /** The hub runs in the desktop app on macOS. */
  desktop?: DesktopQuestions;
  /** More of Settings › Notifications, as saved. */
  notifications?: Record<string, unknown>;
}) {
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
  if (dmsClosed) tools.use(discordDmClosed());

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
      notifications: {
        chatAnswers: chat,
        quietHours: { on: false, from: '19:00', to: '09:00', days: [true, true, true, true, true, true, true] },
        ...notifications,
      },
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
    ...(desktop === undefined ? {} : { desktopQuestions: desktop }),
  });
  app = server;
  const added = await server.inject({
    method: 'POST',
    url: apiRoutes.repositories,
    headers,
    payload: { path: repos.clone, jiraProject: null },
  });
  const { id: repositoryId } = added.json<{ id: string }>();
  const start = async (message = 'Pick a date library') => {
    const started = await server.inject({
      method: 'POST',
      url: apiRoutes.sessions,
      headers,
      payload: { message, repositoryId, context: [], mode: 'build' },
    });
    return started.json<{ sessionId: string }>().sessionId;
  };
  const sessionId = await start();

  const session = async (id = sessionId) =>
    SessionSchema.parse(
      (await server.inject({ method: 'GET', url: apiRoutes.session.replace(':id', id), headers })).json(),
    );
  const waiting = async (id = sessionId) => {
    await vi.waitFor(async () => {
      expect((await session(id)).approvals.length).toBeGreaterThan(0);
    });
    return (await session(id)).approvals;
  };
  const answerInOrynx = (approvalId: string, picked: string) =>
    server.inject({
      method: 'POST',
      url: apiRoutes.sessionApproval.replace(':id', sessionId).replace(':approvalId', approvalId),
      headers,
      payload: { decision: 'answer', answers: [{ picked: [picked], other: null }] },
    });
  const stop = () => server.inject({ method: 'POST', url: apiRoutes.sessionStop.replace(':id', sessionId), headers });
  const status = async () =>
    StatusSchema.parse((await server.inject({ method: 'GET', url: apiRoutes.status, headers })).json());
  return { discord, slack, session, waiting, start, answerInOrynx, stop, status, sdk };
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

  it('AC-6: answered in Orynx first, the chat says so at once, and a later reply changes nothing', async () => {
    const { discord, session, waiting, answerInOrynx } = await hub({ script: asks, chat: { on: true, to: 'discord' } });
    const [approval] = await waiting();
    await vi.waitFor(() => {
      expect(discord.sent()).toHaveLength(1);
    });
    const question = discord.sent()[0]?.id;

    expect((await answerInOrynx(approval?.id ?? '', 'date-fns')).statusCode).toBe(204);
    await vi.waitFor(() => {
      expect(discord.sent().at(-1)).toMatchObject({
        content: 'Answered in Orynx.',
        message_reference: { message_id: question },
      });
    });

    discord.reply('2', question);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(discord.sent()).toHaveLength(2);
    const answered = (await session()).activities.filter((activity) => activity.kind === 'answered');
    expect(answered).toEqual([expect.objectContaining({ answers: [{ header: 'Library', answer: 'date-fns' }] })]);
    expect(answered[0]).not.toHaveProperty('from');
  });

  it('AC-7: Stop says the session stopped, in Slack and on Discord', async () => {
    const { discord, slack, waiting, stop } = await hub({ script: asks, chat: { on: true, to: 'both' } });
    await waiting();
    await vi.waitFor(() => {
      expect(discord.sent()).toHaveLength(1);
      expect(slack.sent()).toHaveLength(1);
    });

    await stop();
    await vi.waitFor(() => {
      expect(discord.sent().at(-1)?.content).toBe('The session stopped.');
      expect(slack.sent().at(-1)).toMatchObject({ text: 'The session stopped.', thread_ts: slack.sent()[0]?.ts });
    });
  });

  it('AC-8: with two questions waiting on Discord, a plain message asks for Reply, and a Reply answers only its own', async () => {
    const { discord, session, waiting, start } = await hub({ script: asks, chat: { on: true, to: 'discord' } });
    await waiting();
    const second = await start('Pick a test runner');
    await waiting(second);
    await vi.waitFor(() => {
      expect(discord.sent()).toHaveLength(2);
    });
    const [, toSecond] = discord.sent();

    const plain = discord.reply('1');
    await vi.waitFor(() => {
      expect(discord.sent().at(-1)).toMatchObject({
        content: "Use Reply on the question you're answering.",
        message_reference: { message_id: plain },
      });
    });

    discord.reply('3', toSecond?.id);
    await vi.waitFor(async () => {
      expect((await session(second)).activities).toContainEqual(
        expect.objectContaining({ kind: 'answered', answers: [{ header: 'Library', answer: 'Temporal' }] }),
      );
    });
    expect((await session()).approvals).toHaveLength(1);
  });

  it('AC-13: a DM Discord turns down leaves the question waiting in Orynx, with a line on its step', async () => {
    const { discord, session, waiting } = await hub({
      script: asks,
      chat: { on: true, to: 'discord' },
      dmsClosed: true,
    });
    await waiting();
    await vi.waitFor(async () => {
      expect((await session()).activities.at(-1)).toMatchObject({ kind: 'waiting', unsent: ['discord'] });
    });
    expect((await session()).approvals).toHaveLength(1);
    expect(discord.sent()).toEqual([]);
  });

  it('AC-15: in the desktop app on macOS, the question shows with a reply box, and typing a number answers it', async () => {
    const desktop = fakeDesktop();
    const { session, waiting, status } = await hub({
      script: asks,
      chat: { on: true, to: 'discord' },
      desktop: desktop.questions,
    });
    const [approval] = await waiting();
    expect((await status()).desktopReplies).toBe(true);
    await vi.waitFor(() => {
      expect(desktop.shown).toHaveLength(1);
    });
    expect(desktop.shown[0]).toMatchObject({
      title: 'Claude has a question',
      reply: true,
      path: `/sessions/${(await session()).id}`,
      onlyInBackground: true,
    });
    expect(desktop.shown[0]?.body).toContain('2. Day.js: Smaller, a new dependency');

    desktop.reply(desktop.shown[0]?.id ?? '', '7');
    await vi.waitFor(() => {
      expect(desktop.shown.at(-1)?.title).toBe('Pick 1 to 3, or type your answer.');
    });
    desktop.reply(desktop.shown[0]?.id ?? '', '2');
    await vi.waitFor(async () => {
      expect((await session()).activities).toContainEqual(
        expect.objectContaining({ kind: 'answered', from: 'notification' }),
      );
    });
    expect((await session()).approvals.map(({ id }) => id)).not.toContain(approval?.id);
  });

  it('AC-15: answered elsewhere, the notification goes', async () => {
    const desktop = fakeDesktop();
    const { waiting, answerInOrynx } = await hub({
      script: asks,
      chat: { on: true, to: 'discord' },
      desktop: desktop.questions,
    });
    const [approval] = await waiting();
    await vi.waitFor(() => {
      expect(desktop.shown).toHaveLength(1);
    });
    await answerInOrynx(approval?.id ?? '', 'date-fns');
    await vi.waitFor(() => {
      expect(desktop.withdrawn).toEqual([desktop.shown[0]?.id]);
    });
  });

  it('AC-15: with desktop notifications off in Settings, no notification shows', async () => {
    const off = fakeDesktop();
    const quiet = await hub({
      script: asks,
      chat: { on: true, to: 'discord' },
      desktop: off.questions,
      notifications: { desktop: false },
    });
    await quiet.waiting();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(off.shown).toEqual([]);
  });
});
