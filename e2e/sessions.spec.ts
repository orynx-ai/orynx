import { execFileSync, spawn } from 'node:child_process';
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
    // Spec 042: the fake reads this ask as a run, and its Claude reads, then waits, editing nothing.
    { key: 'PROJ-1429', summary: 'Start the dev server (run)', status: 'To Do', category: 'new' },
    // A project with no folder in Settings › Repositories.
    { key: 'MOB-1', summary: 'Fix the mobile header', status: 'To Do', category: 'new' },
  ],
  reviews: [],
  mine: [],
  brokenIssues: ['PROJ-1427'],
};

/** The sessions the tests start, by what they show, for the checks at the end. */
const seen: { done?: string; failed?: string } = {};

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

  await page.getByRole('button', { name: 'Jira: Not connected. Manage connection' }).click();
  const jira = page.getByRole('form', { name: 'Jira connection' });
  await jira.getByRole('textbox', { name: 'Jira site' }).fill('your-team.atlassian.net');
  await jira.getByRole('textbox', { name: 'Email' }).fill('dev@example.com');
  await jira.getByLabel('API token', { exact: true }).fill('fake-good-token');
  await page.getByRole('dialog', { name: 'Jira' }).getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Jira: Connected. Manage connection' })).toBeVisible();

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

  const progress = page.getByRole('region', { name: 'What agent did' });
  await expect(progress.getByText('Finished')).toBeVisible({ timeout: 15_000 });
  await expect(progress.getByText('Added row selection and an Archive selected button.')).toBeVisible();
  // Each step opened, every row shows (spec 048). Spec 042: Orynx reads the ask first, and the branch comes at
  // Claude's first edit.
  await progress.getByRole('button', { name: 'Expand all' }).click();
  await expect(progress.getByText('Code change · from main')).toBeVisible();
  await expect(progress.getByText('Made a worktree')).toBeVisible();
  await expect(progress.getByText('from origin/main')).toBeVisible();
  await expect(progress.getByText('Sent Claude the brief')).toBeVisible();
  await expect(progress.getByText('Explored the code')).toBeVisible();
  await expect(progress.getByText('Made a plan')).toBeVisible();
  await expect(progress.getByText('Made branch feat/PROJ-1423')).toBeVisible();
  await expect(progress.getByText('Edited 1 file')).toBeVisible();
  await expect(page.getByRole('main').getByText('Done, ready for PR')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Session progress' }).getByText('Review')).toHaveAttribute(
    'aria-current',
    'step',
  );
  // Claude edited and ran no command, so Test was passed over (spec 031).
  await expect(page.getByRole('list', { name: 'Session progress' }).getByRole('listitem').nth(2)).toHaveText(
    'Test, skipped',
  );
  await expect(other.getByRole('region', { name: 'What agent did' }).getByText('Finished')).toBeVisible();

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

