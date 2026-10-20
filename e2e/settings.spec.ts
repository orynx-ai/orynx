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
  // Controls fade from their loading look (Coding agent's rows); mid-fade colours aren't the page's real ones.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
  );
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
async function waitForTab(page: Page, tab: 'coding-agent' | 'repositories' | 'inbox-rules' | 'notifications') {
  if (tab === 'coding-agent') await expect(page.getByRole('radio').first()).toBeEnabled();
  if (tab === 'inbox-rules') await expect(page.getByRole('checkbox').first()).toBeEnabled();
  if (tab === 'notifications') await expect(page.getByRole('switch', { name: 'Pop-ups inside Orynx' })).toBeEnabled();
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
  await expect(tabs).toHaveText([
    'Connections',
    'Coding agent',
    'Skills',
    'Notifications',
    'Repositories',
    'Inbox rules',
  ]);

  for (const [name, path] of [
    ['Coding agent', '/settings/coding-agent'],
    ['Notifications', '/settings/notifications'],
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
  await page.goto('/settings/inbox-rules');
  const list = page.getByRole('tablist', { name: 'Settings sections' });
  const tab = page.getByRole('tab', { name: 'Inbox rules' });
  await expect(tab).toHaveAttribute('aria-selected', 'true');

  const listBox = await list.boundingBox();
  const tabBox = await tab.boundingBox();
  if (listBox === null || tabBox === null) throw new Error('The tab list is not on screen.');
  expect(tabBox.x).toBeGreaterThanOrEqual(listBox.x);
  expect(tabBox.x + tabBox.width).toBeLessThanOrEqual(listBox.x + listBox.width + 0.5);

  // Back to the first tab without a click on it, in the same page, as the Back button does.
  await page.goto('/settings/connections');
  await page.getByRole('tab', { name: 'Inbox rules' }).click();
  await expect(page).toHaveURL('/settings/inbox-rules');
  await page.goBack();
  const first = page.getByRole('tab', { name: 'Connections' });
  await expect(first).toHaveAttribute('aria-selected', 'true');
  const firstBox = await first.boundingBox();
  const listAfter = await list.boundingBox();
  if (firstBox === null || listAfter === null) throw new Error('The tab list is not on screen.');
  expect(firstBox.x).toBeGreaterThanOrEqual(listAfter.x - 0.5);
});

for (const tab of ['coding-agent', 'repositories', 'inbox-rules', 'notifications'] as const) {
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

test('AC-3, spec 026: Given Coding agent, when I change a row, then it saves and a reload keeps it', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The rows are one value for the whole server; one run owns them.');
  await page.goto('/settings/coding-agent');
  const option = (name: string) =>
    page.getByRole('group', { name: 'Edit files' }).getByRole('button', { name, exact: true });
  await expect(option('Allow')).toHaveAttribute('aria-pressed', 'true');

  const firstSave = saved(page);
  await option('Ask').click();
  await expect(option('Ask')).toBeFocused();
  await firstSave;

  await page.reload();
  await expect(option('Ask')).toHaveAttribute('aria-pressed', 'true');

  // Back to the default, for anyone who runs the suite twice against one server.
  const secondSave = saved(page);
  await option('Allow').click();
  await secondSave;
  await page.reload();
  await expect(option('Allow')).toHaveAttribute('aria-pressed', 'true');
});

test('spec 029, AC-32, AC-39: Given Notifications, when I untick a pop-up, then it saves and a reload keeps it', async ({
  page,
}) => {
  await page.goto('/settings/notifications');
  await waitForTab(page, 'notifications');
  const popUp = page.getByRole('checkbox', { name: 'Pop-up for Session finished' });
  await expect(popUp).toBeChecked();
  const saving = page.waitForResponse(
    (response) => response.url().endsWith('/api/notifications/settings') && response.request().method() === 'PATCH',
  );

  await popUp.click();
  await saving;
  await page.reload();
  await waitForTab(page, 'notifications');

  await expect(popUp).not.toBeChecked();
  // Back as it was, for the rest of the run.
  await popUp.click();
  await expect(popUp).toBeChecked();
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
    const form = page.getByRole('dialog', { name: 'Add a folder' });
    await expect(form.getByRole('textbox', { name: 'Folder' })).toBeFocused();
    // The e2e run never connects Jira.
    const project = form.getByRole('button', { name: 'Jira project' });
    await expect(project).toBeDisabled();
    await expect(form.getByText('Connect Jira in Connections to pick a project.')).toBeVisible();

    await page.keyboard.type(folders.repository);
    await page.keyboard.press('Enter');

    await expect(folderRow(page, name)).toBeVisible();
    await expect(folderRow(page, name).getByText(/^Jira /)).toHaveCount(0);
    await expect(form).toHaveCount(0);
    await expect(add).toBeFocused();
    await expect(folderRow(other, name)).toBeVisible();

    // Spec 020: a folder's actions are in its More actions menu.
    await folderRow(page, name)
      .getByRole('button', { name: `More actions for ${name}` })
      .click();
    await page.getByRole('menuitem', { name: /^Delete/ }).click();

    await expect(folderRow(page, name)).toHaveCount(0);
    await expect(folderRow(other, name)).toHaveCount(0);
  } finally {
    folders.remove();
  }
});

