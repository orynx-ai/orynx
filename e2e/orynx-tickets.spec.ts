// The callbacks passed to page.evaluate() run in the browser.
/// <reference lib="dom" />
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { expect, test, type Page } from '@playwright/test';
import { orynxTicketsHubPort } from './fake-tools/config.ts';

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

// Orynx's own tickets (spec 037) on their own hub, with no Jira: the real server and its tickets.json. The desktop
// and phone projects share the hub, so each test makes tickets with a name of its own and looks only at those.
test.use({ baseURL: `http://127.0.0.1:${String(orynxTicketsHubPort)}` });
test.describe.configure({ mode: 'serial' });

/** Waits for every finite animation, so axe never reads a colour half-drawn (memory: e2e axe runs mid-animation). */
async function settled(page: Page) {
  await page.evaluate(async () => {
    const moving = document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);
    await Promise.allSettled(moving.map((animation) => animation.finished));
  });
}

async function axeViolations(page: Page, within?: string): Promise<string[]> {
  await settled(page);
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async (selector) => {
    const context = selector === undefined ? document.documentElement : document.querySelector(selector);
    if (context === null) throw new Error(`Nothing on the page matches ${String(selector)}`);
    const results = await window.axe.run(context, { resultTypes: ['violations'] });
    return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
  }, within);
}

function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Makes a ticket from the page bar's New ticket, or the empty board's, and waits for its card. */
async function makeTicket(page: Page, title: string) {
  await page.goto('/tickets');
  await page.getByRole('button', { name: 'New ticket', exact: true }).first().click();
  const form = page.getByRole('dialog', { name: 'New ticket' });
  await form.getByRole('textbox', { name: 'Title' }).fill(title);
  await form.getByRole('button', { name: 'Create ticket' }).click();
  await expect(form).toBeHidden();
  const card = page.getByRole('article', { name: title });
  await expect(card).toBeVisible();
  return card;
}

test('AC-4, AC-6, AC-7, AC-38: without Jira, New ticket makes an Orynx ticket with a due date picked from the calendar', async ({
  page,
}, info) => {
  const title = `Archive in bulk (${info.project.name})`;
  await page.goto('/tickets');
  await expect(page.getByText("Jira isn't connected, so only Orynx tickets show.")).toBeVisible();

  await page.getByRole('button', { name: 'New ticket', exact: true }).first().click();
  const form = page.getByRole('dialog', { name: 'New ticket' });
  await expect(form.getByRole('textbox', { name: 'Title' })).toBeFocused();
  await form.getByRole('textbox', { name: 'Title' }).fill(title);
  await form.getByRole('button', { name: 'Due date' }).click();
  // The calendar opens on today, focused: the keyboard moves a day on and picks it.
  await expect(page.getByRole('dialog', { name: 'Pick a date' })).toBeVisible();
  expect(await axeViolations(page, '[role="dialog"][aria-label="Pick a date"]')).toEqual([]);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(form.getByRole('button', { name: 'Due date' })).not.toHaveAccessibleDescription('Pick a date');
  await form.getByRole('button', { name: 'Create ticket' }).click();

  const card = page.getByRole('article', { name: title });
  await expect(card).toBeVisible();
  await expect(card.getByText('Orynx')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'New ticket', exact: true })).toBeFocused();
});

test('AC-13 to AC-18: open, move, edit and delete an Orynx ticket from its dialog', async ({ page }, info) => {
  const title = `Fix the date test (${info.project.name})`;
  const card = await makeTicket(page, title);

  await card.getByRole('button', { name: title }).click();
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog.getByText('Created by you', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Open in Jira/ })).toHaveCount(0);
  expect(await axeViolations(page, '[role="dialog"]')).toEqual([]);

  // Status saves at once, and the card moves.
  await dialog.getByRole('combobox', { name: 'Status' }).click();
  await page.getByRole('option', { name: 'In review' }).click();
  await expect(dialog.getByRole('combobox', { name: 'Status' })).toHaveText('In review');

  // Edit, then save.
  await dialog.getByRole('button', { name: 'Edit' }).click();
  const form = page.getByRole('dialog', { name: /^Edit ORX-/ });
  await form.getByRole('combobox', { name: 'Priority' }).click();
  await page.getByRole('option', { name: 'Highest' }).click();
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog.getByText('Highest')).toBeVisible();
  await page.keyboard.press('Escape');
  const review = page.getByRole('region', { name: /^In review/ });
  await expect(review.getByRole('article', { name: title })).toBeVisible();

  // Delete, after asking.
  await review.getByRole('article', { name: title }).getByRole('button', { name: title }).click();
  await page.getByRole('dialog', { name: title }).getByRole('button', { name: 'Delete ticket' }).click();
  const confirm = page.getByRole('alertdialog', { name: /^Delete ORX-\d+\?$/ });
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  expect(await axeViolations(page, '[role="alertdialog"]')).toEqual([]);
  await confirm.getByRole('button', { name: 'Delete ticket' }).click();
  await expect(page.getByRole('article', { name: title })).toHaveCount(0);
});

