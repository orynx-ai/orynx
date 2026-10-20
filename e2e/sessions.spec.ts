import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { answerClaudeAs, fakeClaudeDirFor } from './fake-claude/config.ts';
import { controlPortFor, sessionsHubPort, type FakeTools } from './fake-tools/config.ts';

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

// Spec 011 on its own hub (playwright.config.ts): its sessions and worktrees never reach the other specs.
test.use({ baseURL: `http://127.0.0.1:${String(sessionsHubPort)}` });
test.describe.configure({ mode: 'serial' });

const tools: FakeTools = {
  sprint: true,
  issues: [
    {
      key: 'PROJ-1423',
      summary: 'Add bulk archive to the content list',
      status: 'In Progress',
      category: 'indeterminate',
    },
    // The fake Claude Code keeps working, until it's stopped, on a brief that says "(waits)".
    { key: 'PROJ-1424', summary: 'Archive old events (waits)', status: 'To Do', category: 'new' },
    { key: 'PROJ-1425', summary: 'Speed up the site picker', status: 'To Do', category: 'new' },
    { key: 'PROJ-1426', summary: 'Let admins pin a site to the top', status: 'To Do', category: 'new' },
    { key: 'PROJ-1427', summary: 'Name the export after its site', status: 'To Do', category: 'new' },
    { key: 'PROJ-1428', summary: 'Remember the last tab on profiles (waits)', status: 'To Do', category: 'new' },
    // A project with no folder in Settings › Repositories.
    { key: 'MOB-1', summary: 'Fix the mobile header', status: 'To Do', category: 'new' },
  ],
  reviews: [],
  mine: [],
  brokenIssues: ['PROJ-1427'],
};

/** The sessions the tests start, by what they show, for the checks at the end. */
const seen: { done?: string; discarded?: string; failed?: string } = {};

/** A real repository in a temporary folder, with a bare origin, and git that reads none of your settings. */
function makeRepository() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'devhub-e2e-repo-')));
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
/** Ship adds the ticket to Home's composer (spec 022); the composer's Send is what starts Claude. */
async function shipToComposer(page: Page, key: string): Promise<void> {
  await page.goto('/tickets');
  await page.getByRole('button', { name: `Ship ${key}` }).click();
  await page.waitForURL((url) => url.pathname === '/');
}

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

function connectionRow(page: Page, tool: string) {
  return page.getByRole('list', { name: 'Connections' }).getByRole('listitem').filter({ hasText: tool });
}

