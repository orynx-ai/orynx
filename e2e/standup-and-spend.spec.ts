// The callbacks passed to page.evaluate() run in the browser.
/// <reference lib="dom" />
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { axeViolations } from './axe.ts';
import { answerClaudeAs, fakeClaudeDirFor } from './fake-claude/config.ts';
import { answersHubPort } from './fake-tools/config.ts';

// The standup (spec 057, C) and the spend with its limit warning (E), on a hub whose fake Claude Code runs sessions:
// one says "(near limit)", so Claude Code tells Orynx it's close to its 5-hour limit.
test.use({ baseURL: `http://127.0.0.1:${String(answersHubPort)}` });

const root = realpathSync(mkdtempSync(join(tmpdir(), 'devhub-e2e-spend-repo-')));
const clone = join(root, 'web-app');

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
  test.skip((testInfo.project.use.viewport?.width ?? 0) < 768, 'one run checks both widths');
  const env = { PATH: process.env['PATH'] ?? '/usr/bin:/bin', HOME: root, GIT_CONFIG_NOSYSTEM: '1' };
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8' });
  git('init', clone);
  writeFileSync(join(clone, 'README.md'), '# web-app\n');
  git('-C', clone, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'add', '.');
  git('-C', clone, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'first');

  const page = await browser.newPage({ baseURL: `http://127.0.0.1:${String(answersHubPort)}` });
  await page.goto('/settings/connections');
  await answerClaudeAs('signed_in', fakeClaudeDirFor(answersHubPort));
  await api(page, 'POST', '/api/claude/login/check');
  const added = (await api(page, 'POST', '/api/repositories', { path: clone, jiraProject: null })) as { id: string };
  await api(page, 'POST', '/api/sessions', {
    message: 'Tidy the README (near limit)',
    repositoryId: added.id,
    context: [],
    mode: 'build',
  });
  await page.close();
});

test.afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

test('057 AC-33, AC-43, AC-49: the standup, the spend and the limit warning have no axe violations, at 1280 and 360 px, in light and dark', async ({
  page,
}) => {
  const warning = (p: Page) => p.getByRole('main').getByRole('status', { name: 'Close to your Claude limit' });
  for (const width of [1280, 360]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme });
      const where = `at ${String(width)} px, ${colorScheme}`;

      await page.goto('/');
      await expect(warning(page), where).toContainText("You've used 82% of your 5-hour Claude limit.", {
        timeout: 15_000,
      });
      expect(await axeViolations(page), where).toEqual([]);

      await page.getByRole('button', { name: 'Write my standup' }).click();
      const dialog = page.getByRole('dialog', { name: 'Your standup' });
      await expect(dialog.getByRole('textbox', { name: 'Your standup' }), where).toBeFocused({ timeout: 10_000 });
      await expect(dialog.getByRole('textbox', { name: 'Your standup' })).toHaveValue(/^Yesterday\n/);
      expect(await axeViolations(page), `the standup ${where}`).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);

      await page.goto('/sessions');
      const spend = page.getByRole('main').getByRole('group', { name: 'Spend' });
      await expect(spend.getByText('Today'), where).toBeVisible();
      await expect(warning(page), where).toBeVisible();
      expect(await axeViolations(page), `the Sessions page ${where}`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), where).toBeLessThanOrEqual(width);
    }
  }
});
