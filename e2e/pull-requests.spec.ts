import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { answerClaudeAs, fakeClaudeDirFor } from './fake-claude/config.ts';
import { controlPortFor, pullRequestsHubPort, type FakeTools } from './fake-tools/config.ts';

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

// Spec 014 on its own hub (playwright.config.ts): its sessions commit and push, to a bare repository standing in for
// github.com, its git has a name of its own, and its fake GitHub opens pull requests.
const hub = `http://127.0.0.1:${String(pullRequestsHubPort)}`;
const control = `http://127.0.0.1:${String(controlPortFor(pullRequestsHubPort))}/tools`;
test.use({ baseURL: hub });
test.describe.configure({ mode: 'serial' });

const number = 2841;
const pr = `#${String(number)}`;
const github = 'https://github.com/acme/web-app.git';

const tools: FakeTools = {
  issues: [
    // The fake Claude Code edits `src/archive.ts` and finishes.
    {
      key: 'PULL-1',
      summary: 'Add bulk archive to the content list',
      status: 'In Progress',
      category: 'indeterminate',
    },
    { key: 'PULL-2', summary: 'Archive old events', status: 'To Do', category: 'new' },
    // "(no draft)": the fake Claude Code fails a drafting call, as a signed-out one would.
    { key: 'PULL-3', summary: 'Speed up the picker (no draft)', status: 'To Do', category: 'new' },
  ],
  reviews: [],
  mine: [],
  pulls: [],
};

/** The sessions the tests share, once started. */
const seen: { opened?: string; secret?: string } = {};

/**
 * A real repository with a bare origin, whose origin reads as github.com: git rewrites that address to the bare
 * repository, so the hub's fetch and push never leave this computer.
 */
function makeRepository() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'devhub-e2e-pull-requests-repo-')));
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
  git(clone, 'remote', 'set-url', 'origin', github);
  git(clone, 'config', `url.${origin}.insteadOf`, github);
  return { root, clone, origin, git };
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

/** Starts Claude on a ticket through the API, and opens its session once Claude is done. */
async function startDone(page: Page, ticketKey: string): Promise<string> {
  await page.goto('/');
  const started = (await api(page, 'POST', '/api/sessions', { ticketKey })) as { sessionId: string };
  const url = `/sessions/${started.sessionId}`;
  await page.goto(url);
  await expect(page.getByRole('main').getByText('Done, ready for PR')).toBeVisible({ timeout: 15_000 });
  return url;
}

async function worktreeOf(page: Page, url: string): Promise<string> {
  const session = (await api(page, 'GET', `/api${url}`)) as { worktreePath: string };
  return realpathSync(session.worktreePath);
}

const dialog = (page: Page, name = 'Create pull request') => page.getByRole('dialog', { name });
const progressOf = (page: Page) => page.getByRole('region', { name: "Claude's progress" });

test.beforeAll(async ({ browser }, testInfo) => {
  test.skip((testInfo.project.use.viewport?.width ?? 0) < 768, 'the sessions share one hub and one repository');
  const page = await browser.newPage({ baseURL: hub });
  await page.goto('/settings/connections');
  expect((await page.request.put(control, { data: tools })).status()).toBe(204);
  await api(page, 'PUT', '/api/jira/connection', {
    site: 'your-team.atlassian.net',
    email: 'dev@example.com',
    apiToken: 'fake-good-token',
  });
  await api(page, 'PUT', '/api/github/connection', { method: 'token', token: 'fake-github-token-for-tests' });
  await answerClaudeAs('signed_in', fakeClaudeDirFor(pullRequestsHubPort));
  await api(page, 'POST', '/api/claude/login/check');
  await api(page, 'POST', '/api/repositories', { path: repository.clone, jiraProject: 'PULL' });
  await page.close();
});

test.afterAll(() => {
  rmSync(repository.root, { recursive: true, force: true });
});

