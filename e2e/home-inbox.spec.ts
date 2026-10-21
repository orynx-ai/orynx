// The callbacks passed to page.evaluate() run in the browser.
/// <reference lib="dom" />
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { fakeToolsControlPort, fakeToolsHubPort, type FakeTools } from './fake-tools/config.ts';

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

// Home with Jira and GitHub faked inside the hub (e2e/fake-tools/preload.ts): the real server syncs them,
// and the real page shows the rows.
test.use({ baseURL: `http://127.0.0.1:${String(fakeToolsHubPort)}` });
// One hub and one fake for the whole file, so the tests take turns.
test.describe.configure({ mode: 'serial' });

const hour = 3_600_000;
const day = 24 * hour;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
/** Jira writes its times with a +0000 offset. */
const jiraAgo = (ms: number) => ago(ms).replace('Z', '+0000');

const summaries = [
  'Add bulk archive to the content list',
  'Search returns archived sites for guest users',
  'Show the author on every news card',
  'Keep the people filter after a reload',
  'Load the org chart in pages',
  'Fix the empty state on saved searches',
  'Let admins pin a site to the top',
  'Move the feed settings into one tab',
  'Speed up the site picker',
  'Explain why a page is read-only',
  'Remember the last tab on profiles',
  'Name the export after its site',
] as const;

/** Twelve of your Jira tickets, waiting 20 days down to 9 days, oldest first. */
const tickets = summaries.map((summary, index) => ({
  key: `PROJ-${String(1400 + index)}`,
  summary,
  status: 'In Progress',
  category: 'indeterminate' as const,
  statuscategorychangedate: jiraAgo((20 - index) * day),
}));

const reviewRequest = {
  number: 2841,
  title: 'Lazy-load the people directory',
  requests: [{ login: 'octocat', at: ago(2 * day + hour) }],
};

const failingChecks = {
  number: 2836,
  title: 'Fix timezone shift in event cards',
  author: { login: 'octocat', name: 'The Octocat' },
  checks: 'FAILURE',
  contexts: [{ type: 'CheckRun' as const, conclusion: 'FAILURE', completedAt: ago(3 * hour) }],
};

const everything: FakeTools = { issues: tickets, reviews: [reviewRequest], mine: [failingChecks] };

/** Tells the fake Jira and GitHub what they hold from now on. */
async function holdInTools(page: Page, tools: FakeTools) {
  const answer = await page.request.put(`http://127.0.0.1:${String(fakeToolsControlPort)}/tools`, { data: tools });
  expect(answer.status()).toBe(204);
}

/**
 * Syncs now, as the 2-minute schedule would, without touching the page: focus and scroll stay where the
 * test put them. The hub then sends inbox.changed, and the page fetches the new list.
 */
async function syncNow(page: Page) {
  await page.evaluate(async () => {
    const token = document.querySelector('meta[name="devhub-token"]')?.getAttribute('content') ?? '';
    const answer = await fetch('/api/inbox/refresh', { method: 'POST', headers: { 'x-devhub-token': token } });
    if (!answer.ok) throw new Error(`The sync answered ${String(answer.status)}`);
  });
}

function attentionPanel(page: Page) {
  return page.getByRole('region', { name: 'Needs your attention' });
}

/** The rows: the panel's first list (the pager, when there is one, is another). */
function rows(page: Page) {
  return attentionPanel(page).getByRole('list').first().getByRole('listitem');
}

/** Home showing what the tools hold. */
async function openHome(page: Page, tools: FakeTools = everything) {
  await page.goto('/');
  await holdInTools(page, tools);
  await syncNow(page);
  // 16 rows a page.
  await expect(rows(page)).toHaveCount(Math.min(16, tools.issues.length + tools.reviews.length + tools.mine.length));
}

