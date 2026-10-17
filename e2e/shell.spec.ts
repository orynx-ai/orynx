// The callbacks passed to page.evaluate() and addInitScript() run in the browser.
/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    /** The sidebar's width when it first appeared, recorded by an init script. */
    firstNavWidth?: number;
  }
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

/** "Alt+Meta+N" (aria-keyshortcuts) → "Alt+Meta+KeyN" (Playwright), so the test presses what the page shows. */
function playwrightKeys(ariaKeyShortcuts: string): string {
  return ariaKeyShortcuts.replace(/\+N$/, '+KeyN');
}

test('Given any page, when I press the New task shortcut, then Home opens with focus on its content', async ({
  page,
}) => {
  await page.goto('/tickets');
  const newTask = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^New task/ });
  const keys = await newTask.getAttribute('aria-keyshortcuts');
  expect(keys).toMatch(/^(Alt\+Meta|Control\+Alt)\+N$/);

  await page.keyboard.press(playwrightKeys(keys ?? ''));

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'What should we build today?' })).toBeVisible();
  await expect(page.getByRole('main')).toBeFocused();
});

test('Given DevHub is opening, when the status and sessions arrive, then nothing on the page moves', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'What should we build today?' })).toBeVisible();

  expect(await layoutShiftScore(page)).toBe(0);
});

test.describe('wide window', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'the rail exists only from 768 px');

  test('Given I collapsed the sidebar, when I reload, then the first paint is already the rail and nothing moves', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await page.addInitScript(() => {
      // Record the sidebar's width the moment it first appears in the page.
      new MutationObserver((_, observer) => {
        const nav = document.querySelector('nav[aria-label="Main"]');
        if (nav === null) return;
        window.firstNavWidth = nav.getBoundingClientRect().width;
        observer.disconnect();
      }).observe(document, { childList: true, subtree: true });
    });

    await page.reload();

    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
    expect(await page.evaluate(() => window.firstNavWidth)).toBe(64);
    expect(await layoutShiftScore(page)).toBe(0);
  });

  test('Given the expanded sidebar, when I drag its edge, then it resizes between 260 and 400 px and keeps the width', async ({
    page,
  }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    const navWidth = async () => Math.round((await nav.boundingBox())?.width ?? 0);
    const handle = nav.getByRole('separator', { name: 'Resize sidebar' });
    expect(await navWidth()).toBe(260);

    const box = await handle.boundingBox();
    if (box === null) throw new Error('the resize handle is not on screen');
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, y, { steps: 4 });
    expect(await navWidth()).toBe(340);
    await page.mouse.move(box.x + box.width / 2 + 600, y, { steps: 4 });
    await page.mouse.up();
    expect(await navWidth()).toBe(400);
    await page.mouse.move(box.x + box.width / 2 - 600, y);
    expect(await navWidth()).toBe(400);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'What should we build today?' })).toBeVisible();
    expect(await navWidth()).toBe(400);
    expect(await layoutShiftScore(page)).toBe(0);

    await handle.dblclick();
    expect(await navWidth()).toBe(260);
  });

  test('Given a wide window, when I open DevHub, then the footer says whether Claude is connected', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByText('Claude not connected · runs locally'),
    ).toBeVisible();
  });
});

test.describe('narrow window', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 768, 'the compact bar exists only under 768 px');

  test('Given a 360 px window, when I open Home, then the compact bar fits and the content starts near the top', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'What should we build today?' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Main' });

    for (const name of ['Home', 'Tickets', 'Settings', 'Sessions']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
    }
    await expect(nav.getByRole('link', { name: /^New task/ })).toBeVisible();
    await expect(nav.getByRole('button', { name: /Search/ })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'View all' })).toBeHidden();

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    const mainTop = await page.getByRole('main').evaluate((main) => main.getBoundingClientRect().top);
    expect(mainTop).toBeLessThan(140);
  });
});
