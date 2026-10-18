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

/** The page bar: the header that holds the breadcrumb (inside <main> it is not a banner landmark). */
function pageBar(page: Page) {
  return page.getByRole('navigation', { name: 'Breadcrumb' }).locator('xpath=..');
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

  test('Given the expanded sidebar, when I drag its edge, then it opens at 300 px, resizes between 260 and 400 px and keeps the width', async ({
    page,
  }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    const navWidth = async () => Math.round((await nav.boundingBox())?.width ?? 0);
    const handle = nav.getByRole('separator', { name: 'Resize sidebar' });
    expect(await navWidth()).toBe(300);

    const box = await handle.boundingBox();
    if (box === null) throw new Error('the resize handle is not on screen');
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, y, { steps: 4 });
    expect(await navWidth()).toBe(380);
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
    expect(await navWidth()).toBe(300);
  });

  test('Given a wide window, when I open a page, then its column is 960 px (Home 720 px), centred, inside a 48 px gutter', async ({
    page,
  }) => {
    const main = page.getByRole('main');
    /** The column's distance from each side of the main pane, and its width. */
    const place = async (column: ReturnType<Page['getByRole']>) => {
      const pane = await main.boundingBox();
      const box = await column.boundingBox();
      if (pane === null || box === null) throw new Error('the page is not on screen');
      return {
        width: Math.round(box.width),
        start: Math.round(box.x - pane.x),
        end: Math.round(pane.x + pane.width - (box.x + box.width)),
      };
    };
    const settingsColumn = page.getByRole('tablist', { name: 'Settings sections' });
    const homeColumn = page.getByRole('region', { name: 'Needs your attention' });

    // 1280 px: beside the 300 px sidebar, a 980 px pane is narrower than 960 + 2 × 48, so the gutter decides the width.
    await page.goto('/settings/connections');
    expect(await place(settingsColumn)).toEqual({ width: 884, start: 48, end: 48 });

    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await place(settingsColumn)).toEqual({ width: 960, start: 90, end: 90 });

    await page.goto('/');
    expect(await place(homeColumn)).toEqual({ width: 720, start: 210, end: 210 });
  });

  test('Given a page taller than the window, when I scroll it, then the sidebar and the page bar stay where they are', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    await page.goto('/settings/connections');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    const sidebar = page.getByRole('navigation', { name: 'Main' });

    await page.evaluate(() => {
      window.scrollBy(0, 400);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    expect(await sidebar.boundingBox()).toMatchObject({ y: 0, height: 480 });
    expect((await pageBar(page).boundingBox())?.y).toBe(0);
    await expect(sidebar.getByText('Claude not connected · runs locally')).toBeInViewport();
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
    await expect(nav.getByRole('separator', { name: 'Resize sidebar' })).toHaveCount(0);

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    const mainTop = await page.getByRole('main').evaluate((main) => main.getBoundingClientRect().top);
    expect(mainTop).toBeLessThan(140);
    // The page column keeps a 16 px gutter on both sides.
    const column = await page.getByRole('region', { name: 'Needs your attention' }).boundingBox();
    expect(column === null ? null : { start: column.x, width: column.width }).toEqual({ start: 16, width: 328 });
  });

  test('Given a session with a long title, when I open it at 360 px, then the crumbs sit side by side and only the title is cut', async ({
    page,
  }) => {
    const title = 'Fix timezone shift in event cards and the calendar export for every region';
    // Only the network is faked: the hub has no sessions until roadmap 011.
    await page.route(/\/api\/sessions(\?.*)?$/, (route) =>
      route.fulfill({
        json: {
          sessions: [
            {
              id: 'long',
              title,
              state: 'done',
              source: { kind: 'pull_request', number: 2836 },
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      }),
    );
    await page.goto('/sessions/long');
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    const link = await crumbs.getByRole('link', { name: 'Sessions' }).boundingBox();
    const current = await crumbs.getByTitle(title).boundingBox();
    if (link === null || current === null) throw new Error('the crumbs are not on screen');

    expect(link.x + link.width).toBeLessThan(current.x);
    expect(current.x + current.width).toBeLessThanOrEqual(360 - 16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    // One slim bar: the title is cut rather than the bar growing a second line.
    expect((await pageBar(page).boundingBox())?.height).toBe(56);
  });

  test('Given a page taller than the window at 360 px, when I scroll it, then the page bar stays on top and the compact bar scrolls away', async ({
    page,
  }) => {
    await page.goto('/settings/connections');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

    await page.evaluate(() => {
      window.scrollBy(0, 400);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);

    expect((await pageBar(page).boundingBox())?.y).toBe(0);
    await expect(page.getByRole('navigation', { name: 'Main' })).not.toBeInViewport();
  });

  test('Given Settings at 360 px, when it opens, then the page bar stays one 56 px line', async ({ page }) => {
    await page.goto('/settings/connections');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

    expect((await pageBar(page).boundingBox())?.height).toBe(56);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByText('Connections')).toBeVisible();
  });
});