test('AC-17, AC-20 (spec 020): Given a folder, when I choose Edit in its More actions, then the dialog opens filled in, and Escape gives focus back to More actions', async ({
  page,
}, testInfo) => {
  const folders = makeFolders(`edit-${testInfo.project.name}`);
  const name = `app-edit-${testInfo.project.name}`;
  try {
    await page.goto('/settings/repositories');
    await waitForTab(page, 'repositories');
    await page.getByRole('button', { name: 'Add local folder' }).click();
    await page.getByRole('textbox', { name: 'Folder' }).fill(folders.repository);
    await page.keyboard.press('Enter');
    await expect(folderRow(page, name)).toBeVisible();

    const more = folderRow(page, name).getByRole('button', { name: `More actions for ${name}` });
    await more.click();
    await expect(page.getByRole('menuitem', { name: /^Delete/ })).toContainText('The folder stays on disk.');
    await page.getByRole('menuitem', { name: 'Edit' }).click();

    const dialog = page.getByRole('dialog', { name: `Edit ${name}` });
    await expect(dialog.getByRole('textbox', { name: 'Folder' })).toHaveValue(new RegExp(`${name}$`));
    await expect(dialog.getByRole('textbox', { name: 'Folder' })).toBeFocused();
    // The dialog's actions sit at its end, Cancel first (the user's call, 18 Oct 2026).
    const cancel = await dialog.getByRole('button', { name: 'Cancel' }).boundingBox();
    const save = await dialog.getByRole('button', { name: 'Save changes' }).boundingBox();
    expect(cancel !== null && save !== null && cancel.x < save.x).toBe(true);
    expect(await axeViolations(page)).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(more).toBeFocused();

    await more.click();
    await page.getByRole('menuitem', { name: /^Delete/ }).click();
    await expect(folderRow(page, name)).toHaveCount(0);
  } finally {
    folders.remove();
  }
});

test('AC-7, AC-10: Given the Add a folder dialog, when the folder is not a repository, then Folder says so, and Escape closes the dialog', async ({
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
    await expect(page.getByRole('dialog', { name: 'Add a folder' })).toHaveCount(0);
    await expect(add).toBeFocused();
  } finally {
    folders.remove();
  }
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const tab of ['coding-agent', 'repositories', 'inbox-rules', 'notifications'] as const) {
    test(`AC-20: Given ${tab} in ${colorScheme}, when axe checks the page, then it finds no violations, contrast included`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(`/settings/${tab}`);
      await waitForTab(page, tab);
      if (tab === 'repositories') {
        // The open dialog with an error, so the field, the select and the message are checked too.
        await page.getByRole('button', { name: 'Add local folder' }).click();
        await page.getByRole('button', { name: 'Add folder' }).click();
        await expect(page.getByText("Enter the folder's path.")).toBeVisible();
      }

      expect(await axeViolations(page)).toEqual([]);
    });
  }
}