test('AC-1, AC-2, AC-4, AC-5, AC-13: Create pull request opens the PR as you leave it, and every tab shows PR open', async ({
  page,
  context,
}) => {
  seen.opened = await startDone(page, 'PULL-1');
  const other = await context.newPage();
  await other.goto(seen.opened);

  await page.getByRole('button', { name: 'Create pull request' }).click();
  const title = dialog(page).getByRole('textbox', { name: 'Title' });
  await expect(title).toHaveValue('PULL-1: Add bulk archive to the content list', { timeout: 10_000 });
  await expect(title).toBeFocused();
  await expect(dialog(page).getByRole('textbox', { name: 'Description' })).toHaveValue(/## What changed/);
  await expect(dialog(page).getByText('acme/web-app · feat/PULL-1 → main')).toBeVisible();
  await expect(
    dialog(page).getByText(
      'Orynx commits 1 changed file, pushes feat/PULL-1 to acme/web-app and opens the pull request.',
    ),
  ).toBeVisible();

  await title.fill('PULL-1: Bulk archive for the content list');
  await dialog(page).getByRole('button', { name: 'Create pull request' }).click();

  await expect(dialog(page)).toHaveCount(0, { timeout: 15_000 });
  for (const tab of [page, other]) {
    await expect(tab.getByRole('main').getByText('PR open', { exact: true })).toBeVisible();
    await expect(tab.getByRole('link', { name: `Open PR ${pr}` })).toHaveAttribute(
      'href',
      `https://github.com/acme/web-app/pull/${String(number)}`,
    );
  }
  await expect(page.getByRole('link', { name: `Open PR ${pr}` })).toBeFocused();
  await expect(progressOf(page).getByText(`Opened pull request ${pr}`)).toBeVisible();
  await expect(progressOf(page).getByText('Committed 1 file and pushed feat/PULL-1')).toBeVisible();
  await other.close();

  // On "github.com": the branch with Orynx's commit, by the hub's own git name, and the pull request as you left it.
  const worktree = await worktreeOf(page, seen.opened);
  expect(repository.git(repository.origin, 'rev-parse', 'refs/heads/feat/PULL-1')).toBe(
    repository.git(worktree, 'rev-parse', 'HEAD'),
  );
  expect(repository.git(worktree, 'log', '-1', '--format=%an%n%B')).toBe(
    'Orynx e2e\nPULL-1: Bulk archive for the content list\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
  );
  const held = (await (await page.request.get(control)).json()) as FakeTools;
  expect(held.pulls).toEqual([
    expect.objectContaining({
      owner: 'acme',
      repository: 'web-app',
      number,
      head: 'feat/PULL-1',
      base: 'main',
      title: 'PULL-1: Bulk archive for the content list',
      body: expect.stringContaining('Jira: [PULL-1](https://your-team.atlassian.net/browse/PULL-1)'),
    }),
  ]);
});

test('AC-8: a new file that looks like a secret stops the commit, and nothing is pushed', async ({ page }) => {
  seen.secret = await startDone(page, 'PULL-2');
  const secret = join(await worktreeOf(page, seen.secret), '.env.local');
  writeFileSync(secret, 'TOKEN=fake\n');

  await page.getByRole('button', { name: 'Create pull request' }).click();
  await expect(dialog(page).getByRole('textbox', { name: 'Title' })).toBeVisible({ timeout: 10_000 });
  await dialog(page).getByRole('button', { name: 'Create pull request' }).click();

  await expect(dialog(page).getByRole('alert')).toHaveText(
    "Couldn't commit .env.local: it looks like a secret. Delete it or add it to .gitignore, then try again.",
  );
  expect(repository.git(repository.origin, 'branch', '--list', 'feat/PULL-2')).toBe('');
  unlinkSync(secret);
});

test("AC-6: when Claude can't draft, the dialog starts from the ticket and says so", async ({ page }) => {
  await startDone(page, 'PULL-3');
  await page.getByRole('button', { name: 'Create pull request' }).click();
  await expect(
    dialog(page).getByText("Claude couldn't draft this, so it starts from the ticket and Claude's summary."),
  ).toBeVisible({ timeout: 10_000 });
  await expect(dialog(page).getByRole('textbox', { name: 'Title' })).toHaveValue(
    'PULL-3: Speed up the picker (no draft)',
  );
});

test('AC-17, AC-19: Push changes updates the branch, and a follow-up on a PR-open session ends PR open', async ({
  page,
}) => {
  await page.goto(seen.opened ?? '');
  const worktree = await worktreeOf(page, seen.opened ?? '');
  writeFileSync(join(worktree, 'src', 'review.ts'), 'export const reviewed = true;\n');

  await page.getByRole('button', { name: 'Push changes' }).click();
  const message = dialog(page, 'Push changes').getByRole('textbox', { name: 'Commit message' });
  await expect(message).toHaveValue('Use the existing useSelection hook', { timeout: 10_000 });
  await expect(
    dialog(page, 'Push changes').getByText(
      `Orynx commits 1 changed file and pushes them to feat/PULL-1, which updates pull request ${pr}.`,
    ),
  ).toBeVisible();
  await dialog(page, 'Push changes').getByRole('button', { name: 'Push changes' }).click();
  await expect(dialog(page, 'Push changes')).toHaveCount(0, { timeout: 15_000 });
  await expect(progressOf(page).getByText(`Pushed changes to ${pr}`)).toBeVisible();
  expect(repository.git(repository.origin, 'rev-parse', 'refs/heads/feat/PULL-1')).toBe(
    repository.git(worktree, 'rev-parse', 'HEAD'),
  );

  const box = page.getByRole('textbox', { name: 'Message Claude' });
  await box.fill('Name it useRowSelection');
  await box.press('Enter');
  await expect(page.getByRole('main').getByText('Working', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByText('PR open', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Push changes' })).toBeVisible();
});

test('AC-21: the dialog works from the keyboard, and Enter in the title creates nothing', async ({ page }) => {
  await page.goto(seen.secret ?? '');
  const create = page.getByRole('button', { name: 'Create pull request' });
  await create.focus();
  await page.keyboard.press('Enter');
  const title = dialog(page).getByRole('textbox', { name: 'Title' });
  await expect(title).toBeFocused({ timeout: 10_000 });
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(dialog(page).getByRole('textbox', { name: 'Description' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog(page).getByRole('button', { name: 'Create pull request' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(create).toBeFocused();
  expect(repository.git(repository.origin, 'branch', '--list', 'feat/PULL-2')).toBe('');
});

test('AC-22: the title row and the dialog have no axe violations, at 1280 and 360 px, in light and dark', async ({
  page,
}) => {
  const check = async () => {
    await page.addScriptTag({ path: axePath });
    return page.evaluate(async () => {
      const moving = document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);
      await Promise.allSettled(moving.map((animation) => animation.finished));
      const results = await window.axe.run(document.body, { resultTypes: ['violations'] });
      return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
    });
  };
  const states = [
    {
      name: 'Done, with Create pull request',
      url: seen.secret,
      show: async (p: Page) => expect(p.getByRole('button', { name: 'Create pull request' })).toBeVisible(),
    },
    {
      name: 'the dialog with the draft',
      url: seen.secret,
      show: async (p: Page) => {
        await p.getByRole('button', { name: 'Create pull request' }).click();
        await expect(dialog(p).getByRole('textbox', { name: 'Title' })).toBeVisible({ timeout: 10_000 });
      },
    },
    {
      name: 'PR open',
      url: seen.opened,
      show: async (p: Page) => expect(p.getByRole('link', { name: `Open PR ${pr}` })).toBeVisible(),
    },
  ];
  for (const state of states) {
    if (state.url === undefined) throw new Error('A session the earlier tests start is missing');
    for (const width of [1280, 360]) {
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height: 800 });
        await page.emulateMedia({ colorScheme });
        await page.goto(state.url);
        await state.show(page);
        const where = `${state.name} at ${String(width)} px, ${colorScheme}`;
        expect(await check(), where).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth), where).toBeLessThanOrEqual(width);
      }
    }
  }
});

test('AC-18: Discard deletes the worktree and the local branch, and the PR and its branch on GitHub stay', async ({
  page,
}) => {
  await page.goto(seen.opened ?? '');
  await page.getByRole('button', { name: 'Discard changes' }).click();
  const confirm = page.getByRole('dialog', { name: "Discard Claude's changes?" });
  await expect(confirm).toContainText(`Pull request ${pr} and the branch on GitHub stay.`);
  await confirm.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.getByText('The changes are gone')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: `Open PR ${pr}` })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Push changes' })).toHaveCount(0);
  expect(repository.git(repository.origin, 'branch', '--list', 'feat/PULL-1')).toContain('feat/PULL-1');
  expect(repository.git(repository.clone, 'branch', '--list', 'feat/PULL-1')).toBe('');
});
