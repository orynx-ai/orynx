// The callbacks passed to page.evaluate() run in the browser.
/// <reference lib="dom" />
import { createRequire } from 'node:module';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { apiRoutes, tokenHeader } from '../packages/contracts/src/routes.ts';
import { answerClaudeAs } from './fake-claude/config.ts';
import { fakeToolsHubPort } from './fake-tools/config.ts';

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

const notConnected = 'Claude not connected · runs locally';
const connected = 'Claude connected · runs locally';
const notSignedIn =
  "Claude Code isn't signed in on this computer. Run claude in a terminal and sign in with your company login, then check again.";

async function axeViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const results = await window.axe.run(document.body, { resultTypes: ['violations'] });
    return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
  });
}

function claudeCard(page: Page): Locator {
  return page.getByRole('group', { name: 'Claude' });
}

function footer(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Main' });
}

/** The page has no sideways scroll, and both cards sit side by side when there's room, or stack. */
async function expectCardsLaidOut(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
    0,
  );
  const claude = await claudeCard(page).boundingBox();
  const more = await page.getByRole('group', { name: 'More agents' }).boundingBox();
  if (claude === null || more === null) throw new Error('a card is not on screen');
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    // One row, each card as tall as the taller one.
    expect(more.y).toBe(claude.y);
    expect(more.height).toBe(claude.height);
  } else {
    expect(more.y).toBeGreaterThanOrEqual(claude.y + claude.height);
  }
}

/** The outline the browser draws around what has focus. */
function focusOutline(page: Page): Promise<string> {
  return page.evaluate(() => {
    const focused = document.activeElement;
    return focused === null ? 'none' : getComputedStyle(focused).outlineStyle;
  });
}

test.describe('the first hub, whose Claude Code is never signed in', () => {
  test('Given Claude Code is not signed in, when DevHub opens, then the footer and the card say so and Settings still works', async ({
    page,
  }) => {
    await page.goto('/settings/coding-agent');

    // Under 768 px the footer is behind the compact bar's menu (shell.spec.ts).
    if ((page.viewportSize()?.width ?? 0) >= 768) await expect(footer(page).getByText(notConnected)).toBeVisible();
    await expect(claudeCard(page).getByText('Not signed in')).toBeVisible();
    await expect(claudeCard(page).getByText(notSignedIn)).toBeVisible();
    await expect(claudeCard(page).getByRole('button', { name: 'Check again' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Edit files freely, ask before commands' })).toBeChecked();
    await page.getByRole('tab', { name: 'Connections' }).click();
    await expect(page.getByRole('button', { name: 'Connect' }).first()).toBeVisible();
  });

  test('Given only a keyboard, when I arrow to Coding agent and Tab to Check again, then each stop shows its ring and Enter checks', async ({
    page,
  }) => {
    await page.goto('/settings/connections');
    await page.getByRole('tab', { name: 'Connections' }).focus();

    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Coding agent' })).toBeFocused();
    await expect(page).toHaveURL(/\/settings\/coding-agent$/);
    expect(await focusOutline(page)).not.toBe('none');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('tabpanel', { name: 'Coding agent' })).toBeFocused();
    expect(await focusOutline(page)).not.toBe('none');
    await page.keyboard.press('Tab');
    const check = claudeCard(page).getByRole('button', { name: 'Check again' });
    await expect(check).toBeFocused();
    expect(await focusOutline(page)).not.toBe('none');

    const answered = page.waitForResponse((response) => response.url().endsWith(apiRoutes.claudeLoginCheck));
    await page.keyboard.press('Enter');
    expect((await answered).status()).toBe(200);
    await expect(check).toBeFocused();
    await expect(claudeCard(page).getByText('Not signed in')).toBeVisible();
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`Given Not signed in in ${colorScheme}, when axe checks the tab, then it finds no violations and the cards fit`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto('/settings/coding-agent');
      await expect(claudeCard(page).getByText('Not signed in')).toBeVisible();

      expect(await axeViolations(page)).toEqual([]);
      await expectCardsLaidOut(page);
    });
  }
});

test.describe('the second hub, whose Claude Code answers what this file writes', () => {
  test.use({ baseURL: `http://127.0.0.1:${String(fakeToolsHubPort)}` });
  test.describe.configure({ mode: 'serial' });

  /** Has the hub check again now, as Check again does, with the page's session token. */
  async function checkNow(page: Page) {
    const token = await page.locator('meta[name="devhub-token"]').getAttribute('content');
    const answer = await page.request.post(apiRoutes.claudeLoginCheck, { headers: { [tokenHeader]: token ?? '' } });
    expect(answer.status()).toBe(200);
  }

  test.beforeEach(async ({ page }, testInfo) => {
    // One fake answer for the whole hub: the phone project would change it under the desktop one.
    test.skip(testInfo.project.name !== 'desktop', 'one answer file for the whole hub');
    await answerClaudeAs('signed_out');
    await page.goto('/settings/coding-agent');
    await checkNow(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.project.name !== 'desktop') return;
    await answerClaudeAs('signed_out');
    await checkNow(page);
  });

  test('Given Not signed in, when I sign in and press Check again, then this tab and another say Active and connected without a reload', async ({
    page,
    context,
  }) => {
    await page.reload();
    const other = await context.newPage();
    await other.goto('/settings/coding-agent');
    for (const tab of [page, other]) {
      await expect(claudeCard(tab).getByText('Not signed in')).toBeVisible();
      await expect(footer(tab).getByText(notConnected)).toBeVisible();
    }

    await answerClaudeAs('signed_in');
    await claudeCard(page).getByRole('button', { name: 'Check again' }).click();

    for (const tab of [page, other]) {
      await expect(claudeCard(tab).getByText('Active')).toBeVisible({ timeout: 2000 });
      await expect(claudeCard(tab).getByText('Signed in as you@company.com · Company')).toBeVisible({
        timeout: 2000,
      });
      await expect(footer(tab).getByText(connected)).toBeVisible({ timeout: 2000 });
    }
    await other.close();
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`Given Active, then Error, in ${colorScheme} at 1280 and 360 px, when axe checks the tab, then it finds no violations and the cards fit`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await answerClaudeAs('signed_in');
      await checkNow(page);
      await page.reload();
      await expect(claudeCard(page).getByText('Active')).toBeVisible();
      for (const width of [1280, 360]) {
        await page.setViewportSize({ width, height: 800 });
        expect(await axeViolations(page)).toEqual([]);
        await expectCardsLaidOut(page);
      }

      await answerClaudeAs('unreadable');
      await checkNow(page);
      await expect(claudeCard(page).getByText('Error')).toBeVisible();
      for (const width of [1280, 360]) {
        await page.setViewportSize({ width, height: 800 });
        expect(await axeViolations(page)).toEqual([]);
        await expectCardsLaidOut(page);
      }
    });
  }
});