/** Twenty more tickets, so the list runs to two pages. */
const backlog = Array.from({ length: 20 }, (_, index) => ({
  key: `PROJ-${String(1500 + index)}`,
  summary: `Backlog item ${String(index + 1)}`,
  status: index % 2 === 0 ? 'To Do' : 'In Progress',
  category: index % 2 === 0 ? ('new' as const) : ('indeterminate' as const),
  statuscategorychangedate: jiraAgo((index + 1) * day),
}));

test.beforeAll(async ({ browser }, testInfo) => {
  // One window size only: the hub and its fake are shared, so a second run would trip over the first.
  test.skip((testInfo.project.use.viewport?.width ?? 0) < 768, 'the tests share one fake Jira and GitHub');
  const page = await browser.newPage({ baseURL: `http://127.0.0.1:${String(fakeToolsHubPort)}` });
  await page.goto('/settings/connections');
  await holdInTools(page, everything);

  // The site, email and tokens the fakes accept (packages/core/src/test).
  await page.getByRole('button', { name: 'Jira: Not connected. Manage connection' }).click();
  const jira = page.getByRole('form', { name: 'Jira connection' });
  await jira.getByRole('textbox', { name: 'Jira site' }).fill('your-team.atlassian.net');
  await jira.getByRole('textbox', { name: 'Email' }).fill('dev@example.com');
  await jira.getByLabel('API token', { exact: true }).fill('fake-good-token');
  await page.getByRole('dialog', { name: 'Jira' }).getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Jira: Connected. Manage connection' })).toBeVisible();

  await page.getByRole('button', { name: 'GitHub: Not connected. Manage connection' }).click();
  const github = page.getByRole('form', { name: 'GitHub connection' });
  await github.getByText('Use a personal access token').click();
  await github.getByLabel('Personal access token', { exact: true }).fill('fake-github-token-for-tests');
  await page.getByRole('dialog', { name: 'GitHub' }).getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: 'GitHub: Connected. Manage connection' })).toBeVisible();

  await page.close();
});

test('AC-1, AC-39: Given Jira and GitHub are connected, when Home opens, then their rows show under the tabs, newest wait first', async ({
  page,
}) => {
  await openHome(page);
  const panel = attentionPanel(page);

  await expect(panel.getByRole('tab')).toHaveText(['All 14', 'Jira 12', 'Pull requests 2']);
  await expect(panel.getByRole('button', { name: 'Order: Newest first' })).toBeVisible();
  await expect(rows(page).first()).toContainText('Fix timezone shift in event cards');
  await expect(rows(page).first()).toContainText('web-app #2836 · your pull request');
  await expect(rows(page).first()).toContainText('Checks failing · 3 h');
  await expect(rows(page).nth(1)).toContainText('Lazy-load the people directory');
  await expect(rows(page).nth(1)).toContainText('web-app #2841 · by Priya S.');
  await expect(rows(page).nth(1)).toContainText('Review requested · 2 d');
  await expect(rows(page).last()).toContainText(summaries[0]);
  await expect(rows(page).last()).toContainText('PROJ-1400 · In Progress');
  await expect(rows(page).last()).toContainText('In progress · 20 d');
  await expect(page.getByText('Synced just now')).toBeVisible();
});

