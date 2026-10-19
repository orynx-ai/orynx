import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { answerClaudeAs, fakeClaudeDirFor } from './fake-claude/config.ts';
import { composerHubPort, controlPortFor, type FakeTools } from './fake-tools/config.ts';

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

// Spec 015 on its own hub (playwright.config.ts): its sessions and worktrees never reach the other specs.
test.use({ baseURL: `http://127.0.0.1:${String(composerHubPort)}` });
test.describe.configure({ mode: 'serial' });

const diff =
  'diff --git a/src/people.ts b/src/people.ts\n--- a/src/people.ts\n+++ b/src/people.ts\n@@ -1 +1 @@\n-const page = 20;\n+const page = 50;';
const tools: FakeTools = {
  issues: [
    {
      key: 'PROJ-1423',
      summary: 'Add bulk archive to the content list',
      status: 'In Progress',
      category: 'indeterminate',
    },
    { key: 'PROJ-1377', summary: 'Fix the header on small screens', status: 'To Do', category: 'new' },
  ],
  reviews: [
    {
      number: 2836,
      title: 'Lazy-load the people directory',
      requests: [{ login: 'octocat', at: '2026-10-17T09:00:00Z' }],
    },
  ],
  mine: [],
  pullRequests: [{ number: 2836, title: 'Lazy-load the people directory', body: 'Loads 50 people at a time.', diff }],
};

/** A real repository in a temporary folder, with a bare origin, and git that reads none of your settings. */
function makeRepository() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'devhub-e2e-composer-repo-')));
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
/** What the hub's fake file picker picks (e2e/fake-gh/osascript, zenity, kdialog). */
const picked = realpathSync(new URL('fake-gh/picked/notes.md', import.meta.url));
const claudeDir = fakeClaudeDirFor(composerHubPort);

/** Exactly what the fake Claude Code got as its brief, the last time a session started. */
function lastBrief(): string {
  // None until the first session starts Claude; expect.poll stops at a throw, so say "nothing yet".
  return existsSync(join(claudeDir, 'last-brief.txt')) ? readFileSync(join(claudeDir, 'last-brief.txt'), 'utf8') : '';
}

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

function connectionRow(page: Page, tool: string) {
  return page.getByRole('list', { name: 'Connections' }).getByRole('listitem').filter({ hasText: tool });
}

const box = (page: Page) => page.getByRole('textbox', { name: 'Describe a task for Claude' });
const chips = (page: Page) => page.getByRole('list', { name: 'Context for Claude' }).getByRole('listitem');

/** Opens + Add context and one kind's list; resolves with that list's popup. */
async function openKind(page: Page, kind: RegExp, title: string) {
  await page.getByRole('button', { name: 'Add context' }).click();
  await page.getByRole('menuitem', { name: kind }).click();
  return page.getByRole('dialog', { name: title });
}

/** axe on one part of the page, once anything fading in has settled (memory: e2e axe runs mid-animation). */
async function axe(page: Page, selector = 'body') {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async (context) => {
    const target = document.querySelector(context);
    if (target === null) throw new Error(`Nothing matches ${context}`);
    const moving = document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);
    await Promise.allSettled(moving.map((animation) => animation.finished));
    const results = await window.axe.run(target, { resultTypes: ['violations'] });
    return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
  }, selector);
}

test.beforeAll(async ({ browser }, testInfo) => {
  test.skip((testInfo.project.use.viewport?.width ?? 0) < 768, 'the composer’s sessions share one hub');
  const page = await browser.newPage({ baseURL: `http://127.0.0.1:${String(composerHubPort)}` });
  await page.goto('/settings/connections');
  const answer = await page.request.put(`http://127.0.0.1:${String(controlPortFor(composerHubPort))}/tools`, {
    data: tools,
  });
  expect(answer.status()).toBe(204);

  // The site, email and tokens the fakes accept (packages/core/src/test).
  await connectionRow(page, 'Jira').getByRole('button', { name: 'Connect' }).click();
  const jira = page.getByRole('form', { name: 'Jira connection' });
  await jira.getByRole('textbox', { name: 'Jira site' }).fill('your-team.atlassian.net');
  await jira.getByRole('textbox', { name: 'Email' }).fill('dev@example.com');
  await jira.getByLabel('API token', { exact: true }).fill('fake-good-token');
  await jira.getByRole('button', { name: 'Connect Jira' }).click();
  await expect(connectionRow(page, 'Jira').getByText('Connected', { exact: true })).toBeVisible();

  await connectionRow(page, 'GitHub').getByRole('button', { name: 'Connect' }).click();
  const github = page.getByRole('form', { name: 'GitHub connection' });
  await github.getByText('Use a personal access token').click();
  await github.getByLabel('Personal access token', { exact: true }).fill('fake-github-token-for-tests');
  await github.getByRole('button', { name: 'Connect GitHub' }).click();
  await expect(connectionRow(page, 'GitHub').getByText('Connected', { exact: true })).toBeVisible();

  await answerClaudeAs('signed_in', claudeDir);
  // A brief left by an earlier run would pass the first test's poll before its session starts.
  rmSync(join(claudeDir, 'last-brief.txt'), { force: true });
  await api(page, 'POST', '/api/claude/login/check');
  await api(page, 'POST', '/api/repositories', { path: repository.clone, jiraProject: 'PROJ' });
  await api(page, 'POST', '/api/inbox/refresh');
  await page.close();
});

