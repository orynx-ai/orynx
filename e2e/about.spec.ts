// The callbacks passed to page.evaluate() run in the browser.
/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { axeViolations } from './axe.ts';

// Settings › About (spec 045) on the first hub: this clone started with `pnpm start`, so it's started by hand, and its
// releases come from e2e/fake-tools/releases.ts: 0.1.40 with notes and 0.1.39 with none, both newer than a clone with
// no release tag in its history.

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

test('AC-3: Given Settings, when I pick About, then it is the last tab, at /settings/about, marked selected', async ({
  page,
}) => {
  await page.goto('/settings/connections');
  const tabs = page.getByRole('tablist', { name: 'Settings sections' }).getByRole('tab');
  await expect(tabs.last()).toHaveText('About');
  await tabs.last().click();
  await expect(page).toHaveURL('/settings/about');
  await expect(page.getByRole('tab', { name: 'About' })).toHaveAttribute('aria-selected', 'true');
});

test('AC-2, AC-7, AC-30: Given a clone started by hand and a newer release, then About shows its folder, the release and the commands', async ({
  page,
}) => {
  await page.goto('/settings/about');
  await expect(page.getByRole('group', { name: 'Version' })).toContainText('Started by hand from');
  const updates = page.getByRole('group', { name: 'Updates' });
  await expect(updates).toContainText('Orynx 0.1.40 is out.');
  await expect(updates.getByRole('button', { name: 'Update', exact: true })).toHaveCount(0);
  await expect(page.getByText(/^To update, run this in/)).toBeVisible();
  const commands = page.getByRole('group', { name: 'git pull --ff-only && pnpm install' });
  await expect(commands.getByRole('button', { name: /Copy/ })).toBeVisible();
});

test('AC-14, AC-17: Given two releases, then What’s new lists them newest first, with notes or a line saying none', async ({
  page,
}) => {
  await page.goto('/settings/about');
  const releases = page.getByRole('article');
  await expect(releases).toHaveCount(2);
  await expect(releases.first().getByRole('heading', { level: 3 })).toHaveText('0.1.40New');
  await expect(releases.first().getByRole('heading', { name: 'Fixed', level: 4 })).toBeVisible();
  await expect(releases.first()).toContainText('Keep the branch on delete');
  await expect(releases.last()).toContainText('No notes for this release.');
});

test('AC-4: Given About is opening, when the hub answers, then nothing on the page moves', async ({ page }) => {
  // The commands for a clone started by hand come with the answer, under the rows, so no skeleton can hold their
  // place; this measures the three parts' rows as any other Orynx gets them.
  await page.route('**/api/updates', async (route) => {
    const answer = (await (await route.fetch()).json()) as { action: string };
    await route.fulfill({ json: { ...answer, action: 'none' } });
  });
  await page.goto('/settings/about');
  await expect(page.getByRole('article')).toHaveCount(2);
  expect(await layoutShiftScore(page)).toBe(0);
});

test('AC-5: Given About, then nothing scrolls sideways and axe finds nothing', async ({ page }) => {
  await page.goto('/settings/about');
  await expect(page.getByRole('article')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
    0,
  );
  expect(await axeViolations(page, 'html')).toEqual([]);
});
