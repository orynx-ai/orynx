// The callbacks passed to page.evaluate() run in the browser.
/// <reference lib="dom" />
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { discordUserId, type FakeDiscordMessage } from '../packages/core/src/test/fake-discord.ts';
import { answerClaudeAs, fakeClaudeDirFor } from './fake-claude/config.ts';
import { answersHubPort, controlPortFor, type FakeTools } from './fake-tools/config.ts';

// Answering Claude's question from Discord (spec 057, A), on spec 057's own hub: its Discord is faked in the hub's
// process, and the fake Claude Code asks a question when its brief says "(asks)" (spec 051).
test.use({ baseURL: `http://127.0.0.1:${String(answersHubPort)}` });
// The hub reads the DM every 15 seconds.
test.setTimeout(90_000);
// One Discord DM for both tests: a reply rewrites what the fake holds, so they take turns.
test.describe.configure({ mode: 'serial' });

const control = `http://127.0.0.1:${String(controlPortFor(answersHubPort))}/tools`;
const discordToken = 'fake-discord-token-for-tests';

/** A real repository in a temporary folder, and git that reads none of your settings. */
function makeRepository() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'devhub-e2e-chat-answers-repo-')));
  const env = {
    PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    HOME: root,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };
  writeFileSync(join(root, '.gitconfig'), '[init]\n\tdefaultBranch = main\n');
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();
  const clone = join(root, 'web-app');
  git(root, 'init', clone);
  writeFileSync(join(clone, 'README.md'), '# web-app\n');
  git(clone, 'add', '.');
  git(clone, 'commit', '-m', 'first');
  return { root, clone };
}

const repository = makeRepository();
let repositoryId = '';

/** Sends a request to the hub with the page's token, as the page does. */
async function api(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const token = document.querySelector('meta[name="devhub-token"]')?.getAttribute('content') ?? '';
      const answer = await fetch(path, {
        method,
        headers: { 'x-devhub-token': token, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!answer.ok) throw new Error(`${method} ${path} answered ${String(answer.status)}`);
      return answer.status === 204 ? null : ((await answer.json()) as unknown);
    },
    { method, path, body },
  );
}

/** What the fake tools hold now, the bot's DM with you among them. */
async function heldTools(): Promise<FakeTools> {
  return (await (await fetch(control)).json()) as FakeTools;
}

/** What the bot has sent you, in order. */
async function botSent(): Promise<FakeDiscordMessage[]> {
  return ((await heldTools()).discordDm ?? []).filter((message) => message.author.id !== discordUserId);
}

/** Your reply in the DM, as a Reply to `replyTo`. */
async function reply(content: string, replyTo: string) {
  const tools = await heldTools();
  const dm = tools.discordDm ?? [];
  const newest = dm.reduce((most, { id }) => (BigInt(id) > most ? BigInt(id) : most), BigInt(0));
  dm.push({
    id: String(newest + BigInt(1)),
    channel_id: '1100000000000000300',
    author: { id: discordUserId, username: 'neha' },
    content,
    timestamp: new Date().toISOString(),
    message_reference: { message_id: replyTo },
  });
  const answer = await fetch(control, { method: 'PUT', body: JSON.stringify({ ...tools, discordDm: dm }) });
  expect(answer.status).toBe(204);
}

function callout(page: Page) {
  return page.getByRole('region', { name: 'What agent did' }).getByRole('alert');
}

/**
 * Starts a session from Home's composer that asks Claude's question, opens it, and gives the DM the bot sent about it:
 * the first question after the start.
 */
async function asking(page: Page, message: string): Promise<FakeDiscordMessage> {
  const before = (await botSent()).length;
  await page.goto('/');
  const started = (await api(page, 'POST', '/api/sessions', {
    message: `${message} (asks)`,
    repositoryId,
    context: [],
    mode: 'build',
  })) as { sessionId: string };
  await page.goto(`/sessions/${started.sessionId}`);
  await expect(callout(page).getByText('Claude has a question')).toBeVisible({ timeout: 15_000 });
  let found: FakeDiscordMessage | undefined;
  await expect
    .poll(async () => {
      found = (await botSent()).slice(before).find((sent) => sent.content?.startsWith('Claude has a question'));
      return found !== undefined;
    })
    .toBe(true);
  if (found === undefined) throw new Error('The bot sent no question');
  return found;
}

test.beforeAll(async ({ browser }, testInfo) => {
  test.skip((testInfo.project.use.viewport?.width ?? 0) < 768, 'the questions share one hub and one Discord DM');
  const page = await browser.newPage({ baseURL: `http://127.0.0.1:${String(answersHubPort)}` });
  await page.goto('/settings/connections');
  await answerClaudeAs('signed_in', fakeClaudeDirFor(answersHubPort));
  await api(page, 'POST', '/api/claude/login/check');
  await api(page, 'PUT', '/api/discord/connection', { token: discordToken });
  const added = (await api(page, 'POST', '/api/repositories', { path: repository.clone, jiraProject: null })) as {
    id: string;
  };
  repositoryId = added.id;
  await api(page, 'PATCH', '/api/notifications/settings', { chatAnswers: { on: true, to: 'discord' } });
  await page.close();
});

test.afterAll(() => {
  rmSync(repository.root, { recursive: true, force: true });
});

test('AC-1, AC-2: the bot DMs the question, and a Reply on Discord answers it', async ({ page }) => {
  const question = await asking(page, 'Pick a library');
  expect(question.content).toContain('2. Day.js: Smaller, a new dependency');

  await reply('2', question.id);

  await expect(callout(page)).toHaveCount(0, { timeout: 30_000 });
  // A finished step's group is folded (spec 048).
  await page.getByRole('region', { name: 'What agent did' }).getByRole('button', { name: 'Expand all' }).click();
  await expect(page.getByText('You answered from Discord')).toBeVisible();
  await expect.poll(async () => (await botSent()).at(-1)?.content).toBe('Sent to Claude.');
});

test('AC-6: answered in Orynx first, the DM says so', async ({ page }) => {
  const question = await asking(page, 'Choose a library');

  await callout(page)
    .getByRole('radio', { name: /date-fns/ })
    .check();
  await callout(page).getByRole('button', { name: 'Send answer' }).click();

  await expect
    .poll(async () => (await botSent()).find((message) => message.message_reference?.message_id === question.id), {
      timeout: 15_000,
    })
    .toMatchObject({ content: 'Answered in Orynx.' });
});
