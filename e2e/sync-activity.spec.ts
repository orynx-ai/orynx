// The callbacks passed to page.evaluate() run in the browser.
/// <reference lib="dom" />
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { controlPortFor, syncActivityHubPort, type FakeTools } from './fake-tools/config.ts';

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

// Sync activity (spec 035) on its own hub, with Jira and GitHub faked inside it (e2e/fake-tools/preload.ts).
test.use({ baseURL: `http://127.0.0.1:${String(syncActivityHubPort)}` });
// One hub and one fake for the whole file, so the tests take turns.
test.describe.configure({ mode: 'serial' });

const tools: FakeTools = {
  issues: [{ key: 'PROJ-1431', summary: 'Add bulk archive to the content list' }],
  reviews: [{ number: 2841, title: 'Lazy-load the people directory' }],
  mine: [],
};

/** Calls the hub's own API from the page, with the page's session token. */
async function api(page: Page, method: string, path: string, body?: unknown) {
  const status = await page.evaluate(
    async ({ method: verb, path: url, body: data }) => {
      const token = document.querySelector('meta[name="devhub-token"]')?.getAttribute('content') ?? '';
      // A JSON type with no body is refused, so only a call with a body says it sends JSON.
      const answer = await fetch(url, {
        method: verb,
        headers: { 'x-devhub-token': token, ...(data === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      return answer.status;
    },
    { method, path, body },
  );
  expect(status).toBeLessThan(300);
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ baseURL: `http://127.0.0.1:${String(syncActivityHubPort)}` });
  const held = await page.request.put(`http://127.0.0.1:${String(controlPortFor(syncActivityHubPort))}/tools`, {
    data: tools,
  });
  expect(held.status()).toBe(204);
  await page.goto('/');
  // Saving the same connection again changes nothing, so each project's run may do it.
  await api(page, 'PUT', '/api/jira/connection', {
    site: 'your-team.atlassian.net',
    email: 'dev@example.com',
    apiToken: 'fake-good-token',
  });
  await api(page, 'PUT', '/api/github/connection', { method: 'token', token: 'fake-github-token-for-tests' });
  await api(page, 'POST', '/api/inbox/refresh');
  await page.close();
});

async function openSyncActivity(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^Sync activity/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Sync activity' });
  await expect(dialog.getByRole('list', { name: 'Tools' })).toBeVisible();
  return dialog;
}

/** axe on the open dialog once its fade-in has ended: a half-drawn dialog would fail on contrast. */
async function axe(page: Page) {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog === null) throw new Error('No dialog');
    const moving = document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);
    await Promise.allSettled(moving.map((animation) => animation.finished));
    const results = await window.axe.run(dialog, { resultTypes: ['violations'] });
    return results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(' ')).join(', ')})`,
    );
  });
}

test('AC-1, AC-20: Given Jira and GitHub connected, when I open Sync activity from Home and press Sync now on Jira, then Jira alone syncs and its run tops the history', async ({
  page,
}, testInfo) => {
  test.skip((testInfo.project.use.viewport?.width ?? 0) < 768, 'syncing is the same at every width');
  const dialog = await openSyncActivity(page);
  await expect(dialog.getByText('2 connected · all syncing fine')).toBeVisible();

  await dialog.getByRole('button', { name: 'Jira, Syncing fine' }).click();
  await expect(dialog.getByRole('heading', { name: 'Jira' })).toBeVisible();
  const history = dialog.getByRole('list', { name: 'Sync history' });
  await expect(history.getByRole('button').first()).toBeVisible();
  const before = await history.getByRole('button').count();
  await dialog.getByRole('button', { name: 'Sync now' }).click();

  // At least one more: the other project's run may sync this hub too.
  await expect.poll(() => history.getByRole('button').count()).toBeGreaterThan(before);
  await expect(dialog.getByRole('status')).toHaveText('Jira synced.');
  await expect(dialog.getByRole('button', { name: 'Sync now' })).toBeVisible();
});

test('AC-27: Given the modal open, when I use only the keyboard, then Tab goes from the head through the tools to the history, each with its focus ring', async ({
  page,
}, testInfo) => {
  test.skip((testInfo.project.use.viewport?.width ?? 0) < 768, 'the order is the same at every width');
  // Opened from the keyboard, as a keyboard user does: focus lands on the dialog's first control, with its ring.
  await page.goto('/');
  await page.getByRole('button', { name: /^Sync activity/ }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Sync activity' });
  await expect(dialog.getByRole('list', { name: 'Tools' })).toBeVisible();

  const stops = [
    dialog.getByRole('button', { name: 'Sync all now' }),
    dialog.getByRole('button', { name: 'Close sync activity' }),
    dialog.getByRole('button', { name: 'All activity' }),
    dialog.getByRole('button', { name: 'Jira, Syncing fine' }),
    dialog.getByRole('button', { name: 'GitHub, Syncing fine' }),
    dialog.getByRole('group', { name: 'Show' }).getByRole('button', { name: 'All' }),
  ];
  for (const stop of stops) {
    await expect(stop).toBeFocused();
    // The focus ring: an outline, or the ring drawn as a shadow.
    const ring = await stop.evaluate(
      (element) => getComputedStyle(element).outlineStyle !== 'none' || getComputedStyle(element).boxShadow !== 'none',
    );
    expect(ring).toBe(true);
    await page.keyboard.press('Tab');
  }

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: /^Sync activity/ })).toBeFocused();
});

for (const theme of ['light', 'dark'] as const) {
  test(`AC-30, AC-31: Given the modal open in ${theme}, when axe checks it and I measure it, then it finds nothing, it is at most 1100 × 860 px, and nothing scrolls sideways`, async ({
    page,
  }) => {
    test.slow();
    await page.emulateMedia({ colorScheme: theme });
    const dialog = await openSyncActivity(page);
    await dialog.getByRole('list', { name: 'Sync history' }).getByRole('button').first().click();

    expect(await axe(page)).toEqual([]);
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport).toBeTruthy();
    if (box === null || viewport === null) return;
    expect(box.width).toBeLessThanOrEqual(1100);
    expect(box.height).toBeLessThanOrEqual(860);
    // The 16 px gutter on every side.
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 16);
    const sideways = await page.evaluate(() => {
      const open = document.querySelector('[role="dialog"]');
      return (
        document.documentElement.scrollWidth > window.innerWidth ||
        (open !== null && open.scrollWidth > open.clientWidth)
      );
    });
    expect(sideways).toBe(false);
    if (viewport.width < 768) {
      // Under 768 px the tools sit above the detail.
      const list = await dialog.getByRole('list', { name: 'Tools' }).boundingBox();
      const heading = await dialog.getByRole('heading', { level: 3 }).boundingBox();
      expect(list && heading && heading.y >= list.y + list.height).toBe(true);
    }
  });
}
