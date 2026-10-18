import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { answerClaudeAs, fakeClaudeDirFor } from './fake-claude/config.ts';
import { controlPortFor, sessionsHubPort, type FakeTools } from './fake-tools/config.ts';

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
  ],
  reviews: [],
  mine: [],
};

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

test('AC-1, AC-2, AC-3, AC-4, AC-7, AC-8: Build on a card starts Claude, and every tab watches it finish', async ({
  page,
  context,
}) => {
  const before = repository.git(repository.clone, 'status', '--porcelain=v1', '--branch');
  await page.goto('/tickets');

  await page.getByRole('button', { name: 'Build PROJ-1423 with Claude' }).click();

  await page.waitForURL(/\/sessions\/[0-9a-f]{16}$/);
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
  await page.goto('/tickets');
  await page.getByRole('button', { name: 'Build PROJ-1424 with Claude' }).click();
  await page.waitForURL(/\/sessions\/[0-9a-f]{16}$/);
  const progress = page.getByRole('region', { name: "Claude's progress" });
  await expect(progress.getByText('Editing files')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Stop Claude' }).click();

  await expect(page.getByRole('main').getByText('Stopped', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(progress.getByText('You stopped Claude')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  const kept = worktrees().find((path) => repository.git(path, 'branch', '--show-current') === 'feat/PROJ-1424');
  expect(kept).toBeDefined();

  await page.getByRole('button', { name: 'Discard changes' }).click();
  const dialog = page.getByRole('dialog', { name: "Discard Claude's changes?" });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Discard changes' }).click();

  await expect(progress.getByText('Discarded the changes')).toBeVisible();
  await expect(progress.getByText('The worktree and feat/PROJ-1424 are deleted.')).toBeVisible();
  expect(worktrees()).not.toContain(kept);
  expect(repository.git(repository.clone, 'branch', '--list', 'feat/PROJ-1424')).toBe('');
});