test.afterAll(() => {
  rmSync(repository.root, { recursive: true, force: true });
});

test('023 AC-21, AC-22: a skill from Settings › Skills is in the / list as Orynx, and Claude gets its text', async ({
  page,
}) => {
  await page.goto('/');
  await api(page, 'POST', '/api/skills/orynx', {
    title: 'Bug bash e2e',
    description: 'Hunt for bugs in the date picker',
    instructions: '# Bug bash\n\nList each bug. Report only, e2e.',
  });
  await expect(page.getByRole('button', { name: 'Repository: web-app' })).toBeVisible();

  await box(page).click();
  await page.keyboard.type('/bug-bash-e');
  const option = page.getByRole('listbox', { name: 'Skills' }).getByRole('option').filter({ hasText: '/bug-bash-e2e' });
  await expect(option).toContainText('Hunt for bugs in the date picker');
  await expect(option).toContainText('Orynx');
  await page.keyboard.press('Enter');
  await expect(box(page)).toHaveValue('/bug-bash-e2e ');
  await page.keyboard.type('on the date picker');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/sessions\/[0-9a-f]{16}$/);
  await expect.poll(lastBrief).toContain('Skill /bug-bash-e2e');
  const brief = lastBrief();
  expect(brief).toMatch(/^\/bug-bash-e2e on the date picker\n/);
  expect(brief).toContain('List each bug. Report only, e2e.');
  // An Orynx skill lives in DEVHUB_HOME, where Claude may read nothing: its text is all it gets.
  expect(brief).not.toContain('Its folder is');
  expect(brief).not.toContain('title: Bug bash e2e');
});

test('AC-1, AC-4, AC-24: my words alone start a session on its own branch, and Claude gets exactly them', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Repository: web-app' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agent: Claude, connected' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send to Claude' })).toHaveAttribute('aria-disabled', 'true');

  await box(page).fill('Add a CSV export to the reports page');
  // Spec 026: with no ticket, the composer starts an Ask; this one builds.
  const mode = page.getByRole('group', { name: 'Session' });
  await expect(mode.getByRole('button', { name: 'Ask' })).toHaveAttribute('aria-pressed', 'true');
  await mode.getByRole('button', { name: 'Build' }).click();
  await box(page).press('Enter');

  await expect(page).toHaveURL(/\/sessions\/[0-9a-f]{16}$/);
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs.getByText('Add a CSV export to the reports page')).toBeVisible();
  await expect(crumbs.getByRole('link', { name: 'Sessions' })).toBeVisible();
  const progress = page.getByRole('region', { name: "Claude's progress" });
  await expect(progress.getByText('feat/add-a-csv-export-to from origin/main')).toBeVisible();
  await expect(progress.getByText('Your message', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Context/ })).toHaveCount(0);
  await expect.poll(lastBrief).toBe('Add a CSV export to the reports page');

  await page.goto('/');
  await expect(box(page)).toHaveValue('');
});