test('AC-9, 039 AC-32: Stop keeps the worktree, and Delete takes the session and, when ticked, its branch', async ({
  page,
}) => {
  await shipToComposer(page, 'PROJ-1424');
  await page.getByRole('button', { name: 'Send to Claude' }).click();
  await page.waitForURL(/\/sessions\/[0-9a-f]{16}$/);
  const url = page.url();
  const progress = page.getByRole('region', { name: 'What agent did' });
  await expect(progress.getByText('Editing files')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Stop', exact: true }).click();

  await expect(page.getByRole('main').getByText('Stopped', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(progress.getByText('You stopped Claude')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  const kept = worktrees().find((path) => repository.git(path, 'branch', '--show-current') === 'feat/PROJ-1424');
  expect(kept).toBeDefined();

  // Delete took Discard changes' place in the page bar's More actions (spec 039, the user's call, 20 Oct 2026).
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete this session?' });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('checkbox', { name: 'Also delete the branch feat/PROJ-1424' }).check();
  await dialog.getByRole('button', { name: 'Delete' }).click();

  await page.waitForURL(/\/sessions$/);
  expect(worktrees().some((path) => path === kept)).toBe(false);
  expect(repository.git(repository.clone, 'branch', '--list', 'feat/PROJ-1424')).toBe('');
  await page.goto(url);
  await expect(page.getByText('This page does not exist')).toBeVisible();
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
  // The title's line: the folder, in its own worktree (spec 048).
  await expect(page.getByRole('main').getByText('mobile', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByText('own worktree')).toBeVisible();
  await expect(page.getByRole('region', { name: 'What agent did' }).getByText('Finished')).toBeVisible({
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

  const alert = page.getByRole('region', { name: 'What agent did' }).getByRole('alert');
  await expect(alert).toContainText("Claude couldn't start");
  await expect(alert).toContainText(
    "Orynx couldn't read PROJ-1427 from Jira. Check Settings › Connections, then start again.",
  );
  await expect(page.getByRole('main').getByText('Stopped', { exact: true })).toBeVisible();
});

test('AC-15, AC-18, 022 AC-28: Home opens a live session, and a row’s +, Send, Stop and Delete all work from the keyboard', async ({
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
  await expect(page.getByRole('region', { name: 'What agent did' }).getByText('Editing files')).toBeVisible({
    timeout: 15_000,
  });

  const stop = page.getByRole('button', { name: 'Stop', exact: true });
  await stop.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused({ timeout: 10_000 });

  // Delete is the last item in the page bar's More actions (spec 039: it took Discard changes' place).
  const more = page.getByRole('button', { name: 'More actions', exact: true });
  await more.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('alertdialog', { name: 'Delete this session?' });
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
      // Only animations on the page's clock end: a scroll-driven one (the sidebar's scroll-fade-y) never does.
      const moving = document
        .getAnimations()
        .filter(
          (animation) =>
            animation.timeline === document.timeline && animation.effect?.getComputedTiming().endTime !== Infinity,
        );
      await Promise.allSettled(moving.map((animation) => animation.finished));
      const results = await window.axe.run(target, { resultTypes: ['violations'] });
      return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
    }, selector);
  };
  // The finished session has the next-move bar (spec 048); the one that couldn't start has none.
  for (const [url, bar] of [
    [seen.done, true],
    [seen.failed, false],
  ] as const) {
    if (url === undefined) throw new Error('A session the earlier tests start is missing');
    for (const width of [1280, 360]) {
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height: 800 });
        await page.emulateMedia({ colorScheme });
        await page.goto(url);
        await expect(page.getByRole('region', { name: 'What agent did' })).toBeVisible();
        // It comes once the changes have loaded, fading in: axe reads it once it's there.
        if (bar) await expect(page.getByRole('status', { name: 'Ready for a pull request' })).toBeVisible();
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

test('AC-17 (spec 048): side by side, What agent did scrolls on its own, with the follow-up box at its foot', async ({
  page,
}) => {
  if (seen.done === undefined) throw new Error('A session the earlier tests start is missing');
  // A short window, so every step opened is taller than the pane can be.
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto(seen.done);
  const progress = page.getByRole('region', { name: 'What agent did' });
  await progress.getByRole('button', { name: 'Expand all' }).click();
  const box = page.getByRole('textbox', { name: 'Message Claude' });
  const tabs = page.getByRole('tablist', { name: 'Session details' });

  // The pane stays within the window, with its box at its foot and the tabs beside it in view.
  expect((await progress.boundingBox())?.height ?? Infinity).toBeLessThanOrEqual(600);
  await expect(box).toBeInViewport();
  await expect(tabs).toBeInViewport();
  // Reading down to Claude's last step moves only the pane.
  await progress.getByText('Added row selection and an Archive selected button.').scrollIntoViewIfNeeded();
  await expect(box).toBeInViewport();
  await expect(tabs).toBeInViewport();
  await expect(progress.getByText('Made a worktree')).not.toBeInViewport();
});

test('039 AC-18, AC-21, AC-24-AC-28, AC-32, AC-35: a row’s ⋯ shows on hover; rename, pin, search and delete', async ({
  page,
}) => {
  if (seen.done === undefined || seen.failed === undefined)
    throw new Error('A session the earlier tests start is missing');
  const doneId = new URL(seen.done).pathname.split('/').pop() ?? '';
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/sessions');
  const nav = page.getByRole('navigation', { name: 'Main' });
  const row = nav.locator(`a[href="/sessions/${doneId}"]`);
  const more = row.locator('xpath=..').getByRole('button', { name: /^More actions for / });

  // AC-24: out of sight until the pointer is over the row, beside the link rather than in it.
  const actions = more.locator('..');
  await expect(actions).toHaveCSS('opacity', '0');
  await row.hover();
  await expect(actions).toHaveCSS('opacity', '1');

  // AC-28: Rename opens with the name selected, so typing replaces it.
  await more.click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const rename = page.getByRole('dialog', { name: 'Rename session' });
  await expect(rename.getByRole('textbox', { name: 'Name' })).toBeFocused();
  await page.keyboard.type('Bulk archive, renamed');
  await rename.getByRole('button', { name: 'Save' }).click();
  await expect(nav.getByRole('link', { name: /^Bulk archive, renamed/ })).toBeVisible();
  await expect(more).toBeFocused();

  // AC-26: Pin moves it under Pinned, at the top of the sidebar and of the Sessions page.
  await more.click();
  await page.getByRole('menuitem', { name: 'Pin' }).click();
  await expect(
    nav.getByRole('list', { name: 'Pinned' }).getByRole('link', { name: /^Bulk archive, renamed/ }),
  ).toBeVisible();
  const main = page.getByRole('main');
  await expect(
    main.getByRole('list', { name: 'Pinned' }).getByRole('link', { name: /^Bulk archive, renamed/ }),
  ).toBeVisible();

  // AC-18, AC-21: Search sessions narrows as you type, and Enter keeps the search.
  const search = main.getByRole('searchbox', { name: 'Search sessions' });
  await search.fill('renamed');
  await search.press('Enter');
  await expect(page).toHaveURL(/[?&]q=renamed/);
  await expect(main.getByRole('link')).toHaveCount(1);
  await search.fill('');
  await expect(
    main.getByRole('group', { name: 'Recent searches' }).getByRole('button', { name: 'Search for renamed' }),
  ).toBeVisible();

  // AC-32, AC-35: Delete from the session's own More actions goes to the Sessions page, and the address is gone.
  await page.goto(seen.failed);
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('alertdialog', { name: 'Delete this session?' }).getByRole('button', { name: 'Delete' }).click();
  await page.waitForURL(/\/sessions$/);
  await page.goto(seen.failed);
  await expect(page.getByText('This page does not exist')).toBeVisible();
});

test('042 AC-1, AC-3, AC-6, AC-8, AC-33: a run reads as one, opens on Ports, leaves no branch, and a server found in its worktree stops after a confirm', async ({
  page,
}) => {
  await shipToComposer(page, 'PROJ-1429');
  await expect(page.getByRole('textbox', { name: 'Describe a task for Claude' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/sessions\/[0-9a-f]{16}$/);
  const id = new URL(page.url()).pathname.split('/').at(-1) ?? '';

  const progress = page.getByRole('region', { name: 'What agent did' });
  await expect(progress.getByText('Run · from main · no branch yet')).toBeVisible();
  const stepper = page.getByRole('list', { name: 'Session progress' }).getByRole('listitem');
  await expect(stepper).toHaveCount(2);
  await expect(stepper.nth(1)).toContainText('Start server');
  await expect(page.getByRole('main').getByText('No branch yet', { exact: true })).toBeVisible();
  const tabs = page.getByRole('tablist', { name: 'Session details' }).getByRole('tab');
  // Ports after Changes (spec 048), and the tab a run opens on.
  await expect(tabs.nth(1)).toHaveText('Ports');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByText('Nothing listens from this session. Servers Claude or you start here show up on their own.'),
  ).toBeVisible();

  // A server started in the worktree some other way, as a nohup or Popen would.
  const worktree = worktrees().find((path) => path.endsWith(id)) ?? '';
  expect(worktree).not.toBe('');
  const server = spawn(
    process.execPath,
    ['-e', "const s = require('net').createServer().listen(0, () => process.stdout.write(s.address().port + '\\n'))"],
    {
      cwd: worktree,
    },
  );
  try {
    // The port it printed, wherever it lands in the output.
    let said = '';
    const port = await new Promise<number>((resolve) => {
      server.stdout.on('data', (data: Buffer) => {
        said += String(data);
        const found = /^(\d+)$/m.exec(said);
        if (found !== null) resolve(Number(found[1]));
      });
    });
    const address = `localhost:${String(port)}`;
    const ports = page.getByRole('list', { name: 'Ports' });
    await expect(ports.getByText(address)).toBeVisible({ timeout: 10_000 });
    await expect(ports.getByText(/^Found in the worktree · /)).toBeVisible();
    await expect(tabs.nth(1)).toHaveText('Ports 1');
    await page.getByRole('button', { name: `Stop ${address}` }).click();
    const ask = page.getByRole('alertdialog', { name: `Stop ${address}?` });
    await ask.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(
      page.getByText('Nothing listens from this session. Servers Claude or you start here show up on their own.'),
    ).toBeVisible({ timeout: 10_000 });
    await expect(progress.getByText(`Stopped the server on ${address}`)).toBeVisible();
  } finally {
    server.kill('SIGKILL');
  }

  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('main').getByText('Stopped')).toBeVisible();
  expect(repository.git(repository.clone, 'branch', '--list', 'feat/PROJ-1429*')).toBe('');
});
