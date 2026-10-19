// The callbacks passed to page.evaluate() run in the browser.
/// <reference lib="dom" />
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import {
  makeSearchIndex,
  makeSearchPullRequest,
  makeSearchTicket,
  makeSessionSummary,
  makeTicketDetail,
} from '../packages/contracts/src/testing.ts';

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

// The e2e server has no Jira or GitHub: its keychain is in memory and its DEVHUB_HOME is new. To search
// something, the browser's request for the search index is answered here, the network being the one thing
// a test may fake. The server's own GET /api/search is proven in packages/core (spec 009, task 5).

const jiraLink = 'https://your-team.atlassian.net/browse/PROJ-1423';

/** Answers the page's search with these, plus `more` tickets that also match "archive", enough to scroll. */
async function answerSearch(page: Page, more = 0) {
  const index = makeSearchIndex({
    tickets: [
      ...Array.from({ length: more }, (_, n) =>
        makeSearchTicket({
          key: `PROJ-${String(1600 + n)}`,
          title: `Archive backlog item ${String(n + 1)}`,
          status: 'To Do',
        }),
      ),
      makeSearchTicket({ key: 'PROJ-1423', title: 'Add bulk archive', status: 'In Progress' }),
      makeSearchTicket({
        key: 'PROJ-1377',
        title: 'Search returns archived sites for guest users when the audience filter is on',
        status: 'To Do',
        target: { kind: 'external', url: 'https://your-team.atlassian.net/browse/PROJ-1377' },
      }),
    ],
    pullRequests: [
      makeSearchPullRequest(),
      // A long repository name, which must give way to the title at 360 px rather than widen the results.
      makeSearchPullRequest({
        id: 'acme/frontend-intranet-application/12345',
        repository: 'frontend-intranet-application',
        number: 12345,
        title: 'Archive the old intranet pages',
        url: 'https://github.com/acme/frontend-intranet-application/pull/12345',
      }),
    ],
    sessions: [makeSessionSummary({ id: 'session-1', title: 'Archive old sites', state: 'needs_you', source: null })],
  });
  await page.route('**/api/search', (route) => route.fulfill({ json: index }));
  // A picked ticket opens the ticket dialog (spec 022), which reads the ticket in full.
  await page.route('**/api/tickets/PROJ-1423', (route) =>
    route.fulfill({ json: { result: 'found', ticket: makeTicketDetail({ title: 'Add bulk archive' }) } }),
  );
  // Jira itself is never reached: the new tab gets a stand-in page.
  await page
    .context()
    .route('https://your-team.atlassian.net/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>Jira</title>' }),
    );
}

/** The sidebar's Search button, which shows the key this browser uses: ⌘K on a Mac, Ctrl+K elsewhere. */
function searchButton(page: Page) {
  return page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Search/ });
}

async function searchKey(page: Page): Promise<string> {
  const shortcut = await searchButton(page).getAttribute('aria-keyshortcuts');
  return shortcut === 'Meta+K' ? 'Meta+k' : 'Control+k';
}

function searchBox(page: Page) {
  return page.getByRole('combobox', { name: 'Search tickets, pull requests and sessions' });
}

/**
 * A result's name: its parts in order, with a pause between them. Chrome puts a space before each hidden
 * comma ("PROJ-1423 , Add bulk archive"), which a screen reader says the same way.
 */
function namedInOrder(...parts: string[]): RegExp {
  const escaped = parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${escaped.join(' ?, ')}$`);
}

/** The result the arrow keys are on. */
async function activeResult(page: Page) {
  const id = await searchBox(page).getAttribute('aria-activedescendant');
  return page.locator(`[id="${id ?? ''}"]`);
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
    const results = await window.axe.run(document.documentElement, { resultTypes: ['violations'] });
    return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
  });
}

test('AC-1, AC-6, AC-11, AC-12, 022 AC-40: Given tickets to find, when I press the search key, type and pick one with the arrow keys and Enter, then search closes and the ticket dialog opens, whose Open in Jira opens a new tab', async ({
  page,
}) => {
  await answerSearch(page);
  await page.goto('/tickets');
  await expect(searchButton(page)).toBeVisible();

  await page.keyboard.press(await searchKey(page));
  await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible();
  await expect(searchBox(page)).toBeFocused();
  await page.keyboard.type('archive');

  await expect(page.getByRole('option')).toHaveCount(4);
  await expect(await activeResult(page)).toHaveAccessibleName(
    namedInOrder('PROJ-1423', 'Add bulk archive', 'In Progress'),
  );
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(await activeResult(page)).toHaveAccessibleName(namedInOrder('Archive old sites', 'Needs you'));
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(await activeResult(page)).toHaveAccessibleName(
    namedInOrder('PROJ-1423', 'Add bulk archive', 'In Progress'),
  );

  await page.keyboard.press('Enter');

  const ticket = page.getByRole('dialog', { name: 'Add bulk archive' });
  await expect(ticket).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  const opened = page.context().waitForEvent('page');
  await ticket.getByRole('link', { name: 'Open in Jira' }).click();
  expect((await opened).url()).toBe(jiraLink);
  await expect(page).toHaveURL(/\/tickets$/);
});

test('AC-4, AC-19: Given search opened from the sidebar, when I press Esc, then it closes and focus is back on Search, and it opens empty again', async ({
  page,
}) => {
  await answerSearch(page);
  await page.goto('/');

  await searchButton(page).click();
  await searchBox(page).fill('archive');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(searchButton(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(searchBox(page)).toHaveValue('');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`AC-29: Given more results than a short window holds, in ${colorScheme}, when axe checks the page, then it finds no violations, nothing moves as search opens, and the page never scrolls sideways`, async ({
    page,
  }) => {
    // Enough results to scroll in a short window: a scrolling box the keyboard can't reach fails axe.
    await answerSearch(page, 6);
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: page.viewportSize()?.width ?? 1280, height: 500 });
    await page.goto('/');
    await expect(searchButton(page)).toBeVisible();

    await searchButton(page).click();
    await searchBox(page).fill('archive');
    await expect(page.getByRole('option')).toHaveCount(8);

    expect(await layoutShiftScore(page)).toBeLessThan(0.01);
    expect(await axeViolations(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
      0,
    );
  });
}
