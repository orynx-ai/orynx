// The callbacks passed to page.evaluate() run in the browser.
/// <reference lib="dom" />
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

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

// axe-core comes with @devhub/ui's tests; here it runs in a real browser, so contrast counts too.
const axePath = createRequire(new URL('../packages/ui/package.json', import.meta.url)).resolve('axe-core/axe.min.js');

// The desktop and phone runs share one server and one settings.json, so each test changes only what it
// owns: its own folder, its own inbox rule, and the permission mode on desktop alone.

/** A git repository's top folder (it holds `.git`) and a plain folder, in a temporary place of their own. */
function makeFolders(label: string) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'devhub-e2e-folders-')));
  const repository = join(root, `app-${label}`);
  const plain = join(root, `plain-${label}`);
  mkdirSync(join(repository, '.git'), { recursive: true });
  mkdirSync(plain);
  return {
    repository,
    plain,
    remove: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** Sums every layout shift the page reports, the way Core Web Vitals counts CLS. */
async function layoutShiftScore(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let score = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
            if (!entry.hadRecentInput) score += entry.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => {
          resolve(score);
        }, 1000);
      }),
  );
}

async function axeViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const results = await window.axe.run(document.body, { resultTypes: ['violations'] });
    return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
  });
}

function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Waits until a tab shows its saved values, not its loading chrome. */
async function waitForTab(page: Page, tab: 'coding-agent' | 'repositories' | 'inbox-rules') {
  if (tab === 'coding-agent') await expect(page.getByRole('radio').first()).toBeEnabled();
  if (tab === 'inbox-rules') await expect(page.getByRole('checkbox').first()).toBeEnabled();
  if (tab === 'repositories') {
    await expect(page.getByRole('list', { name: 'Folders' }).or(page.getByText('No folders yet'))).toBeVisible();
  }
}

/** Resolves when the server has answered a save, so a reload can't cut it off. */
function saved(page: Page) {
  return page.waitForResponse(
    (response) => response.url().endsWith('/api/preferences') && response.request().method() === 'PATCH',
  );
}

function folderRow(page: Page, name: string) {
  return page.getByRole('list', { name: 'Folders' }).getByRole('listitem').filter({ hasText: name });
}

test('AC-1: Given Settings, when I pick each tab, then the address follows it and a reload stays on it', async ({
  page,
}) => {
  await page.goto('/settings/connections');
  const tabs = page.getByRole('tablist', { name: 'Settings sections' }).getByRole('tab');
  await expect(tabs).toHaveText(['Connections', 'Coding agent', 'Repositories', 'Inbox rules', 'Appearance']);

  for (const [name, path] of [
    ['Coding agent', '/settings/coding-agent'],
    ['Repositories', '/settings/repositories'],
    ['Inbox rules', '/settings/inbox-rules'],
  ] as const) {
    await page.getByRole('tab', { name }).click();
    await expect(page).toHaveURL(path);
    await page.reload();
    await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
  }
});

test('AC-20: Given a narrow window, when Settings opens on its last tab, then that tab is in full view in the tab list', async ({
  page,
}) => {
  await page.goto('/settings/appearance');
  const list = page.getByRole('tablist', { name: 'Settings sections' });
  const tab = page.getByRole('tab', { name: 'Appearance' });
  await expect(tab).toHaveAttribute('aria-selected', 'true');

  const listBox = await list.boundingBox();
  const tabBox = await tab.boundingBox();
  if (listBox === null || tabBox === null) throw new Error('The tab list is not on screen.');
  expect(tabBox.x).toBeGreaterThanOrEqual(listBox.x);
  expect(tabBox.x + tabBox.width).toBeLessThanOrEqual(listBox.x + listBox.width + 0.5);

  // Back to the first tab without a click on it, in the same page, as the Back button does.
  await page.goto('/settings/connections');
  await page.getByRole('tab', { name: 'Appearance' }).click();
  await expect(page).toHaveURL('/settings/appearance');
  await page.goBack();
  const first = page.getByRole('tab', { name: 'Connections' });
  await expect(first).toHaveAttribute('aria-selected', 'true');
  const firstBox = await first.boundingBox();
  const listAfter = await list.boundingBox();
  if (firstBox === null || listAfter === null) throw new Error('The tab list is not on screen.');
  expect(firstBox.x).toBeGreaterThanOrEqual(listAfter.x - 0.5);
});

for (const tab of ['coding-agent', 'repositories', 'inbox-rules'] as const) {
  test(`AC-15: Given Settings is opening on ${tab}, when its values arrive, then nothing on the page moves`, async ({
    page,
  }) => {
    // No live updates on this page: the other run's folders coming and going would move rows that this
    // test isn't about. It measures only the change from loading to loaded.
    await page.route('**/api/events**', (route) => route.abort());
    // The Claude card's skeleton holds the Active card's place; Not signed in and Error grow it once,
    // which spec 010 accepts (Q9). This hub's Claude is never signed in, so the card gets the usual answer.
    await page.route('**/api/claude/login', (route) =>
      route.fulfill({
        json: { state: 'signed_in', method: 'claude_ai', email: 'you@company.com', organisation: 'Company' },
      }),
    );
    await page.goto(`/settings/${tab}`);
    await waitForTab(page, tab);
    if (tab === 'coding-agent')
      await expect(page.getByRole('group', { name: 'Claude' }).getByText('Active')).toBeVisible();

    expect(await layoutShiftScore(page)).toBe(0);
    expect(await horizontalOverflow(page)).toBe(0);
  });
}

