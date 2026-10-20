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

// The e2e server finds e2e/fake-gh/gh first on its PATH: always signed out (playwright.config.ts).
const signedOut = "gh isn't signed in to github.com. Run gh auth login in a terminal, then try again.";

/** GitHub's status button, named for its state (spec 030). */
function githubButton(page: Page, state: 'Not connected' | 'Connected' | 'Needs reconnecting') {
  return page.getByRole('button', { name: `GitHub: ${state}. Manage connection` });
}

const githubDialog = (page: Page) => page.getByRole('dialog', { name: 'GitHub' });
const connect = (page: Page) => githubDialog(page).getByRole('button', { name: 'Connect', exact: true });

async function openForm(page: Page) {
  await page.goto('/settings/connections');
  await githubButton(page, 'Not connected').click();
  const form = page.getByRole('form', { name: 'GitHub connection' });
  await expect(form).toBeVisible();
  return form;
}

/**
 * GitHub saved the gh way, and its login expired: the e2e hub's gh is never signed in, so the status is
 * faked to the state a person would see after a while (spec 030).
 */
async function fakeExpiredGh(page: Page) {
  await page.route('**/api/status', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { integrations: Record<string, object> };
    body.integrations['github'] = { state: 'error', detail: signedOut };
    await route.fulfill({ response, json: body });
  });
  await page.route('**/api/github/connection', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { saved: { method: 'gh' }, envToken: false, ghFound: true } })
      : route.fallback(),
  );
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

test('AC-5: Given Settings is opening, when the status and the GitHub settings arrive, then nothing on the page moves', async ({
  page,
}) => {
  await page.goto('/settings/connections');
  await expect(githubButton(page, 'Not connected')).toBeVisible();

  expect(await layoutShiftScore(page)).toBe(0);
});

test('AC-10, AC-23: Given only a keyboard, when I open the dialog, pick the token way with an arrow key and press Escape, then focus goes back to the status button', async ({
  page,
}) => {
  await page.goto('/settings/connections');
  const button = githubButton(page, 'Not connected');
  await button.focus();

  await page.keyboard.press('Enter');
  const form = page.getByRole('form', { name: 'GitHub connection' });
  await expect(form.getByRole('radio', { name: 'Use my gh login' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(form.getByRole('radio', { name: 'Use a personal access token' })).toBeChecked();
  await expect(form.getByLabel('Personal access token', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(githubDialog(page)).toBeHidden();
  await expect(button).toBeFocused();
});

test('AC-21: Given gh is signed out, when I connect the gh way, then the choices say so and nothing is saved', async ({
  page,
}) => {
  const form = await openForm(page);

  await connect(page).click();

  const ways = form.getByRole('radiogroup', { name: 'Connect with' });
  await expect(ways).toHaveAttribute('aria-invalid', 'true');
  await expect(ways).toHaveAccessibleDescription(signedOut);
  await expect(githubDialog(page).getByText('Not connected')).toBeVisible();
});

test('AC-21: Given the token way, when I press Enter with no token, then the field says what it needs and nothing leaves the page', async ({
  page,
}) => {
  const saves: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().endsWith('/api/github/connection')) saves.push(request.url());
  });
  const form = await openForm(page);
  await form.getByText('Use a personal access token').click();
  const token = form.getByLabel('Personal access token', { exact: true });

  await token.press('Enter');

  await expect(token).toHaveAccessibleDescription('Paste your GitHub token.');
  await expect(token).toBeFocused();
  expect(saves).toEqual([]);
});

test('AC-25: Given the open form, when errors show, then the dialog fits the window and nothing scrolls sideways', async ({
  page,
}) => {
  const form = await openForm(page);

  await connect(page).click();
  await expect(form.getByText(signedOut)).toBeVisible();
  await form.getByText('Use a personal access token').click();
  await connect(page).click();
  await expect(form.getByText('Paste your GitHub token.')).toBeVisible();

  const width = page.viewportSize()?.width ?? 0;
  expect((await githubDialog(page).boundingBox())?.width).toBe(Math.min(520, width - 32));
  expect(await sidewaysScroll(page)).toBe(0);
});

test('AC-15, AC-17: Given the gh login expired, when I sign gh in again and press Reconnect, then the dialog shuts and the page says so', async ({
  page,
}) => {
  await fakeExpiredGh(page);
  await page.route('**/api/github/connection/check', (route) =>
    route.fulfill({
      json: {
        status: {
          state: 'connected',
          detail: 'Signed in as octocat with the gh command-line tool',
          account: 'octocat',
          checkedAt: new Date().toISOString(),
        },
        ms: 240,
      },
    }),
  );
  await page.goto('/settings/connections');
  await githubButton(page, 'Needs reconnecting').click();
  const dialog = githubDialog(page);
  await expect(dialog.getByText(signedOut)).toBeVisible();
  await expect(dialog.getByText('gh auth login', { exact: true })).toBeVisible();

  await dialog.getByRole('button', { name: 'Reconnect' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText('GitHub reconnected. Your inbox is refreshing.')).toBeVisible();
  await expect(githubButton(page, 'Connected')).toBeFocused();
  expect(await sidewaysScroll(page)).toBe(0);
});

test('AC-4: Given the page, when I point at a status button, then its tooltip says what pressing does', async ({
  page,
}) => {
  await fakeExpiredGh(page);
  await page.goto('/settings/connections');

  await githubButton(page, 'Needs reconnecting').hover();

  await expect(page.getByRole('tooltip')).toHaveText('Needs reconnecting · select to fix');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`AC-24: Given each GitHub dialog state in ${colorScheme}, when axe checks it, then it finds no violations, contrast included`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    const form = await openForm(page);
    await connect(page).click();
    await expect(form.getByText(signedOut)).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);

    await form.getByText('Use a personal access token').click();
    await connect(page).click();
    await expect(form.getByText('Paste your GitHub token.')).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);

    await fakeExpiredGh(page);
    await page.reload();
    await githubButton(page, 'Needs reconnecting').click();
    await expect(githubDialog(page).getByText('gh auth login', { exact: true })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });
}
