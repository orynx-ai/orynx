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

function githubRow(page: Page) {
  return page.getByRole('list', { name: 'Connections' }).getByRole('listitem').filter({ hasText: 'GitHub' });
}

async function openForm(page: Page) {
  await page.goto('/settings/connections');
  await githubRow(page).getByRole('button', { name: 'Connect' }).click();
  const form = page.getByRole('form', { name: 'GitHub connection' });
  await expect(form).toBeVisible();
  return form;
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
    const results = await window.axe.run(document.body, { resultTypes: ['violations'] });
    return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
  });
}

test('Given Settings is opening, when the status and the GitHub settings arrive, then nothing on the page moves', async ({
  page,
}) => {
  await page.goto('/settings/connections');
  await expect(githubRow(page).getByRole('button', { name: 'Connect' })).toBeVisible();

  expect(await layoutShiftScore(page)).toBe(0);
});

test('Given the GitHub row, when I open the form from the keyboard, pick the token way with an arrow key and press Cancel, then focus goes back to Connect', async ({
  page,
}) => {
  await page.goto('/settings/connections');
  const connect = githubRow(page).getByRole('button', { name: 'Connect' });
  await connect.focus();

  await page.keyboard.press('Enter');
  const form = page.getByRole('form', { name: 'GitHub connection' });
  await expect(form.getByRole('radio', { name: 'Use my gh login' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(form.getByRole('radio', { name: 'Use a personal access token' })).toBeChecked();
  await expect(form.getByLabel('Personal access token', { exact: true })).toBeVisible();
  await form.getByRole('button', { name: 'Cancel' }).focus();
  await page.keyboard.press('Enter');

  await expect(form).toBeHidden();
  await expect(githubRow(page).getByRole('button', { name: 'Connect' })).toBeFocused();
});

test('Given gh is signed out, when I connect the gh way, then the choices say so and nothing is saved', async ({
  page,
}) => {
  const form = await openForm(page);

  await form.getByRole('button', { name: 'Connect GitHub' }).click();

  const ways = form.getByRole('radiogroup', { name: 'Connect with' });
  await expect(ways).toHaveAttribute('aria-invalid', 'true');
  await expect(ways).toHaveAccessibleDescription(signedOut);
  await expect(githubRow(page).getByText('Not connected')).toBeVisible();
});

test('Given the token way, when I send an empty token, then the field says what it needs and nothing leaves the page', async ({
  page,
}) => {
  const saves: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().endsWith('/api/github/connection')) saves.push(request.url());
  });
  const form = await openForm(page);
  await form.getByText('Use a personal access token').click();

  await form.getByRole('button', { name: 'Connect GitHub' }).click();

  const token = form.getByLabel('Personal access token', { exact: true });
  await expect(token).toHaveAccessibleDescription('Paste your GitHub token.');
  await expect(token).toBeFocused();
  expect(saves).toEqual([]);
});

test('Given the open form, when errors show, then the form keeps its place and nothing scrolls sideways', async ({
  page,
}) => {
  const form = await openForm(page);
  // Where the form sits on the page, not in the window: focusing the first wrong field may scroll.
  const place = () =>
    form.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top + window.scrollY, left: box.left + window.scrollX };
    });
  const before = await place();

  await form.getByRole('button', { name: 'Connect GitHub' }).click();
  await expect(form.getByText(signedOut)).toBeVisible();
  await form.getByText('Use a personal access token').click();
  await form.getByRole('button', { name: 'Connect GitHub' }).click();
  await expect(form.getByText('Paste your GitHub token.')).toBeVisible();

  expect(await place()).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
    0,
  );
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Given the open form with errors in ${colorScheme}, when axe checks the page, then it finds no violations, contrast included`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    const form = await openForm(page);
    await form.getByRole('button', { name: 'Connect GitHub' }).click();
    await expect(form.getByText(signedOut)).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);

    await form.getByText('Use a personal access token').click();
    await form.getByRole('button', { name: 'Connect GitHub' }).click();
    await expect(form.getByText('Paste your GitHub token.')).toBeVisible();

    expect(await axeViolations(page)).toEqual([]);
  });
}
