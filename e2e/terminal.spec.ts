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
/** The session's worktree, named after it: it has no branch until Claude's first edit (spec 042). */
function worktreeOf(url: string): string | undefined {
  const id = new URL(url).pathname.split('/').at(-1) ?? '';
  return repository
    .git(repository.clone, 'worktree', 'list', '--porcelain')
    .split('\n\n')
    .map((block) => block.split('\n')[0]?.slice('worktree '.length) ?? '')
    .find((path) => id !== '' && path.endsWith(`/${id}`));
}

/** The session the tests share, once Claude has made its worktree. */
let sessionUrl = '';

/** The open Terminal's first shell tab: the terminal, and its rows as a screen reader reads them. */
function shell(page: Page, name = /· worktree$/) {
  const terminal = page.getByRole('dialog', { name: 'Terminal' }).getByRole('group', { name });
  return { terminal, rows: terminal.getByRole('list') };
}

/** Types a line into the focused shell and presses Enter, as you would. */
async function typeLine(page: Page, line: string) {
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
}

/** Terminal, from the page bar (spec 048); the shell takes your keys once it's drawn. */
async function openTerminal(page: Page) {
  await page.goto(sessionUrl);
  await page.getByRole('main').getByRole('button', { name: 'Terminal', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Terminal' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /· worktree$/ })).toBeFocused();
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
  // Its worktree is there once Claude has finished; Terminal in the page bar is at hand before that (spec 048).
  await expect(page.getByRole('main').getByText('Done, ready for PR', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.close();
});

test.afterAll(() => {
  rmSync(repository.root, { recursive: true, force: true });
});

test('AC-1 (038): your shell starts in the session’s worktree, with your environment less Orynx’s', async ({
  page,
}) => {
  await openTerminal(page);
  const { rows } = shell(page);

  await typeLine(page, 'pwd -P');
  await expect(rows).toContainText(worktreeOf(sessionUrl) ?? 'no worktree', { timeout: 15_000 });
  await typeLine(page, 'echo "term=$TERM orynx=$(env | grep -c ^DEVHUB_)"');
  await expect(rows).toContainText('term=xterm-256color orynx=0');
});

test('AC-2, AC-3 (038): a command reads what you type, ⌃C stops one, and cd carries over', async ({ page }) => {
  await openTerminal(page);
  const { rows } = shell(page);

  await typeLine(page, 'read answer; echo "got:$answer"');
  await typeLine(page, 'yes');
  await expect(rows).toContainText('got:yes', { timeout: 15_000 });

  await typeLine(page, 'sleep 60');
  await page.keyboard.press('Control+c');
  await typeLine(page, 'echo "after-$((1+1))"');
  await expect(rows).toContainText('after-2', { timeout: 10_000 });

  await typeLine(page, 'mkdir -p deeper && cd deeper && echo "in-$(basename "$PWD")"');
  await expect(rows).toContainText('in-deeper');
  await typeLine(page, 'echo "still-$(basename "$PWD")"');
  await expect(rows).toContainText('still-deeper');
});

test('AC-5 (038): it scrolls back through long output, and comes back with it after closing', async ({ page }) => {
  await openTerminal(page);
  const { terminal } = shell(page);
  // A drawn row: the terminal draws only the rows in view.
  const row = (text: string) => terminal.getByText(text, { exact: true }).first();
  await typeLine(page, 'clear; seq 1 300');
  await expect(row('300')).toBeVisible({ timeout: 15_000 });
  await expect(terminal.getByText('250', { exact: true })).toHaveCount(0);

  // A wheel's notches, as a mouse sends them: each scrolls a couple of lines.
  await terminal.hover();
  for (let notch = 0; notch < 20; notch++) await page.mouse.wheel(0, -100);
  await expect(row('250')).toBeVisible();
  await page.keyboard.press('Shift+PageDown');

  await page.getByRole('button', { name: 'Close terminal' }).click();
  await openTerminal(page);
  await expect(row('300')).toBeVisible();
});

test('AC-6, AC-7 (038): + opens another shell, and exit closes it', async ({ page }) => {
  await openTerminal(page);
  await page.getByRole('button', { name: 'New terminal in this session' }).click();
  await expect(page.getByRole('textbox', { name: / 2$/ })).toBeFocused();
  await typeLine(page, 'exit');
  await expect(page.getByRole('tab', { name: / 2$/ })).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole('textbox', { name: /· worktree$/ })).toBeVisible();
});

test('AC-2, AC-31: Esc stays in your shell, Close gives focus back to Terminal, and nothing fails axe', async ({
  page,
}) => {
  await openTerminal(page);
  await typeLine(page, 'git status');
  await expect(shell(page).rows).toContainText('On branch', { timeout: 15_000 });

  await page.keyboard.press('Escape');
  const dialog = page.getByRole('dialog', { name: 'Terminal' });
  await expect(dialog).toBeVisible();

  await page.addScriptTag({ path: axePath });
  // The dialog fades in; axe on half-drawn text would read the wrong contrast. The cursor blinks for ever.
  await dialog.evaluate((element) =>
    Promise.all(
      element
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    ),
  );
  const results = await dialog.evaluate((element) =>
    window.axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }),
  );
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);

  await page.getByRole('button', { name: 'Close terminal' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('main').getByRole('button', { name: 'Terminal', exact: true })).toBeFocused();
});