test('AC-33, AC-45: Given Home with rows, when I go through it with Tab, then it stops on Sync, the composer and its quick starts (spec 015), the order, the selected tab, the search box, the filter, then each title and action, each with the focus ring', async ({
  page,
}) => {
  await openHome(page);
  await page.getByRole('button', { name: 'Sync', exact: true }).focus();

  const stops: { name: string; ring: boolean }[] = [];
  for (let stop = 0; stop < 18; stop += 1) {
    stops.push(
      await page.evaluate(() => {
        const focused = document.activeElement;
        // The composer's box is named by its label, and the composer draws its ring around the whole box.
        const box = focused instanceof HTMLTextAreaElement ? focused : null;
        const ringed = box === null ? focused : box.closest('form');
        const style = ringed === null ? null : getComputedStyle(ringed);
        const label = box?.labels[0]?.textContent ?? null;
        return {
          name: focused?.getAttribute('aria-label') ?? label ?? focused?.textContent ?? '',
          ring: style !== null && style.outlineStyle === 'solid' && style.outlineWidth === '2px',
        };
      }),
    );
    await page.keyboard.press('Tab');
  }

  expect(stops).toEqual([
    { name: 'Sync', ring: true },
    // Your shell in Orynx's home folder, in the page bar.
    { name: 'Terminal', ring: true },
    { name: 'Describe a task for Claude', ring: true },
    { name: 'Add context', ring: true },
    // Ask or Build, in the composer since spec 031.
    { name: 'Ask', ring: true },
    { name: 'Build', ring: true },
    { name: 'Add a folder', ring: true },
    // Claude's state here depends on which spec last answered for this hub's fake Claude Code.
    { name: expect.stringMatching(/^Agent: Claude, (connected|signed out)$/) as unknown as string, ring: true },
    { name: 'Send to Claude', ring: true },
    { name: 'Pick up a ticket', ring: true },
    { name: 'Review a pull request', ring: true },
    { name: 'Order: Newest first', ring: true },
    { name: 'All 14', ring: true },
    { name: 'Search', ring: true },
    { name: 'Reason', ring: true },
    { name: 'Fix timezone shift in event cards', ring: true },
    // A row's one action adds it to the composer (spec 022, AC-26).
    { name: 'Add web-app #2836 to the composer', ring: true },
    { name: 'Lazy-load the people directory', ring: true },
  ]);
});

test('AC-16: Given a row has focus, when a sync brings a new item and takes another away, then focus and the row stay where they are', async ({
  page,
}) => {
  await openHome(page);
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  // Newest first, so the tickets run from the 9-day wait (summaries[11]) down to the 20-day one (summaries[0]).
  const kept = attentionPanel(page).getByRole('button', { name: summaries[2] });
  await kept.focus();
  const before = await kept.boundingBox();

  const newest = {
    key: 'PROJ-1412',
    summary: 'Archive the old intranet theme',
    category: 'indeterminate' as const,
    statuscategorychangedate: jiraAgo(hour),
  };
  await holdInTools(page, { ...everything, issues: [...tickets.filter((_, index) => index !== 10), newest] });
  await syncNow(page);

  await expect(rows(page).first()).toContainText('Archive the old intranet theme');
  await expect(attentionPanel(page).getByRole('button', { name: summaries[10] })).toHaveCount(0);
  await expect(kept).toBeFocused();
  expect((await kept.boundingBox())?.y).toBe(before?.y);
});

test("AC-16, AC-18: Given a row has focus, when a sync takes it away, then focus moves to the next row's title and the page doesn't scroll", async ({
  page,
}) => {
  await openHome(page);
  // Far enough down to see the row, and a row's height short of the end: the page gets a row shorter.
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight - window.innerHeight - 100);
  });
  await attentionPanel(page).getByRole('button', { name: summaries[2] }).focus();
  const scrolled = await page.evaluate(() => window.scrollY);

  await holdInTools(page, { ...everything, issues: tickets.filter((_, index) => index !== 2) });
  await syncNow(page);

  // Newest first, the next row down is the ticket that has waited a day longer.
  await expect(attentionPanel(page).getByRole('button', { name: summaries[1] })).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
});

