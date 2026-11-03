// The callbacks passed to page.evaluate() run in the browser.
/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { axeViolations } from './axe.ts';
import { chatHubPort, controlPortFor, type FakeTools } from './fake-tools/config.ts';

// Slack and Discord on a hub of their own (spec 016), so Home's inbox spec never sees their tabs.
test.use({ baseURL: `http://127.0.0.1:${String(chatHubPort)}` });

// The fakes' own tokens, as packages/core's tests use them: Slack and Discord accept these and no others.
const slackToken = 'fake-slack-token-for-tests';
const discordToken = 'fake-discord-token-for-tests';

const sidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Neha's mention in #web-platform, 3 hours old by the real clock: past the 2 h wait, inside the 7 days. */
async function slackHolds() {
  const ts = `${String(Math.floor((Date.now() - 3 * 3_600_000) / 1000))}.000100`;
  const mention = {
    ts,
    user: 'U0NEHA0001',
    text: '<@U024BE7LH> can you confirm the archive API returns 207?',
    channel: { id: 'C024BE91L', name: 'web-platform' },
  };
  const tools: FakeTools = {
    issues: [],
    reviews: [],
    mine: [],
    slack: { mentions: [mention], threads: { [`C024BE91L/${ts}`]: [mention] } },
  };
  const answer = await fetch(`http://127.0.0.1:${String(controlPortFor(chatHubPort))}/tools`, {
    method: 'PUT',
    body: JSON.stringify(tools),
  });
  expect(answer.status).toBe(204);
}

/** Connects a tool with its token, unless the other width's run already has: both runs share this hub. */
async function connect(page: Page, tool: 'Slack' | 'Discord', label: string, token: string) {
  const notConnected = page.getByRole('button', { name: `${tool}: Not connected. Manage connection` });
  const connected = page.getByRole('button', { name: `${tool}: Connected. Manage connection` });
  await expect(notConnected.or(connected)).toBeVisible();
  if (await connected.isVisible()) return;
  await notConnected.click();
  const dialog = page.getByRole('dialog', { name: tool });
  expect(await axeViolations(page)).toEqual([]);
  await dialog.getByLabel(label).fill(token);
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(connected).toBeVisible();
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`016 AC-1, AC-2, AC-5, AC-6, AC-10, AC-19, AC-29, AC-34, AC-45: Slack and Discord from Settings to Home, ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await slackHolds();

    // Settings › Connections: both tools connect with their tokens.
    await page.goto('/settings/connections');
    await connect(page, 'Slack', 'Paste your Slack token', slackToken);
    await connect(page, 'Discord', "Paste your bot's token", discordToken);
    await expect(page.getByText('Neha K. in Acme')).toBeVisible();
    await expect(page.getByText('Orynx · 1 server')).toBeVisible();
    expect(await sidewaysScroll(page)).toBe(0);

    // Home: Slack's tab, its row, its thread into the composer, and Fix this filled in.
    await page.goto('/?inbox=slack');
    const panel = page.getByRole('region', { name: 'Needs your attention' });
    const title = 'can you confirm the archive API returns 207?';
    await expect(panel.getByRole('tab', { name: /^Slack/ })).toHaveAttribute('aria-selected', 'true');
    await expect(panel.getByRole('link', { name: new RegExp(title) })).toBeVisible();
    await expect(panel.getByText('Neha K. in #web-platform')).toBeVisible();
    await expect(panel.getByText(/^No reply · \d+ h$/)).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);

    await panel.getByRole('button', { name: /^Add Neha K\. in #web-platform/ }).click();
    await expect(page.getByRole('list', { name: 'Context for Claude' })).toContainText('Neha K. in #web-platform');

    await panel.getByRole('button', { name: new RegExp(`^Fix this: .*${title}`) }).click();
    const dialog = page.getByRole('dialog', { name: 'New ticket' });
    await expect(dialog.getByRole('textbox', { name: 'Title' })).toHaveValue(new RegExp(title));
    expect(await axeViolations(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(await sidewaysScroll(page)).toBe(0);
  });
}