test('AC-3, AC-19: Given Coding agent, when I move the mode with the arrow keys, then it saves and a reload keeps it', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The mode is one value for the whole server; one run owns it.');
  await page.goto('/settings/coding-agent');
  const recommended = page.getByRole('radio', { name: 'Edit files freely, ask before commands' });
  await expect(recommended).toBeChecked();

  await recommended.focus();
  const firstSave = saved(page);
  await page.keyboard.press('ArrowUp');
  const everything = page.getByRole('radio', { name: 'Ask before everything' });
  await expect(everything).toBeChecked();
  await expect(everything).toBeFocused();
  await firstSave;

  await page.reload();
  await expect(page.getByRole('radio', { name: 'Ask before everything' })).toBeChecked();

  // Back to the default, for anyone who runs the suite twice against one server.
  const secondSave = saved(page);
  await page.getByRole('radio', { name: 'Edit files freely, ask before commands' }).click();
  await secondSave;
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Edit files freely, ask before commands' })).toBeChecked();
});

test('AC-13, AC-19: Given Inbox rules, when I press Space on a rule, then it saves and a reload keeps it', async ({
  page,
}, testInfo) => {
  const rule =
    testInfo.project.name === 'desktop'
      ? 'My pull requests with failing checks'
      : 'My pull requests with unresolved review comments';
  await page.goto('/settings/inbox-rules');
  const box = page.getByRole('checkbox', { name: rule });
  await expect(box).toBeEnabled();
  await expect(box).toBeChecked();

  await box.focus();
  const firstSave = saved(page);
  await page.keyboard.press('Space');
  await expect(box).not.toBeChecked();
  await firstSave;
  await page.reload();
  // Enabled first: while the values load, every rule is drawn unchecked and turned off.
  await expect(page.getByRole('checkbox', { name: rule })).toBeEnabled();
  await expect(page.getByRole('checkbox', { name: rule })).not.toBeChecked();

  await page.getByRole('checkbox', { name: rule }).focus();
  const secondSave = saved(page);
  await page.keyboard.press('Space');
  await secondSave;
  await page.reload();
  await expect(page.getByRole('checkbox', { name: rule })).toBeChecked();
});

test('AC-6, AC-8, AC-11, AC-17: Given two pages on Repositories, when I add a folder in one and remove it, then the other follows', async ({
  page,
  context,
}, testInfo) => {
  const folders = makeFolders(testInfo.project.name);
  const name = `app-${testInfo.project.name}`;
  try {
    const other = await context.newPage();
    await other.goto('/settings/repositories');
    await waitForTab(other, 'repositories');
    await page.goto('/settings/repositories');
    await waitForTab(page, 'repositories');

    const add = page.getByRole('button', { name: 'Add local folder' });
    await add.click();
    const form = page.getByRole('form', { name: 'Add a folder' });
    await expect(form.getByRole('textbox', { name: 'Folder' })).toBeFocused();
    // The e2e run never connects Jira.
    const project = form.getByRole('combobox', { name: 'Jira project' });
    await expect(project).toBeDisabled();
    await expect(form.getByText('Connect Jira in Connections to pick a project.')).toBeVisible();

    await page.keyboard.type(folders.repository);
    await page.keyboard.press('Enter');

    await expect(folderRow(page, name)).toBeVisible();
    await expect(folderRow(page, name).getByText(/^Jira /)).toHaveCount(0);
    await expect(form).toHaveCount(0);
    await expect(add).toBeFocused();
    await expect(folderRow(other, name)).toBeVisible();

    await folderRow(page, name)
      .getByRole('button', { name: `Remove ${name}` })
      .click();

    await expect(folderRow(page, name)).toHaveCount(0);
    await expect(folderRow(other, name)).toHaveCount(0);
  } finally {
    folders.remove();
  }
});

test('AC-7, AC-10: Given the add-folder form, when the folder is not a repository, then Folder says so, and Escape closes the form', async ({
  page,
}, testInfo) => {
  const folders = makeFolders(testInfo.project.name);
  try {
    await page.goto('/settings/repositories');
    await waitForTab(page, 'repositories');
    const add = page.getByRole('button', { name: 'Add local folder' });
    await add.click();
    const folder = page.getByRole('textbox', { name: 'Folder' });

    await folder.fill(folders.plain);
    await page.getByRole('button', { name: 'Add folder' }).click();

    await expect(folder).toHaveAccessibleDescription(
      "This folder isn't a git repository. Claude works on a branch, so it needs one.",
    );
    await expect(folder).toBeFocused();
    expect(await horizontalOverflow(page)).toBe(0);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('form', { name: 'Add a folder' })).toHaveCount(0);
    await expect(add).toBeFocused();
  } finally {
    folders.remove();
  }
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const tab of ['coding-agent', 'repositories', 'inbox-rules'] as const) {
    test(`AC-20: Given ${tab} in ${colorScheme}, when axe checks the page, then it finds no violations, contrast included`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(`/settings/${tab}`);
      await waitForTab(page, tab);
      if (tab === 'repositories') {
        // The open form with an error, so the field, the select and the message are checked too.
        await page.getByRole('button', { name: 'Add local folder' }).click();
        await page.getByRole('button', { name: 'Add folder' }).click();
        await expect(page.getByText("Enter the folder's path.")).toBeVisible();
      }

      expect(await axeViolations(page)).toEqual([]);
    });
  }
}