test('AC-6 to AC-8, AC-11, AC-14, AC-20, 022 AC-9, AC-10: a ticket, a pasted pull request and a picked file reach Claude with my words', async ({
  page,
}) => {
  await page.goto('/');
  const jira = await openKind(page, /Jira ticket/, 'Jira ticket');
  await jira.getByRole('combobox', { name: 'Search tickets by key or title' }).fill('bulk');
  await jira.getByRole('option', { name: /PROJ-1423/ }).click();
  // A checkbox: the list stays open for the next one, and closing it puts focus in the box (19 Oct 2026).
  await expect(jira.getByRole('option', { name: /PROJ-1423/ })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(box(page)).toBeFocused();
  await expect(box(page)).toHaveAttribute('placeholder', 'What should Claude do with PROJ-1423?');

  // A paste that is exactly a pull request's link becomes its chip.
  await box(page).evaluate((element, link) => {
    const data = new DataTransfer();
    data.setData('text/plain', link);
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, 'https://github.com/acme/web-app/pull/2836');

  // The hub's fake file picker picks e2e/fake-gh/picked/notes.md (spec 022): the page gets its path, not its text.
  await page.getByRole('button', { name: 'Add context' }).click();
  await page.getByRole('menuitem', { name: /File from this computer/ }).click();

  // Two chips show, then +1 for the third (spec 022, AC-19).
  await expect(chips(page)).toHaveText(['PROJ-1423', 'web-app #2836', '+1']);
  await box(page).fill('Use the notes');
  await page.getByRole('button', { name: 'Send to Claude' }).click();

  await expect(page).toHaveURL(/\/sessions\/[0-9a-f]{16}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Add bulk archive to the content list' })).toBeVisible();
  // The fake Claude Code writes what it got once Claude starts, a moment after the page opens.
  await expect.poll(lastBrief).toMatch(/^Use the notes/);
  const brief = lastBrief();
  expect(brief.startsWith('Use the notes\n\nJira ticket PROJ-1423 (Story): Add bulk archive to the content list')).toBe(
    true,
  );
  expect(brief).toContain('Pull request acme/web-app #2836: Lazy-load the people directory');
  expect(brief).toContain('Loads 50 people at a time.');
  expect(brief).toContain(`\`\`\`diff\n${diff}\n\`\`\``);
  // Its title names the path as the hub shows it (with ~ under its home); Claude reads the real one.
  expect(brief).toMatch(/\n\nFile \S*fake-gh\/picked\/notes\.md\n\nThe user added this file from their computer\./);
  expect(brief).toContain(`Read it at ${picked}.`);
  expect(brief).not.toContain('Export every column.');
});

test('022 AC-1, AC-4, AC-20, AC-28: two tickets and a pull request added from Home’s rows reach Claude, and +1 opens them all', async ({
  page,
}) => {
  await page.goto('/');
  const panel = page.getByRole('region', { name: 'Needs your attention' });
  await panel.getByRole('button', { name: 'Add PROJ-1377 to the composer' }).click();
  await panel.getByRole('button', { name: 'Add web-app #2836 to the composer' }).click();
  await expect(panel.getByRole('button', { name: 'Remove PROJ-1377 from the composer' })).toBeVisible();
  // PROJ-1423 has a live session from the test before, so its row has Open session; it comes from the list, second,
  // since only the first ticket's session stops a start (AC-5).
  const jira = await openKind(page, /Jira ticket/, 'Jira ticket');
  await jira.getByRole('combobox').fill('bulk');
  await jira.getByRole('option', { name: /PROJ-1423/ }).click();
  await page.keyboard.press('Escape');

  await expect(chips(page)).toHaveText(['PROJ-1377', 'web-app #2836', '+1']);
  await expect(box(page)).toHaveAttribute('placeholder', 'What should Claude do with these 2 tickets?');
  await page.getByRole('button', { name: '+1: Show all 3 items of context' }).click();
  const all = page.getByRole('dialog', { name: 'Context for Claude' });
  // A kind with nothing in it has no tab (19 Oct 2026).
  await expect(all.getByRole('tab')).toHaveText(['Tickets 2', 'Pull requests 1']);
  await expect(all.getByRole('tab', { name: 'Tickets 2' })).toHaveAttribute('aria-selected', 'true');
  await expect(all.getByRole('tabpanel').getByRole('listitem')).toHaveText([
    /^PROJ-1377Fix the header on small screens/,
    /^PROJ-1423Add bulk archive to the content list/,
  ]);
  expect(await axe(page, '[role="dialog"]')).toEqual([]);
  await all.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: '+1: Show all 3 items of context' })).toBeFocused();

  await box(page).fill('Do both');
  await page.getByRole('button', { name: 'Send to Claude' }).click();

  await expect(page).toHaveURL(/\/sessions\/[0-9a-f]{16}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Fix the header on small screens' })).toBeVisible();
  await expect.poll(lastBrief).toMatch(/^Do both\n\nJira ticket PROJ-1377 /);
  expect(lastBrief()).toContain('Pull request acme/web-app #2836: Lazy-load the people directory');
  expect(lastBrief()).toContain('Jira ticket PROJ-1423 (Story): Add bulk archive to the content list');
  await expect(
    page.getByRole('region', { name: "Claude's progress" }).getByText('Your message, PROJ-1377, PROJ-1423 and 1 more'),
  ).toBeVisible();
});

test('AC-10, AC-21: a ticket Jira can’t find stops Send, says which, and keeps the draft', async ({ page }) => {
  await page.goto('/');
  const jira = await openKind(page, /Jira ticket/, 'Jira ticket');
  await jira.getByRole('combobox').fill('proj-9999');
  await jira.getByRole('option', { name: 'Add PROJ-9999' }).click();
  await page.keyboard.press('Escape');
  await box(page).fill('Look into it');
  await page.getByRole('button', { name: 'Send to Claude' }).click();

  await expect(page.getByRole('alert')).toHaveText("Jira can't find PROJ-9999, or you can't see it.");
  await expect(box(page)).toHaveValue('Look into it');
  await expect(chips(page)).toHaveText(['PROJ-9999']);
  await expect(page).toHaveURL(/\/$/);
  await chips(page).getByRole('button', { name: 'Remove PROJ-9999' }).click();
});

test('AC-2, AC-33: New task opens Home with focus in the composer, and the draft is kept between pages', async ({
  page,
}) => {
  await page.goto('/');
  await box(page).fill('Keep this');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('link', { name: 'Tickets' }).click();
  await expect(page).toHaveURL(/\/tickets$/);
  // Home's link carries its count of what needs you here.
  const keys = (await nav.getByRole('link', { name: /^Home/ }).getAttribute('aria-keyshortcuts')) ?? '';

  await page.keyboard.press(keys.replace(/\+N$/, '+KeyN'));

  await expect(box(page)).toBeFocused();
  await expect(box(page)).toHaveValue('Keep this');
});

test('AC-25, AC-26: a session waiting for my approval shows at the top of Home and opens from there', async ({
  page,
}) => {
  await page.goto('/');
  await box(page).fill('Check the content list (runs tests)');
  // Spec 026: with no ticket, the composer starts an Ask, which runs no command; this one builds.
  await page.getByRole('group', { name: 'Session' }).getByRole('button', { name: 'Build' }).click();
  await box(page).press('Enter');
  await expect(page).toHaveURL(/\/sessions\/[0-9a-f]{16}$/);
  const session = page.url();
  await expect(page.getByRole('alert').filter({ hasText: 'npm test -- content-list' })).toBeVisible();

  await page.goto('/');
  const banner = page.getByRole('link', { name: /Claude is waiting for your approval/ });
  await expect(banner).toContainText('Check the content list (runs tests) · wants to run npm test -- content-list');
  await banner.click();
  await expect(page).toHaveURL(session);
  await page.getByRole('button', { name: 'Deny' }).click();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'What should we build today?' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Claude is waiting for your approval/ })).toHaveCount(0);
});