/** The worktrees git knows for the repository, other than its own checkout. */
function worktrees(): string[] {
  return repository
    .git(repository.clone, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((line) => line.startsWith('worktree ') && line !== `worktree ${repository.clone}`)
    .map((line) => line.slice('worktree '.length));
}

test.beforeAll(async ({ browser }, testInfo) => {
  test.skip((testInfo.project.use.viewport?.width ?? 0) < 768, 'the sessions share one hub and one repository');
  const page = await browser.newPage({ baseURL: `http://127.0.0.1:${String(sessionsHubPort)}` });
  await page.goto('/settings/connections');
  const answer = await page.request.put(`http://127.0.0.1:${String(controlPortFor(sessionsHubPort))}/tools`, {
    data: tools,
  });
  expect(answer.status()).toBe(204);

  await connectionRow(page, 'Jira').getByRole('button', { name: 'Connect' }).click();
  const jira = page.getByRole('form', { name: 'Jira connection' });
  await jira.getByRole('textbox', { name: 'Jira site' }).fill('your-team.atlassian.net');
  await jira.getByRole('textbox', { name: 'Email' }).fill('dev@example.com');
  await jira.getByLabel('API token', { exact: true }).fill('fake-good-token');
  await jira.getByRole('button', { name: 'Connect Jira' }).click();
  await expect(connectionRow(page, 'Jira').getByText('Connected', { exact: true })).toBeVisible();

  await answerClaudeAs('signed_in', fakeClaudeDirFor(sessionsHubPort));
  await api(page, 'POST', '/api/claude/login/check');
  await api(page, 'POST', '/api/repositories', { path: repository.clone, jiraProject: 'PROJ' });
  await api(page, 'POST', '/api/inbox/refresh');
  await page.close();
});

test.afterAll(() => {
  rmSync(repository.root, { recursive: true, force: true });
});

test('AC-1, AC-2, AC-3, AC-4, AC-7, AC-8, 022 AC-35, 031 AC-11: Ship then Send starts Claude, and every tab watches it finish', async ({
  page,
  context,
}) => {
  const before = repository.git(repository.clone, 'status', '--porcelain=v1', '--branch');
  await shipToComposer(page, 'PROJ-1423');
  await expect(page.getByRole('textbox', { name: 'Describe a task for Claude' })).toBeFocused();

  await page.keyboard.press('Enter');

  await page.waitForURL(/\/sessions\/[0-9a-f]{16}$/);
  seen.done = page.url();
  await expect(page.getByRole('heading', { level: 1, name: 'Add bulk archive to the content list' })).toBeVisible();
  // A second tab, open while Claude works, follows the same steps with no reload.
  const other = await context.newPage();
  await other.goto(page.url());

  const progress = page.getByRole('region', { name: "Claude's progress" });
  await expect(progress.getByText('Made a worktree')).toBeVisible();
  await expect(progress.getByText('feat/PROJ-1423 from origin/main')).toBeVisible();
  await expect(progress.getByText('Sent Claude the brief')).toBeVisible();
  await expect(progress.getByText('Explored the code')).toBeVisible();
  await expect(progress.getByText('Made a plan')).toBeVisible();
  await expect(progress.getByText('Edited 1 file')).toBeVisible({ timeout: 15_000 });
  await expect(progress.getByText('Finished')).toBeVisible({ timeout: 15_000 });
  await expect(progress.getByText('Added row selection and an Archive selected button.')).toBeVisible();
  await expect(page.getByRole('main').getByText('Done, ready for PR')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Session progress' }).getByText('Review')).toHaveAttribute(
    'aria-current',
    'step',
  );
  // Claude edited and ran no command, so Test was passed over (spec 031).
  await expect(page.getByRole('list', { name: 'Session progress' }).getByRole('listitem').nth(2)).toHaveText(
    'Test, skipped',
  );
  await expect(other.getByRole('region', { name: "Claude's progress" }).getByText('Finished')).toBeVisible();

  // The repository's own checkout is as it was; Claude's file is in the session's worktree only.
  expect(repository.git(repository.clone, 'status', '--porcelain=v1', '--branch')).toBe(before);
  const [worktree] = worktrees();
  expect(worktree).toBeDefined();
  expect(repository.git(worktree ?? '', 'branch', '--show-current')).toBe('feat/PROJ-1423');
  expect(repository.git(worktree ?? '', 'status', '--porcelain=v1', '--untracked-files=all')).toContain(
    'src/archive.ts',
  );
  await other.close();
});

test('AC-9, AC-10: Stop keeps the worktree, and Discard deletes it with its branch after asking', async ({ page }) => {
  await shipToComposer(page, 'PROJ-1424');
  await page.getByRole('button', { name: 'Send to Claude' }).click();
  await page.waitForURL(/\/sessions\/[0-9a-f]{16}$/);
  seen.discarded = page.url();
  const progress = page.getByRole('region', { name: "Claude's progress" });
  await expect(progress.getByText('Editing files')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Stop Claude' }).click();

  await expect(page.getByRole('main').getByText('Stopped', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(progress.getByText('You stopped Claude')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  const kept = worktrees().find((path) => repository.git(path, 'branch', '--show-current') === 'feat/PROJ-1424');
  expect(kept).toBeDefined();

  // Discard is in the page bar's More actions (19 Oct 2026).
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Discard changes' }).click();
  const dialog = page.getByRole('dialog', { name: "Discard Claude's changes?" });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Discard changes' }).click();

  await expect(progress.getByText('Discarded the changes')).toBeVisible();
  await expect(progress.getByText('The worktree and feat/PROJ-1424 are deleted.')).toBeVisible();
  expect(worktrees()).not.toContain(kept);
  expect(repository.git(repository.clone, 'branch', '--list', 'feat/PROJ-1424')).toBe('');
});

test('AC-11, AC-18, 022 AC-39: with two folders, the composer asks which, picked with the keyboard, and Claude starts there', async ({
  page,
}) => {
  const mobile = join(repository.root, 'mobile');
  repository.git(repository.root, 'clone', join(repository.root, 'origin.git'), mobile);
  await page.goto('/tickets');
  const added = (await api(page, 'POST', '/api/repositories', { path: mobile, jiraProject: 'PROJ' })) as { id: string };

  await shipToComposer(page, 'PROJ-1425');
  // Ship opens no folder menu; with two folders for PROJ, Home's picker asks.
  const picker = page.getByRole('button', { name: 'Choose folder' });
  await picker.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: 'Repository' });
  await menu.getByRole('menuitemradio', { name: /mobile/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Repository: mobile' })).toBeVisible();
  await page.getByRole('button', { name: 'Send to Claude' }).click();

  await page.waitForURL(/\/sessions\/[0-9a-f]{16}$/);
  await expect(
    page.getByRole('main').getByText('in mobile · separate worktree, your main checkout is untouched'),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: "Claude's progress" }).getByText('Finished')).toBeVisible({
    timeout: 15_000,
  });
  const inMobile = repository.git(mobile, 'worktree', 'list', '--porcelain');
  expect(inMobile).toContain('branch refs/heads/feat/PROJ-1425');
  await api(page, 'DELETE', `/api/repositories/${added.id}`);
});

test('AC-12 (Q4): with Claude Code signed out, Send says so and offers the fix', async ({ page }) => {
  await answerClaudeAs('signed_out', fakeClaudeDirFor(sessionsHubPort));
  await page.goto('/tickets');
  await api(page, 'POST', '/api/claude/login/check');
  await shipToComposer(page, 'PROJ-1426');
  await page.getByRole('button', { name: 'Send to Claude' }).click();

  const said = page.getByRole('alert').filter({ hasText: "Claude Code isn't signed in." });
  await expect(said).toBeVisible();
  await said.getByRole('link', { name: 'Open Settings › Coding agent' }).click();
  await expect(page).toHaveURL(/\/settings\/coding-agent$/);

  await answerClaudeAs('signed_in', fakeClaudeDirFor(sessionsHubPort));
  await api(page, 'POST', '/api/claude/login/check');
});

test('AC-13: when Jira won’t give the ticket, the session says it couldn’t start, and why', async ({ page }) => {
  // Ship's start reads the ticket once its session is made; the composer reads it first and makes nothing (spec
  // 015, AC-21), so this start goes to the server as Ship's own did.
  await page.goto('/tickets');
  const started = (await api(page, 'POST', '/api/sessions', { ticketKey: 'PROJ-1427' })) as { sessionId: string };
  await page.goto(`/sessions/${started.sessionId}`);
  seen.failed = page.url();

  const alert = page.getByRole('region', { name: "Claude's progress" }).getByRole('alert');
  await expect(alert).toContainText("Claude couldn't start");
  await expect(alert).toContainText(
    "Orynx couldn't read PROJ-1427 from Jira. Check Settings › Connections, then start again.",
  );
  await expect(page.getByRole('main').getByText('Stopped', { exact: true })).toBeVisible();
});

test('AC-15, AC-18, 022 AC-28: Home opens a live session, and a row’s +, Send, Stop and Discard all work from the keyboard', async ({
  page,
}) => {
  await api(await page.goto('/').then(() => page), 'POST', '/api/inbox/refresh');
  const panel = page.getByRole('region', { name: 'Needs your attention' });
  const live = panel.getByRole('listitem').filter({ hasText: 'Add bulk archive to the content list' });
  await expect(live.getByRole('link', { name: /^Open session: / })).toHaveAttribute(
    'href',
    new URL(seen.done ?? '').pathname,
  );

  const add = panel.getByRole('button', { name: 'Add PROJ-1428 to the composer' });
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('button', { name: 'Remove PROJ-1428 from the composer' })).toBeFocused();
  await page.getByRole('textbox', { name: 'Describe a task for Claude' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/sessions\/[0-9a-f]{16}$/);
  await expect(page.getByRole('region', { name: "Claude's progress" }).getByText('Editing files')).toBeVisible({
    timeout: 15_000,
  });

  const stop = page.getByRole('button', { name: 'Stop Claude' });
  await stop.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused({ timeout: 10_000 });

  // Discard is the last item in the page bar's More actions (19 Oct 2026).
  const more = page.getByRole('button', { name: 'More actions' });
  await more.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: 'Discard changes' })).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: "Discard Claude's changes?" });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(more).toBeFocused();
});