test('AC-36, AC-37, AC-39, AC-40, AC-41: Given two pages of rows, when I pick a page, search, tick a filter and change the order, then the list follows, and a reload keeps it all', async ({
  page,
}) => {
  await openHome(page, { ...everything, issues: backlog });
  const panel = attentionPanel(page);
  const pager = panel.getByRole('navigation', { name: 'Pages' });

  await pager.getByRole('link', { name: '2' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(rows(page)).toHaveCount(6);
  // The first row is a Jira ticket, whose title is a button that opens the ticket dialog (spec 022).
  await expect(rows(page).first().getByRole('button').first()).toBeFocused();

  const search = panel.getByRole('searchbox', { name: 'Search' });
  await search.fill('people');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Lazy-load the people directory');
  await expect(page).not.toHaveURL(/page=/);
  await search.fill('');
  await expect(rows(page)).toHaveCount(16);

  await panel.getByRole('button', { name: 'Reason' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Checks failing' }).click();
  await page.keyboard.press('Escape');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Fix timezone shift in event cards');
  await expect(panel.getByRole('button', { name: 'Reason · 1' })).toBeFocused();

  await panel.getByRole('button', { name: 'Order: Newest first' }).click();
  await page.getByRole('menuitemradio', { name: 'Longest wait first' }).click();
  await expect(page).toHaveURL(/sort=longest/);
  await expect(page).toHaveURL(/reason=checks-failing/);

  await page.reload();
  await expect(rows(page)).toHaveCount(1);
  await expect(attentionPanel(page).getByRole('button', { name: 'Reason · 1' })).toBeVisible();
  await expect(attentionPanel(page).getByRole('button', { name: 'Order: Longest wait first' })).toBeVisible();
});

test('AC-34, AC-45: Given the toolbar and the pager, when axe checks Home and then its open filter menu, then it finds nothing', async ({
  page,
}) => {
  await openHome(page, { ...everything, issues: backlog });
  await page.addScriptTag({ path: axePath });
  const check = (selector: string) =>
    page.evaluate(async (context) => {
      const target = document.querySelector(context);
      if (target === null) throw new Error(`Nothing matches ${context}`);
      // axe reads colours as drawn, so a menu still fading in would fail on contrast: let it settle first.
      const moving = target
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);
      await Promise.allSettled(moving.map((animation) => animation.finished));
      const results = await window.axe.run(target, { resultTypes: ['violations'] });
      return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
    }, selector);

  expect(await check('body')).toEqual([]);

  // An open menu hides the rest of the page from screen readers, so it is checked on its own.
  await attentionPanel(page).getByRole('button', { name: 'Reason' }).click();
  await expect(page.getByRole('menu', { name: 'Reason' })).toBeVisible();
  expect(await check('[role="menu"]')).toEqual([]);
});

test('AC-43: Given a 360 px window and nine pages, when I look at the toolbar and the pager, then the box takes a line of its own, the filter wraps under it, the pager keeps its arrows and fits, and nothing scrolls sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const many = Array.from({ length: 130 }, (_, index) => ({
    key: `PROJ-${String(2000 + index)}`,
    summary: `Long backlog item ${String(index + 1)}`,
    category: 'new' as const,
    statuscategorychangedate: jiraAgo((index + 1) * hour),
  }));
  await openHome(page, { ...everything, issues: many });
  await page.goto('/?page=5');
  const panel = attentionPanel(page);
  await expect(rows(page)).toHaveCount(16);

  const search = await panel.getByRole('searchbox', { name: 'Search' }).boundingBox();
  const reason = await panel.getByRole('button', { name: 'Reason' }).boundingBox();
  expect(reason && search && reason.y >= search.y + search.height).toBe(true);

  const pager = panel.getByRole('navigation', { name: 'Pages' });
  await expect(pager.getByRole('link', { name: 'Previous page' })).toBeVisible();
  await expect(pager.getByRole('link', { name: 'Next page' })).toBeVisible();
  await expect(pager.getByText('Next', { exact: true })).toBeHidden();
  await expect(pager.getByRole('link', { name: '5' })).toHaveAttribute('aria-current', 'page');
  const links = await pager
    .getByRole('link')
    .evaluateAll((all) =>
      all
        .filter((link) => link.getBoundingClientRect().width > 0)
        .map((link) => link.getAttribute('aria-label') ?? link.textContent),
    );
  expect(links).toEqual(['Previous page', '1', '4', '5', '6', '9', 'Next page']);

  const box = await panel.boundingBox();
  const shown = await pager.locator('ul').boundingBox();
  expect(box && shown && shown.x >= box.x && shown.x + shown.width <= box.x + box.width).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
