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

const saved = { site: 'your-team.atlassian.net', email: 'dev@example.com' };
const refused = "Jira didn't accept this email and API token. Check both, or create a new token.";

/** Jira's status button, named for its state (spec 030). */
function jiraButton(page: Page, state: 'Not connected' | 'Connected' | 'Needs reconnecting') {
  return page.getByRole('button', { name: `Jira: ${state}. Manage connection` });
}

const jiraDialog = (page: Page) => page.getByRole('dialog', { name: 'Jira' });

async function openForm(page: Page) {
  await page.goto('/settings/connections');
  await jiraButton(page, 'Not connected').click();
  const form = page.getByRole('form', { name: 'Jira connection' });
  await expect(form).toBeVisible();
  return form;
}

/**
 * The e2e hub never reaches a real Jira, so a connected or refused Jira is faked here: GET status says so
 * for Jira, and the saved site and email come back. Everything else is the real hub's answer.
 */
async function fakeJira(page: Page, jira: object) {
  await page.route('**/api/status', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { integrations: Record<string, object> };
    body.integrations['jira'] = jira;
    await route.fulfill({ response, json: body });
  });
  await page.route('**/api/jira/connection', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ json: { saved, envToken: false } }) : route.fallback(),
  );
}

const connected = {
  state: 'connected',
  detail: 'Personal API token for your-team.atlassian.net',
  account: saved.email,
  checkedAt: new Date().toISOString(),
};

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
  // The dialog fades in; axe on a half-drawn dialog reads its text as low contrast.
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running' || !animation.effect),
  );
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const results = await window.axe.run(document.body, { resultTypes: ['violations'] });
    return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
  });
}

const sidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('AC-5: Given Settings is opening, when the status and the Jira settings arrive, then nothing on the page moves', async ({
  page,
}) => {
  await page.goto('/settings/connections');
  await expect(jiraButton(page, 'Not connected')).toBeVisible();

  expect(await layoutShiftScore(page)).toBe(0);
});

test('AC-10, AC-23: Given only a keyboard, when I open the dialog, then focus is in Jira site, stays in the dialog, and goes back to the status button on Escape', async ({
  page,
}) => {
  await page.goto('/settings/connections');
  const button = jiraButton(page, 'Not connected');
  await button.focus();

  await page.keyboard.press('Enter');
  const form = page.getByRole('form', { name: 'Jira connection' });
  await expect(form.getByRole('textbox', { name: 'Jira site' })).toBeFocused();
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true);
    expect(await page.evaluate(() => getComputedStyle(document.activeElement ?? document.body).outlineStyle)).not.toBe(
      'none',
    );
  }
  await page.keyboard.press('Escape');

  await expect(jiraDialog(page)).toBeHidden();
  await expect(button).toBeFocused();
});

test('AC-21: Given the open form, when I send it empty, then each field says what it needs and nothing leaves the page', async ({
  page,
}) => {
  const saves: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().endsWith('/api/jira/connection')) saves.push(request.url());
  });
  const form = await openForm(page);

  await jiraDialog(page).getByRole('button', { name: 'Connect', exact: true }).click();

  await expect(form.getByText('Enter the address you open Jira at.')).toBeVisible();
  await expect(form.getByText('Enter the email you sign in to Jira with.')).toBeVisible();
  await expect(form.getByText('Paste your Jira API token.')).toBeVisible();
  await expect(form.getByRole('textbox', { name: 'Jira site' })).toBeFocused();
  expect(saves).toEqual([]);
});

test('AC-21: Given a filled form, when I press Enter in API token, then the browser sends it and a refusal shows under the token', async ({
  page,
}) => {
  const sent: unknown[] = [];
  await page.route('**/api/jira/connection', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    sent.push(route.request().postDataJSON());
    await route.fulfill({ status: 422, json: { code: 'integration_rejected', message: refused } });
  });
  const form = await openForm(page);
  await form.getByRole('textbox', { name: 'Jira site' }).fill('your-team');
  await form.getByRole('textbox', { name: 'Email' }).fill(saved.email);
  const token = form.getByLabel('API token', { exact: true });
  await token.fill('fake-wrong-token');

  await token.press('Enter');

  await expect(token).toHaveAccessibleDescription(refused);
  expect(sent).toEqual([{ ...saved, apiToken: 'fake-wrong-token' }]);
  await expect(jiraDialog(page)).toBeVisible();
});

test('AC-25: Given the open form showing errors, when I look at it, then the dialog fits the window and nothing scrolls sideways', async ({
  page,
}) => {
  const form = await openForm(page);
  await jiraDialog(page).getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(form.getByText('Paste your Jira API token.')).toBeVisible();

  const width = page.viewportSize()?.width ?? 0;
  const box = await jiraDialog(page).boundingBox();
  // 520 px wide, or the window less the 16 px gutter on each side.
  expect(box?.width).toBe(Math.min(520, width - 32));
  expect(await sidewaysScroll(page)).toBe(0);
});

test('AC-8, AC-11: Given Jira is connected, when I test it and then ask to disconnect, then each step says so and focus lands on Keep connected', async ({
  page,
}) => {
  await fakeJira(page, connected);
  await page.route('**/api/jira/connection/check', (route) =>
    route.fulfill({ json: { status: { ...connected, checkedAt: new Date().toISOString() }, ms: 180 } }),
  );
  await page.goto('/settings/connections');
  await jiraButton(page, 'Connected').click();
  const dialog = jiraDialog(page);

  await dialog.getByRole('button', { name: 'Test connection' }).click();
  await expect(dialog.getByText('Working. Jira answered in 180 ms.')).toBeVisible();
  await expect(dialog.getByText('Just now')).toBeVisible();
  await dialog.getByRole('button', { name: 'Disconnect' }).click();

  await expect(dialog.getByRole('alert')).toContainText('Disconnect Jira?');
  await expect(dialog.getByRole('button', { name: 'Keep connected' })).toBeFocused();
  expect(await sidewaysScroll(page)).toBe(0);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`AC-24: Given the page and each Jira dialog state in ${colorScheme}, when axe checks them, then it finds no violations, contrast included`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    const form = await openForm(page);
    await jiraDialog(page).getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(form.getByText('Paste your Jira API token.')).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);

    await page.keyboard.press('Escape');
    // Focus is back on the status button, whose tooltip is a popup outside the page's landmarks: axe the page.
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    expect(await axeViolations(page)).toEqual([]);

    await fakeJira(page, connected);
    await page.route('**/api/jira/connection/check', (route) =>
      route.fulfill({ json: { status: connected, ms: 180 } }),
    );
    await page.reload();
    await jiraButton(page, 'Connected').click();
    await jiraDialog(page).getByRole('button', { name: 'Test connection' }).click();
    await expect(jiraDialog(page).getByText('Working. Jira answered in 180 ms.')).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);

    await jiraDialog(page).getByRole('button', { name: 'Disconnect' }).click();
    await expect(jiraDialog(page).getByRole('alert')).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await fakeJira(page, { state: 'error', detail: refused, account: saved.email });
    await page.reload();
    await jiraButton(page, 'Needs reconnecting').click();
    await expect(jiraDialog(page).getByLabel('API token', { exact: true })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });
}
