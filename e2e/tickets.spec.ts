// The callbacks passed to page.evaluate() run in the browser.
/// <reference lib="dom" />
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { makeTicket, makeTickets } from '../packages/contracts/src/testing.ts';

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
// isn't connected. To see the board and the list, the browser's request for the sprint is answered here,
// the network being the one thing a test may fake (spec 008, task 21 and the review).

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

/** The whole page, so page-level rules (one `h1`, landmarks) count too. */
async function axeViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const results = await window.axe.run(document.documentElement, { resultTypes: ['violations'] });
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

/** The design's sprint, with a long title and a hidden-text due date in every column, answered for the page. */
async function answerSprint(page: Page) {
  const tickets = [
    makeTicket({
      key: 'PROJ-1377',
      title: 'Search returns archived sites for guest users',
      column: 'to_do',
      type: 'Bug',
      bug: true,
      dueDate: '2026-10-19',
    }),
    makeTicket({ key: 'PROJ-1423', session: { id: 'session-1423', state: 'needs_you' } }),
    makeTicket({
      key: 'PROJ-1350',
      title: 'Migrate feed cards to the new Card component',
      column: 'in_review',
      status: 'Code Review',
    }),
    makeTicket({
      key: 'PROJ-1340',
      title: 'Lazy-load the people directory',
      column: 'done',
      status: 'Done',
      dueDate: '2026-10-14',
    }),
  ];
  await page.route('**/api/tickets', (route) => route.fulfill({ json: makeTickets({ tickets }) }));
}

for (const view of ['board', 'list'] as const) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`AC-32: Given the sprint as a ${view} in ${colorScheme}, when axe checks the page, then it finds no violations and the page never scrolls sideways`, async ({
      page,
    }) => {
      await answerSprint(page);
      await page.addInitScript((picked) => {
        localStorage.setItem('devhub.tickets', JSON.stringify({ state: { view: picked }, version: 0 }));
      }, view);
      await page.emulateMedia({ colorScheme });
      await page.goto('/tickets');
      await expect(page.getByRole('heading', { level: 1, name: 'Sprint 42 tickets' })).toBeAttached();
      await expect(page.getByText('PROJ-1423').first()).toBeVisible();

      expect(await axeViolations(page)).toEqual([]);
      // Hidden words inside the scroll box once widened the page at 360 px (spec 008, task 21).
      expect(await horizontalOverflow(page)).toBe(0);
    });
  }
}
