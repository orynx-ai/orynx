import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { answerClaudeAs, fakeClaudeDirFor } from './fake-claude/config.ts';
import { controlPortFor, terminalHubPort, type FakeTools } from './fake-tools/config.ts';

declare global {
  interface Window {
    axe: {
      run: (
        context: Element,
        options: object,
      ) => Promise<{ violations: { id: string; help: string; nodes: { target: string[] }[] }[] }>;
    };
  }
}

const axePath = createRequire(new URL('../packages/ui/package.json', import.meta.url)).resolve('axe-core/axe.min.js');

// Spec 036 on its own hub (playwright.config.ts): your commands run in its sessions' worktrees.
test.use({ baseURL: `http://127.0.0.1:${String(terminalHubPort)}` });
test.describe.configure({ mode: 'serial' });

// The fake Claude Code edits a file and finishes, which leaves the session's worktree for the Terminal.
const tools: FakeTools = {
  sprint: true,
  issues: [{ key: 'TRM-1', summary: 'Add a terminal to the session', status: 'To Do', category: 'new' }],
  reviews: [],
  mine: [],
};

/** A real repository in a temporary folder, with a bare origin, and git that reads none of your settings. */
function makeRepository() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'devhub-e2e-terminal-repo-')));
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
  const origin = join(root, 'origin.git');
  const seed = join(root, 'seed');
  const clone = join(root, 'web-app');
  git(root, 'init', '--bare', origin);
  git(root, 'clone', origin, seed);
  writeFileSync(join(seed, 'README.md'), '# web-app\n');
  git(seed, 'add', '.');
  git(seed, 'commit', '-m', 'first');
  git(seed, 'push', 'origin', 'main');
  git(root, 'clone', origin, clone);
  return { root, clone, git };
}

const repository = makeRepository();

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

/** The worktree git keeps for the session's branch. */
function worktreeOf(branch: string): string | undefined {
  const blocks = repository.git(repository.clone, 'worktree', 'list', '--porcelain').split('\n\n');
  const block = blocks.find((one) => one.includes(`branch refs/heads/${branch}`));
  return block
    ?.split('\n')
    .find((line) => line.startsWith('worktree '))
    ?.slice('worktree '.length);
}

/** The session the tests share, once Claude has made its worktree. */
let sessionUrl = '';

/** Runs a command in the open Terminal's shell tab and gives back its block once it has ended. */
async function run(page: Page, command: string) {
  const field = page.getByRole('textbox', { name: 'Command' });
  await field.fill(command);
  await field.press('Enter');
  await expect(field).toHaveValue('');
  const block = page.getByRole('log', { name: 'Terminal output' }).getByRole('group', { name: command }).last();
  await expect(block.getByText(/^(✓|✗)/)).toBeVisible({ timeout: 15_000 });
  return block;
}

async function openTerminal(page: Page) {
  await page.goto(sessionUrl);
  const terminal = page.getByRole('button', { name: 'Terminal', exact: true });
  await expect(terminal).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Control+Backquote');
  await expect(page.getByRole('dialog', { name: 'Terminal' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Command' })).toBeFocused();
}

test.beforeAll(async ({ browser }, testInfo) => {
  test.skip((testInfo.project.use.viewport?.width ?? 0) < 768, 'the tests share one hub, one session and its tabs');
  const page = await browser.newPage({ baseURL: `http://127.0.0.1:${String(terminalHubPort)}` });
  await page.goto('/settings/connections');
  const answer = await page.request.put(`http://127.0.0.1:${String(controlPortFor(terminalHubPort))}/tools`, {
    data: tools,
  });
  expect(answer.status()).toBe(204);

  await page.getByRole('button', { name: 'Jira: Not connected. Manage connection' }).click();
  const jira = page.getByRole('form', { name: 'Jira connection' });
  await jira.getByRole('textbox', { name: 'Jira site' }).fill('your-team.atlassian.net');
  await jira.getByRole('textbox', { name: 'Email' }).fill('dev@example.com');
  await jira.getByLabel('API token', { exact: true }).fill('fake-good-token');
  await page.getByRole('dialog', { name: 'Jira' }).getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Jira: Connected. Manage connection' })).toBeVisible();

  await answerClaudeAs('signed_in', fakeClaudeDirFor(terminalHubPort));
  await api(page, 'POST', '/api/claude/login/check');
  await api(page, 'POST', '/api/repositories', { path: repository.clone, jiraProject: 'TRM' });
  await api(page, 'POST', '/api/inbox/refresh');

  // Ship adds the ticket to Home's composer (spec 022); Send starts Claude on it and opens its Session screen.
  await page.goto('/tickets');
  await page.getByRole('button', { name: 'Ship TRM-1' }).click();
  await page.waitForURL((url) => url.pathname === '/');
  await page.getByRole('button', { name: 'Send to Claude' }).click();
  await page.waitForURL(/\/sessions\/[0-9a-f]{16}$/);
  sessionUrl = page.url();
  await page.close();
});

test.afterAll(() => {
  rmSync(repository.root, { recursive: true, force: true });
});

test('AC-1, AC-4: ⌃` opens your shell on the session’s worktree, and a command runs there', async ({ page }) => {
  await openTerminal(page);

  const block = await run(page, 'pwd');
  await expect(block.getByText(/^✓/)).toBeVisible();
  const printed = (await block.locator('pre').textContent()) ?? '';
  expect(realpathSync(printed.trim())).toBe(worktreeOf('feat/TRM-1'));
});

test('AC-29: your command gets your environment without Orynx’s settings, and asks for plain output', async ({
  page,
}) => {
  await openTerminal(page);

  const block = await run(page, 'env');
  const printed = (await block.locator('pre').textContent()) ?? '';
  expect(printed).toContain('NO_COLOR=1');
  expect(printed).not.toMatch(/^DEVHUB_/m);
  expect(printed).not.toMatch(/^NODE_ENV=/m);
});

test('AC-6, AC-8, AC-9: a command that fails says its exit code; one that runs shows Stop, which ends it', async ({
  page,
}) => {
  await openTerminal(page);

  const missing = await run(page, 'nosuchcommand');
  await expect(missing.getByText('✗ exit 127', { exact: false })).toBeVisible();

  const field = page.getByRole('textbox', { name: 'Command' });
  await field.fill('echo ready; sleep 60');
  await field.press('Enter');
  const log = page.getByRole('log', { name: 'Terminal output' });
  await expect(log.getByText('● running')).toBeVisible();
  await expect(field).toHaveAttribute('placeholder', /is running\. ⌃C stops it/);
  await log.getByRole('button', { name: 'Stop echo ready; sleep 60' }).click();
  await expect(log.getByText(/✗ exit 143/)).toBeVisible({ timeout: 10_000 });
});

test('AC-2, AC-31: Esc gives focus back to Terminal, and the open Terminal has no accessibility violations', async ({
  page,
}) => {
  await openTerminal(page);
  await run(page, 'git status');

  await page.addScriptTag({ path: axePath });
  // The dialog fades in; axe on half-drawn text would read the wrong contrast.
  const dialog = page.getByRole('dialog', { name: 'Terminal' });
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)),
  );
  const results = await dialog.evaluate((element) =>
    window.axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }),
  );
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Terminal', exact: true })).toBeFocused();
});