test('AC-19: each session state has no axe violations, at 1280 and 360 px, in light and dark', async ({ page }) => {
  const check = async (selector = 'body') => {
    await page.addScriptTag({ path: axePath });
    return page.evaluate(async (context) => {
      const target = document.querySelector(context);
      if (target === null) throw new Error(`Nothing matches ${context}`);
      // axe reads colours as drawn, so anything still fading in must settle first.
      const moving = document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);
      await Promise.allSettled(moving.map((animation) => animation.finished));
      const results = await window.axe.run(target, { resultTypes: ['violations'] });
      return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
    }, selector);
  };
  for (const url of [seen.done, seen.discarded, seen.failed]) {
    if (url === undefined) throw new Error('A session the earlier tests start is missing');
    for (const width of [1280, 360]) {
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height: 800 });
        await page.emulateMedia({ colorScheme });
        await page.goto(url);
        await expect(page.getByRole('region', { name: "Claude's progress" })).toBeVisible();
        expect(await check(), `${url} at ${String(width)} px, ${colorScheme}`).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      }
    }
  }

  // An open dialog hides the rest of the page from screen readers, so it is checked on its own (spec 022, AC-61).
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/tickets');
  const card = page.getByRole('article', { name: 'Speed up the site picker' });
  await card.getByRole('button', { name: 'Speed up the site picker' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Description' })).toBeVisible();
  expect(await check('[role="dialog"]')).toEqual([]);
});
