import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { answerClaudeAs, fakeClaudeDirFor } from './fake-claude/config.ts';
import { changesHubPort, controlPortFor, type FakeTools } from './fake-tools/config.ts';

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

// Spec 013 on its own hub (playwright.config.ts): its sessions resume Claude Code and write into worktrees the
// other specs never see.
test.use({ baseURL: `http://127.0.0.1:${String(changesHubPort)}` });
test.describe.configure({ mode: 'serial' });

const tools: FakeTools = {
  sprint: true,
  issues: [
    // The fake Claude Code edits `src/archive.ts`, then keeps working until it's stopped.
    {
      key: 'CHG-1',
      summary: 'Add bulk archive to the content list (waits)',
      status: 'In Progress',
      category: 'indeterminate',
      duedate: '2030-01-15',
    },
    // Edits `src/archive.ts` and finishes; a follow-up writes down what it was asked in `src/follow-up.ts`.
    { key: 'CHG-2', summary: 'Add bulk archive to the event list', status: 'To Do', category: 'new' },
    { key: 'CHG-3', summary: 'Archive old events (waits)', status: 'To Do', category: 'new' },
  ],
  reviews: [],
  mine: [],
};

/** The sessions the tests share, once started: the one stopped and then deleted (spec 039), and the one Done. */
const seen: { working?: string; done?: string } = {};