test('AC-39 to AC-43: an agent outside Orynx files a ticket through the bridge, and the board shows it at once', async ({
  page,
}, info) => {
  const title = `Login times out (${info.project.name})`;
  await page.goto('/settings/coding-agent');
  const door = page.getByRole('switch', { name: 'Other agents' });
  await expect(door).toBeEnabled();
  // The two projects share the hub: on again keeps the token the other may be using.
  if (!(await door.isChecked())) await door.click();
  await expect(page.getByRole('button', { name: 'Copy MCP config' })).toBeEnabled();
  const config = await page.evaluate(async () => {
    const token = document.querySelector('meta[name="devhub-token"]')?.getAttribute('content') ?? '';
    const answer = await fetch('/api/agents/access/config', { method: 'POST', headers: { 'x-devhub-token': token } });
    return ((await answer.json()) as { config: string }).config;
  });
  const { command, args } = (JSON.parse(config) as { mcpServers: { orynx: { command: string; args: string[] } } })
    .mcpServers.orynx;
  expect(config).not.toContain('Bearer');

  await page.goto('/tickets');
  await expect(page.getByText("Jira isn't connected, so only Orynx tickets show.")).toBeVisible();
  // The agent's MCP client starts the bridge as the config says, and talks to it over stdio.
  const bridge = spawn(command, args, { stdio: 'pipe' });
  try {
    const answers = new Map<number, (message: Record<string, unknown>) => void>();
    createInterface({ input: bridge.stdout }).on('line', (line) => {
      const message = JSON.parse(line) as { id?: number };
      if (message.id !== undefined) answers.get(message.id)?.(message);
    });
    const ask = (id: number, method: string, params: object) => {
      const answered = new Promise<Record<string, unknown>>((resolve) => answers.set(id, resolve));
      bridge.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      return answered;
    };
    await ask(1, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'Cursor e2e', version: '1.0.0' },
    });
    bridge.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const made = await ask(2, 'tools/call', { name: 'create_ticket', arguments: { title, type: 'Bug' } });
    expect(made).toHaveProperty('result');
  } finally {
    bridge.kill();
  }

  // No reload: tickets.changed brings it.
  const card = page.getByRole('article', { name: title });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: title }).click();
  await expect(page.getByRole('dialog', { name: title }).getByText(/^Created by Cursor e2e ·/)).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`AC-36, AC-37: Tickets with Orynx tickets, the form and Settings’ row in ${colorScheme}: no axe violations and nothing scrolls sideways`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme });
    await makeTicket(page, `Tidy the header (${info.project.name}, ${colorScheme})`);
    // Focus is back on New ticket, whose tooltip shows under 768 px; the page's own structure is what's checked here.
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await expect(page.getByRole('tooltip')).toHaveCount(0);

    expect(await axeViolations(page)).toEqual([]);
    expect(await horizontalOverflow(page)).toBe(0);

    await page.getByRole('button', { name: 'New ticket', exact: true }).first().click();
    await expect(page.getByRole('dialog', { name: 'New ticket' })).toBeVisible();
    expect(await axeViolations(page, '[role="dialog"]')).toEqual([]);
    expect(await horizontalOverflow(page)).toBe(0);
    await page.keyboard.press('Escape');

    await page.goto('/settings/coding-agent');
    await expect(page.getByRole('switch', { name: 'Other agents' })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    expect(await horizontalOverflow(page)).toBe(0);
  });
}
