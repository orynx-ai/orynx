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

/**
 * The whole page, so page-level rules (one `h1`, landmarks) count too. It waits for every colour fade and
 * grow-in to end first, so axe never reads a colour half-drawn (see the e2e axe notes).
 */
async function axeViolations(page: Page, within?: string): Promise<string[]> {
  await settled(page);
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async (selector) => {
    // An open menu hides the page behind it from screen readers, so a check while one is open looks at it alone.
    const context = selector === undefined ? document.documentElement : document.querySelector(selector);
    if (context === null) throw new Error(`Nothing on the page matches ${String(selector)}`);
    const results = await window.axe.run(context, { resultTypes: ['violations'] });
    return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
  }, within);
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
    makeTicket({ key: 'PROJ-1423', session: { id: 'session-1423', state: 'needs_you', ready: 'nothing' } }),
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

test.describe('the Project and Sprint pickers (spec 020)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'measured once, at 1280 px');

  test('AC-26, AC-38, AC-40: Given Tickets, when I open Project then Sprint, then both lists are 256 px, at most 360 px, in 14 px rows, and axe finds nothing', async ({
    page,
  }) => {
    await answerSprint(page);
    const projects = Array.from({ length: 20 }, (_, index) => ({
      key: `P${String.fromCharCode(65 + index)}X`,
      name: `Project ${String(index + 1)}`,
    }));
    const sprints = Array.from({ length: 12 }, (_, index) => ({
      id: 43 + index,
      name: `Sprint ${String(43 + index)}`,
      state: index === 0 ? 'active' : 'future',
      startsAt: '2026-10-27T09:00:00.000Z',
      endsAt: index === 0 ? '2026-10-24T17:00:00.000Z' : null,
    }));
    await page.route('**/api/jira/connection', (route) =>
      route.fulfill({
        json: { saved: { site: 'your-team.atlassian.net', email: 'dev@example.com' }, envToken: false },
      }),
    );
    await page.route('**/api/jira/projects', (route) => route.fulfill({ json: { projects } }));
    await page.route('**/api/tickets/sprints**', (route) => route.fulfill({ json: { sprints } }));
    await page.goto('/tickets');
    await expect(page.getByText('PROJ-1423').first()).toBeVisible();

    const project = page.getByRole('button', { name: /^Project / });
    const sprint = page.getByRole('button', { name: /^Sprint / });
    expect((await project.boundingBox())?.width).toBe((await sprint.boundingBox())?.width);

    await project.click();
    // The popover the list opens in: its search box over the listbox, and the loading and no-match lines.
    const list = page.locator('[data-slot="combobox-list"]');
    await expect(page.getByRole('option', { name: 'PTX · Project 20' })).toBeAttached();
    // Measured once its grow-in has ended.
    await settled(page);
    const listBox = await list.boundingBox();
    expect(listBox?.width).toBe(256);
    expect(listBox?.height).toBeLessThanOrEqual(360);
    expect((await page.getByRole('option', { name: 'PAX · Project 1' }).boundingBox())?.height).toBe(32);
    expect(await axeViolations(page, '[data-slot="combobox-list"]')).toEqual([]);
    await page.keyboard.press('Escape');

    await sprint.click();
    const menu = page.getByRole('menu', { name: 'Sprint' });
    await expect(menu.getByRole('menuitemradio', { name: /Sprint 43/ })).toBeVisible();
    await settled(page);
    const menuBox = await menu.boundingBox();
    expect(menuBox?.width).toBe(256);
    expect(menuBox?.height).toBeLessThanOrEqual(360);
    expect(
      await menu.getByRole('menuitemradio', { name: /Sprint 43/ }).evaluate((item) => getComputedStyle(item).fontSize),
    ).toBe('14px');
    await settled(page);
    expect(await axeViolations(page, '[data-slot="menu"]')).toEqual([]);
  });
});

/** Waits for every finite animation to end, so axe never reads a list still fading in (e2e axe notes). */
async function settled(page: Page) {
  await page.evaluate(async () => {
    const moving = document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);
    await Promise.allSettled(moving.map((animation) => animation.finished));
  });
}
