// The callbacks passed to page.evaluate() run in the browser.
/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { fakeToolsControlPort, fakeToolsHubPort, type FakeTools } from './fake-tools/config.ts';

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

function rows(page: Page) {
  return attentionPanel(page).getByRole('list').getByRole('listitem');
}

/** Home showing what the tools hold. */
async function openHome(page: Page, tools: FakeTools = everything) {
  await page.goto('/');
  await holdInTools(page, tools);
  await syncNow(page);
  await expect(rows(page)).toHaveCount(tools.issues.length + tools.reviews.length + tools.mine.length);
}

function connectionRow(page: Page, tool: string) {
  return page.getByRole('list', { name: 'Connections' }).getByRole('listitem').filter({ hasText: tool });
}

test.beforeAll(async ({ browser }, testInfo) => {
  // One window size only: the hub and its fake are shared, so a second run would trip over the first.
  test.skip((testInfo.project.use.viewport?.width ?? 0) < 768, 'the tests share one fake Jira and GitHub');
  const page = await browser.newPage({ baseURL: `http://127.0.0.1:${String(fakeToolsHubPort)}` });
  await page.goto('/settings/connections');
  await holdInTools(page, everything);

  // The site, email and tokens the fakes accept (packages/core/src/test).
  await connectionRow(page, 'Jira').getByRole('button', { name: 'Connect' }).click();
  const jira = page.getByRole('form', { name: 'Jira connection' });
  await jira.getByRole('textbox', { name: 'Jira site' }).fill('your-team.atlassian.net');
  await jira.getByRole('textbox', { name: 'Email' }).fill('dev@example.com');
  await jira.getByLabel('API token', { exact: true }).fill('fake-good-token');
  await jira.getByRole('button', { name: 'Connect Jira' }).click();
  await expect(connectionRow(page, 'Jira').getByText('Connected', { exact: true })).toBeVisible();

  await connectionRow(page, 'GitHub').getByRole('button', { name: 'Connect' }).click();
  const github = page.getByRole('form', { name: 'GitHub connection' });
  await github.getByText('Use a personal access token').click();
  await github.getByLabel('Personal access token', { exact: true }).fill('fake-github-token-for-tests');
  await github.getByRole('button', { name: 'Connect GitHub' }).click();
  await expect(connectionRow(page, 'GitHub').getByText('Connected', { exact: true })).toBeVisible();

  await page.close();
});

test('Given Jira and GitHub are connected, when Home opens, then their rows show under the tabs, newest wait first', async ({
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

test('Given Home with rows, when I go through it with Tab, then it stops on Refresh, the order, the selected tab, then each title and action, each with the focus ring', async ({
  page,
}) => {
  await openHome(page);
  await page.getByRole('button', { name: 'Refresh' }).focus();

  const stops: { name: string; ring: boolean }[] = [];
  for (let stop = 0; stop < 6; stop += 1) {
    stops.push(
      await page.evaluate(() => {
        const focused = document.activeElement;
        const style = focused === null ? null : getComputedStyle(focused);
        return {
          name: focused?.textContent ?? '',
          ring: style !== null && style.outlineStyle === 'solid' && style.outlineWidth === '2px',
        };
      }),
    );
    await page.keyboard.press('Tab');
  }

  expect(stops).toEqual([
    { name: 'Refresh', ring: true },
    { name: 'Newest first', ring: true },
    { name: 'All 14', ring: true },
    { name: 'Fix timezone shift in event cards', ring: true },
    { name: 'Open', ring: true },
    { name: 'Lazy-load the people directory', ring: true },
  ]);
});

test('Given a row has focus, when a sync brings a new item and takes another away, then focus and the row stay where they are', async ({
  page,
}) => {
  await openHome(page);
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  // Newest first, so the tickets run from the 9-day wait (summaries[11]) down to the 20-day one (summaries[0]).
  const kept = attentionPanel(page).getByRole('link', { name: summaries[2] });
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
  await expect(attentionPanel(page).getByRole('link', { name: summaries[10] })).toHaveCount(0);
  await expect(kept).toBeFocused();
  expect((await kept.boundingBox())?.y).toBe(before?.y);
});

test("Given a row has focus, when a sync takes it away, then focus moves to the next row's title and the page doesn't scroll", async ({
  page,
}) => {
  await openHome(page);
  // Far enough down to see the row, and a row's height short of the end: the page gets a row shorter.
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight - window.innerHeight - 100);
  });
  await attentionPanel(page).getByRole('link', { name: summaries[2] }).focus();
  const scrolled = await page.evaluate(() => window.scrollY);

  await holdInTools(page, { ...everything, issues: tickets.filter((_, index) => index !== 2) });
  await syncNow(page);

  // Newest first, the next row down is the ticket that has waited a day longer.
  await expect(attentionPanel(page).getByRole('link', { name: summaries[1] })).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
});
