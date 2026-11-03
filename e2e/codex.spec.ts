import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { axeViolations } from './axe.ts';
import { codexHubPort } from './fake-tools/config.ts';

// Spec 052 on its own hub (playwright.config.ts): the only one whose Codex is there, a fake signed in with ChatGPT.
test.use({ baseURL: `http://127.0.0.1:${String(codexHubPort)}` });
test.describe.configure({ mode: 'serial' });

/** A real repository in a temporary folder, with a bare origin, and git that reads none of your settings. */
function makeRepository() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'devhub-e2e-codex-repo-')));
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
  return { root, clone };
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

test.beforeAll(async ({ browser }, testInfo) => {
  test.skip((testInfo.project.use.viewport?.width ?? 0) < 768, 'the Codex sessions share one hub');
  const page = await browser.newPage({ baseURL: `http://127.0.0.1:${String(codexHubPort)}` });
  await page.goto('/settings/connections');
  await api(page, 'POST', '/api/codex/login/check');
  await api(page, 'POST', '/api/repositories', { path: repository.clone, jiraProject: 'PROJ' });
  await page.close();
});

test.afterAll(() => {
  rmSync(repository.root, { recursive: true, force: true });
});

test('052 AC-1, AC-27: Settings › Coding agent shows Codex signed in with ChatGPT, beside Claude', async ({ page }) => {
  await page.goto('/settings/coding-agent');
  const codex = page.getByRole('group', { name: 'Codex' });
  await expect(codex.getByText('Active')).toBeVisible();
  await expect(codex.getByText('Signed in with ChatGPT as e2e@company.example')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Claude' }).getByText('Not signed in')).toBeVisible();
  expect(await axeViolations(page, 'main')).toEqual([]);
});

test('052 AC-4, AC-5, AC-8: a Codex model picked in the composer runs the session on Codex, which asks before npm test', async ({
  page,
}) => {
  await page.goto('/');
  // Claude is signed out on this hub, so the picker is on Codex already.
  await page.getByRole('button', { name: /^Agent: Codex/ }).click();
  const menu = page.getByRole('menu', { name: 'Agent' });
  await menu.getByRole('menuitemradio', { name: /GPT-5.5 Codex/ }).click();
  await expect(page.getByRole('button', { name: 'Agent: Codex, GPT-5.5 Codex, connected' })).toBeVisible();

  const box = page.getByRole('textbox', { name: 'Describe a task for Codex' });
  await box.fill('Run the tests');
  await box.press('Enter');
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f]{16}$/);

  const progress = page.getByRole('region', { name: 'What agent did' });
  const callout = progress.getByRole('alert');
  await expect(callout.getByText('Codex wants to run a command')).toBeVisible({ timeout: 15_000 });
  await expect(callout.getByText('npm test')).toBeVisible();
  await callout.getByRole('button', { name: 'Allow once' }).click();

  await expect(progress.getByText('Finished')).toBeVisible({ timeout: 15_000 });
  await expect(progress.getByText('Ran the tests: 1 passing.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message Codex' })).toBeVisible();
  expect(await axeViolations(page, 'main')).toEqual([]);
});