test('AC-30, AC-31: Home, its chips and the + popup fit 360 px and have no axe violations, light and dark', async ({
  page,
}) => {
  for (const width of [1280, 360]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme });
      await page.goto('/');
      if ((await chips(page).count()) === 0) {
        const jira = await openKind(page, /Jira ticket/, 'Jira ticket');
        await jira.getByRole('option', { name: /PROJ-1377/ }).click();
        await page.keyboard.press('Escape');
      }
      await expect(chips(page)).toHaveText(['PROJ-1377']);
      expect(await axe(page), `Home at ${String(width)} px, ${colorScheme}`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

      // An open popup hides the rest of the page from screen readers, so it is checked on its own.
      await page.getByRole('button', { name: 'Add context' }).click();
      await expect(page.getByRole('menu', { name: 'Add context' })).toBeVisible();
      expect(await axe(page, '[data-slot="context-picker"]'), `the kinds at ${String(width)} px`).toEqual([]);
      await page.getByRole('menuitem', { name: /Pull request/ }).click();
      const list = page.getByRole('dialog', { name: 'Pull request' });
      await expect(list.getByRole('option', { name: /web-app #2836/ })).toBeVisible();
      // The list is wider than the kinds; Radix moves it back inside the gutter once it sees the new width.
      await expect
        .poll(async () => {
          const popup = await list.boundingBox();
          return popup === null ? Infinity : popup.x + popup.width;
        })
        .toBeLessThanOrEqual(width - 16);
      expect(await axe(page, '[data-slot="context-picker"]'), `a list at ${String(width)} px`).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Add context' })).toBeFocused();
    }
  }
});
