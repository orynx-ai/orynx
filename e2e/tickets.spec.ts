// The callbacks passed to page.evaluate() run in the browser.
/// <reference lib="dom" />
import { createRequire } from 'node:module';
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

// The e2e server has no Jira: its keychain is in memory and its DEVHUB_HOME is new, so Tickets says Jira
// isn't connected. The board itself is checked by the screen's tests and in a real browser (spec 008, task 21).

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

test('AC-21: Given Jira is not connected, when Tickets opens, then it says so and nothing on the page moves', async ({
  page,
}) => {
  await page.goto('/tickets');

  await expect(page.getByText('Jira is not connected')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Settings' })).toBeVisible();
  expect(await layoutShiftScore(page)).toBe(0);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`AC-32: Given Tickets in ${colorScheme}, when axe checks the page, then it finds no violations and nothing scrolls sideways`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/tickets');
    await expect(page.getByText('Jira is not connected')).toBeVisible();

    expect(await axeViolations(page)).toEqual([]);
    expect(await horizontalOverflow(page)).toBe(0);
  });
}