/** A real repository in a temporary folder, with a bare origin, and git that reads none of your settings. */
function makeRepository() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'devhub-e2e-changes-repo-')));
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
/** Ship adds the ticket to Home's composer (spec 022); Send starts Claude on it and opens its Session screen. */
async function ship(page: Page, key: string): Promise<void> {
  await page.goto('/tickets');
  await page.getByRole('button', { name: `Ship ${key}` }).click();
  await page.waitForURL((url) => url.pathname === '/');
  await page.getByRole('button', { name: 'Send to Claude' }).click();
  await page.waitForURL(/\/sessions\/[0-9a-f]{16}$/);
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

/** The worktree git keeps for a branch, or undefined when there's none. */
function worktreeOf(branch: string): string | undefined {
  const blocks = repository.git(repository.clone, 'worktree', 'list', '--porcelain').split('\n\n');
  const block = blocks.find((one) => one.includes(`branch refs/heads/${branch}`));
  return block
    ?.split('\n')
    .find((line) => line.startsWith('worktree '))
    ?.slice('worktree '.length);
}

/** Everything a read could disturb in a worktree: what git says, and its index's bytes and time. */
function untouched(worktree: string) {
  const index = repository.git(worktree, 'rev-parse', '--path-format=absolute', '--git-path', 'index');
  return {
    status: repository.git(worktree, 'status', '--porcelain=v1', '--untracked-files=all'),
    index: readFileSync(index).toString('base64'),
    indexTime: statSync(index).mtimeMs,
  };
}

const changedFiles = (page: Page) => page.getByRole('list', { name: 'Changed files' });
const followUpBox = (page: Page) => page.getByRole('textbox', { name: 'Message Claude' });
const progressOf = (page: Page) => page.getByRole('region', { name: 'What Claude did' });

/**
 * The folder an Open in link opens, as a real path: the hub names the worktree under its own home's path, which
 * on macOS can be `/var` for git's `/private/var`.
 */
async function opensFolder(page: Page, label: 'Open in VS Code' | 'Open in Cursor'): Promise<string> {
  // The link is in the page bar's More actions (19 Oct 2026).
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  const link = page.getByRole('menuitem', { name: label });
  const scheme = label === 'Open in VS Code' ? 'vscode' : 'cursor';
  await expect(link).toHaveAttribute('href', new RegExp(`^${scheme}://file/`));
  const href = (await link.getAttribute('href')) ?? '';
  await page.keyboard.press('Escape');
  return realpathSync(decodeURIComponent(href.slice(`${scheme}://file`.length)));
}

/** Delete, from the page bar's More actions: it took Discard changes' place (spec 039, the user's call, 20 Oct 2026). */
async function pickDelete(page: Page) {
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
}

test.beforeAll(async ({ browser }, testInfo) => {
  test.skip((testInfo.project.use.viewport?.width ?? 0) < 768, 'the sessions share one hub and one repository');
  const page = await browser.newPage({ baseURL: `http://127.0.0.1:${String(changesHubPort)}` });
  await page.goto('/settings/connections');
  const answer = await page.request.put(`http://127.0.0.1:${String(controlPortFor(changesHubPort))}/tools`, {
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

  await answerClaudeAs('signed_in', fakeClaudeDirFor(changesHubPort));
  await api(page, 'POST', '/api/claude/login/check');
  await api(page, 'POST', '/api/repositories', { path: repository.clone, jiraProject: 'CHG' });
  await api(page, 'POST', '/api/inbox/refresh');
  await page.close();
});

test.afterAll(() => {
  rmSync(repository.root, { recursive: true, force: true });
});

test('AC-1, AC-2, AC-18: the Changes tab lists Claude’s edit as it lands, in every open tab', async ({
  page,
  context,
}) => {
  await ship(page, 'CHG-1');
  seen.working = page.url();
  const other = await context.newPage();
  await other.goto(page.url());

  const tabs = page.getByRole('tablist', { name: 'Session details' });
  await expect(tabs.getByRole('tab', { name: 'Context 1' })).toHaveAttribute('aria-selected', 'false');
  for (const tab of [page, other]) {
    await expect(changedFiles(tab).getByRole('button', { name: /^src\/archive\.ts/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(tab.getByRole('tab', { name: 'Changes 1' })).toHaveAttribute('aria-selected', 'true');
    // The totals and Wrap lines sit in the tabs' row (spec 048).
    await expect(tab.getByText('1 line added in 1 file')).toBeAttached();
    await expect(tab.getByRole('button', { name: 'Wrap lines', pressed: true })).toBeVisible();
    const diff = tab.getByRole('region', { name: 'Changes in archive.ts' });
    await expect(diff.getByText('export const archive = true;')).toBeVisible();
  }
  await expect(page.getByRole('main').getByText('Working', { exact: true })).toBeVisible();
  expect(await opensFolder(page, 'Open in VS Code')).toBe(worktreeOf('feat/CHG-1'));

  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('main').getByText('Stopped', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('1 line added in 1 file')).toBeAttached();
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
  await page.keyboard.press('Escape');
  await other.close();
});

test('AC-3, AC-4: picking a file shows its diff, a reload keeps it, and reading never touches the worktree', async ({
  page,
}) => {
  const worktree = worktreeOf('feat/CHG-1') ?? '';
  // You change a file yourself, as in your editor.
  writeFileSync(join(worktree, 'README.md'), '# web-app\n\nArchive many items at once.\n');
  const before = untouched(worktree);
  await page.goto(seen.working ?? '');

  await changedFiles(page)
    .getByRole('button', { name: /^README\.md/ })
    .click();

  const diff = page.getByRole('region', { name: 'Changes in README.md' });
  await expect(diff.getByText('Archive many items at once.')).toBeVisible();
  await expect(page).toHaveURL(/[?&]file=README\.md/);
  await page.reload();
  await expect(changedFiles(page).getByRole('button', { name: /^README\.md/ })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('region', { name: 'Changes in README.md' })).toBeVisible();
  expect(untouched(worktree)).toEqual(before);
});

test('with many changed files, scrolling to the end never slides the sidebar up past the window (the user’s report, 22 Oct 2026)', async ({
  page,
}) => {
  const worktree = worktreeOf('feat/CHG-1') ?? '';
  const many = Array.from({ length: 30 }, (_, index) => join(worktree, `note-${String(index)}.md`));
  for (const file of many) writeFileSync(file, '# note\n');
  await page.setViewportSize({ width: 1512, height: 900 });
  await page.goto(seen.working ?? '');
  await expect(changedFiles(page).getByRole('button', { name: /^note-29\.md/ })).toBeAttached();

  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });

  expect(await page.getByRole('navigation', { name: 'Main' }).boundingBox()).toMatchObject({ y: 0, height: 900 });
  for (const file of many) rmSync(file);
});

test('AC-9: the Ticket tab shows the ticket as Claude got it, and the address keeps the tab', async ({ page }) => {
  await page.goto(seen.working ?? '');

  await page.getByRole('tab', { name: 'Context 1' }).click();

  const panel = page.getByRole('tabpanel', { name: 'Context 1' });
  await expect(panel.getByText('Story', { exact: true })).toBeVisible();
  await expect(panel.getByText('In Progress', { exact: true })).toBeVisible();
  await expect(panel.getByText('Due 15 Jan 2030')).toBeVisible();
  await expect(panel.getByText('Content managers need to archive many items at once.')).toBeVisible();
  await expect(panel.getByRole('listitem').filter({ hasText: 'Checkbox on each row' })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Open in Jira' })).toHaveAttribute(
    'href',
    'https://your-team.atlassian.net/browse/CHG-1',
  );
  await expect(panel.getByText("Claude's brief")).toBeVisible();
  await expect(page).toHaveURL(/[?&]tab=context/);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Context 1' })).toHaveAttribute('aria-selected', 'true');
});

test('AC-20, AC-26: picking Cursor in Settings turns Open in VS Code into Open in Cursor, in every open tab', async ({
  page,
  context,
}) => {
  await page.goto(seen.working ?? '');
  const worktree = worktreeOf('feat/CHG-1') ?? '';
  expect(await opensFolder(page, 'Open in VS Code')).toBe(worktree);
  const settings = await context.newPage();
  await settings.goto('/settings/coding-agent');
  const editor = settings.getByRole('radiogroup', { name: 'Open changes in' });
  await expect(editor.getByRole('radio', { name: 'VS Code' })).toBeChecked();

  // The arrow keys move between the choices, and each saves as it's picked.
  await editor.getByRole('radio', { name: 'VS Code' }).focus();
  await settings.keyboard.press('ArrowDown');

  await expect(editor.getByRole('radio', { name: 'Cursor' })).toBeChecked();
  expect(await opensFolder(page, 'Open in Cursor')).toBe(worktree);
  await settings.reload();
  await expect(editor.getByRole('radio', { name: 'Cursor' })).toBeChecked();
  await editor.getByRole('radio', { name: 'VS Code' }).click();
  await expect(editor.getByRole('radio', { name: 'VS Code' })).toBeChecked();
  expect(await opensFolder(page, 'Open in VS Code')).toBe(worktree);
  await settings.close();
});

test('039 AC-32: Delete, with its branch ticked, takes the session, its worktree and its branch', async ({ page }) => {
  await page.goto(seen.working ?? '');
  await pickDelete(page);
  const dialog = page.getByRole('alertdialog', { name: 'Delete this session?' });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('checkbox', { name: 'Also delete the branch feat/CHG-1' }).check();
  await dialog.getByRole('button', { name: 'Delete' }).click();

  await page.waitForURL(/\/sessions$/);
  expect(worktreeOf('feat/CHG-1')).toBeUndefined();
  expect(repository.git(repository.clone, 'branch', '--list', 'feat/CHG-1')).toBe('');
});

test('AC-11, AC-12, AC-18: after Done, a follow-up carries on where Claude left off, in every open tab', async ({
  page,
  context,
}) => {
  await ship(page, 'CHG-2');
  seen.done = page.url();
  await expect(page.getByRole('main').getByText('Done, ready for PR')).toBeVisible({ timeout: 15_000 });
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(followUpBox(other)).toBeVisible();
  // "(hold)" keeps the fake Claude Code working, once it has made its edit, until another message comes.
  const asked = 'Use the existing useSelection hook instead (hold)';

  await followUpBox(page).fill(asked);
  await followUpBox(page).press('Enter');

  await expect(followUpBox(page)).toHaveValue('');
  await expect(followUpBox(page)).toBeFocused();
  for (const tab of [page, other]) {
    await expect(progressOf(tab).getByText('You asked Claude')).toBeVisible();
    await expect(progressOf(tab).getByText(asked)).toBeVisible();
    await expect(tab.getByRole('main').getByText('Working', { exact: true })).toBeVisible();
    await expect(tab.getByRole('list', { name: 'Session progress' }).getByText('Build')).toHaveAttribute(
      'aria-current',
      'step',
    );
  }
  // Each tab keeps its own unsent draft.
  await followUpBox(other).fill('Half a thought');
  await expect(followUpBox(page)).toHaveValue('');

  // Sent while Claude works, a message shows at once and is taken into the same turn.
  await followUpBox(page).fill('Name it useRowSelection');
  await followUpBox(page).press('Enter');
  await expect(progressOf(page).getByText('Name it useRowSelection')).toBeVisible();

  await expect(progressOf(page).getByText('Finished')).toHaveCount(2, { timeout: 15_000 });
  await expect(progressOf(page).getByText('Did what you asked.')).toBeVisible();
  await expect(page.getByRole('main').getByText('Done, ready for PR')).toBeVisible();
  await expect(followUpBox(other)).toHaveValue('Half a thought');
  // Claude got exactly what was typed, and wrote in the same worktree.
  const worktree = worktreeOf('feat/CHG-2') ?? '';
  expect(readFileSync(join(worktree, 'src', 'follow-up.ts'), 'utf8')).toBe(
    `export const asked = ${JSON.stringify(asked)};\n`,
  );
  await expect(changedFiles(page).getByRole('button', { name: /^src\/follow-up\.ts/ })).toBeVisible();
  await other.close();
});

test('047 AC-22, AC-23: after Done the time shows the turns and their cost, a follow-up adds its turns, and the tooltip says what the cost is', async ({
  page,
}) => {
  if (seen.done === undefined) throw new Error('A session the earlier tests start is missing');
  await page.goto(seen.done);
  // Its first run and the follow-up above each ended one turn of 3, at $0.42 so far.
  const line = progressOf(page).getByText(/^\d+ (min \d+ )?s · 6 turns · ≈ \$0\.42$/);
  await expect(line).toBeVisible();
  await line.focus();
  await expect(page.getByRole('tooltip')).toHaveText(
    "Claude's working time, its turns with the model, and what they'd cost at API prices. Your company's Claude plan may bill differently.",
  );
});

test('AC-13: after Stop, a follow-up carries on as well', async ({ page }) => {
  await ship(page, 'CHG-3');
  await expect(progressOf(page).getByText('Editing files')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('main').getByText('Stopped', { exact: true })).toBeVisible({ timeout: 10_000 });

  await followUpBox(page).fill('Carry on, please');
  await followUpBox(page).press('Enter');

  await expect(progressOf(page).getByText('You asked Claude')).toBeVisible();
  await expect(progressOf(page).getByText('Did what you asked.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('main').getByText('Done, ready for PR')).toBeVisible();
  expect(readFileSync(join(worktreeOf('feat/CHG-3') ?? '', 'src', 'follow-up.ts'), 'utf8')).toContain(
    'Carry on, please',
  );
});

test('AC-21: the box, the tabs and the file list all work from the keyboard, in the screen’s order', async ({
  page,
}) => {
  await page.goto(seen.done ?? '');
  const box = followUpBox(page);
  await expect(changedFiles(page)).toBeVisible();
  await box.focus();

  await page.keyboard.type('First line');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('second line');
  await expect(box).toHaveValue('First line\nsecond line');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Enter');
  // An empty box sends nothing.
  await expect(progressOf(page).getByText('You asked Claude')).toHaveCount(2);

  // The follow-up is Home's composer now (19 Oct 2026): + and the agent picker come before Send.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Add context' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /^Agent: / })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Send message' })).toBeFocused();
  await page.keyboard.press('Tab');
  const changes = page.getByRole('tab', { name: /^Changes/ });
  await expect(changes).toBeFocused();
  // Changes, Ports, then Context (spec 048).
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /^Ports/ })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Context 1' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Context 1' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: /^Ports/ })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(changes).toHaveAttribute('aria-selected', 'true');

  const followed = changedFiles(page).getByRole('button', { name: /^src\/follow-up\.ts/ });
  const archive = changedFiles(page).getByRole('button', { name: /^src\/archive\.ts/ });
  await followed.focus();
  await page.keyboard.press('Space');
  await expect(followed).toHaveAttribute('aria-current', 'true');
  await archive.focus();
  await page.keyboard.press('Enter');
  await expect(archive).toHaveAttribute('aria-current', 'true');
});

test('AC-22: the Session screen has no axe violations, at 1280 and 360 px, in light and dark', async ({ page }) => {
  const check = async () => {
    await page.addScriptTag({ path: axePath });
    return page.evaluate(async () => {
      // axe reads colours as drawn, so anything still fading in must settle first.
      // Only animations on the page's clock end: a scroll-driven one (the sidebar's scroll-fade-y) never does.
      const moving = document
        .getAnimations()
        .filter(
          (animation) =>
            animation.timeline === document.timeline && animation.effect?.getComputedTiming().endTime !== Infinity,
        );
      await Promise.allSettled(moving.map((animation) => animation.finished));
      const results = await window.axe.run(document.body, { resultTypes: ['violations'] });
      return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
    });
  };
  const states = [
    { name: 'Done, with its changes', url: seen.done, shows: (p: Page) => changedFiles(p) },
    {
      name: 'its Context tab',
      url: `${seen.done ?? ''}?tab=context`,
      shows: (p: Page) => p.getByText('Content managers need to archive many items at once.'),
    },
  ];
  for (const state of states) {
    if (state.url === undefined) throw new Error('A session the earlier tests start is missing');
    for (const width of [1280, 360]) {
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height: 800 });
        await page.emulateMedia({ colorScheme });
        await page.goto(state.url);
        await expect(state.shows(page)).toBeVisible();
        const where = `${state.name} at ${String(width)} px, ${colorScheme}`;
        expect(await check(), where).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth), where).toBeLessThanOrEqual(width);
      }
    }
  }
});
