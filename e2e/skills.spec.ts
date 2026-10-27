// The callbacks passed to page.evaluate() run in the browser.
/// <reference lib="dom" />
import { createRequire } from 'node:module';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

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

// The desktop and phone runs share one hub and one skills folder, so each test names its skills after its run
// and its own purpose, and never relies on the folder being empty.

/** A Name only this test and this run use; a retry's is its own, as the failed try's skill is still there. */
function nameFor(testInfo: TestInfo, what: string): string {
  const retry = testInfo.retry === 0 ? '' : ` retry ${String(testInfo.retry)}`;
  return `${what} ${testInfo.project.name}${retry}`;
}

/** The folder a Name makes, as Orynx makes it. */
function folderOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/** axe on the page, once anything fading in has settled (memory: e2e axe runs mid-animation). */
async function axeViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    // Only animations on the page's clock end: a scroll-driven one (the sidebar's scroll-fade-y) never does.
    const moving = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.timeline === document.timeline && animation.effect?.getComputedTiming().endTime !== Infinity,
      );
    await Promise.allSettled(moving.map((animation) => animation.finished));
    const results = await window.axe.run(document.body, { resultTypes: ['violations'] });
    return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
  });
}

function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
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

/** Writes a skill through New skill and Save skill, and waits for it to open. */
async function addSkill(page: Page, name: string) {
  await page.getByRole('button', { name: 'New skill' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'New skill' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
  await page.keyboard.type(name);
  await page.getByRole('textbox', { name: 'When to use it' }).fill(`When ${name} helps.`);
  await page.getByRole('textbox', { name: 'Instructions for Claude' }).fill(`# ${name}\n\nReport only.`);
  await page.getByRole('button', { name: 'Save skill' }).click();
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Saved');
}

async function openSkills(page: Page) {
  await page.goto('/settings/skills');
  await expect(page.getByRole('list', { name: 'Your skills' }).or(page.getByText('No skills yet.'))).toBeVisible();
}

test('AC-5, AC-6, AC-9, AC-10, AC-19: Given two pages on Settings › Skills, when I add, rename and delete a skill in one, then the other follows', async ({
  page,
  context,
}, testInfo) => {
  const name = nameFor(testInfo, 'Bug bash');
  const renamed = nameFor(testInfo, 'Bug hunt');
  const other = await context.newPage();
  await openSkills(other);
  await openSkills(page);

  await addSkill(page, name);
  await expect(page).toHaveURL(new RegExp(`skill=${folderOf(name)}$`));
  await expect(other.getByRole('button', { name })).toBeVisible();

  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(renamed);
  await expect(page.getByRole('textbox', { name: 'Folder name' })).toHaveValue(folderOf(renamed));
  await page.getByRole('button', { name: 'Save skill' }).click();
  await expect(page.getByRole('heading', { level: 2, name: renamed })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`skill=${folderOf(renamed)}$`));
  await expect(other.getByRole('button', { name: renamed })).toBeVisible();
  await expect(other.getByRole('button', { name, exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Delete skill' }).click();
  const dialog = page.getByRole('dialog', { name: `Delete ${renamed}?` });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Delete skill' }).click();
  await expect(page.getByRole('button', { name: renamed })).toHaveCount(0);
  await expect(other.getByRole('button', { name: renamed })).toHaveCount(0);
});

test('AC-11, AC-26: Given unsaved changes, when I pick another skill, then Orynx asks, and Escape keeps me with focus back where I was', async ({
  page,
}, testInfo) => {
  const first = nameFor(testInfo, 'Discard one');
  const second = nameFor(testInfo, 'Discard two');
  await openSkills(page);
  await addSkill(page, first);
  await addSkill(page, second);

  await page.getByRole('textbox', { name: 'Instructions for Claude' }).press('End');
  await page.keyboard.type(' More.');
  await expect(page.getByRole('status')).toHaveText('Unsaved changes');
  const firstItem = page.getByRole('button', { name: first });
  await firstItem.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: `Discard changes to ${second}?` });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(firstItem).toBeFocused();
  await expect(page.getByRole('heading', { level: 2, name: second })).toBeVisible();

  await page.keyboard.press('Enter');
  await page.getByRole('dialog').getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.getByRole('heading', { level: 2, name: first })).toBeVisible();
});

test('AC-15: Given Settings › Skills is opening, when the skills arrive, then nothing on the page moves', async ({
  page,
}, testInfo) => {
  await openSkills(page);
  await addSkill(page, nameFor(testInfo, 'Steady'));

  await page.reload();
  expect(await layoutShiftScore(page)).toBeLessThan(0.01);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`AC-25: Given Settings › Skills in ${colorScheme}, when axe checks it and its delete dialog, then it finds no violations and nothing scrolls sideways`, async ({
    page,
  }, testInfo) => {
    const name = nameFor(testInfo, `Axe ${colorScheme}`);
    await page.emulateMedia({ colorScheme });
    await openSkills(page);
    await addSkill(page, name);

    expect(await horizontalOverflow(page)).toBe(0);
    expect(await axeViolations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Delete skill' }).click();
    await expect(page.getByRole('dialog', { name: `Delete ${name}?` })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });
}

test('AC-23: Given a saved skill, when I press Try in a new session, then Home opens with its / name at the start of the box', async ({
  page,
}, testInfo) => {
  const name = nameFor(testInfo, 'Try it');
  await openSkills(page);
  await addSkill(page, name);

  await page.getByRole('button', { name: 'Try in a new session' }).click();

  await expect(page).toHaveURL(/\/$/);
  const box = page.getByRole('textbox', { name: 'Describe a task for Claude' });
  await expect(box).toBeFocused();
  await expect(box).toHaveValue(`/${folderOf(name)} `);
});
