import { expect, test } from '@playwright/test';

test('Given DevHub is running, when you open it, then Home greets you and the sidebar shows the places', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'What should we ship today?' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Tickets' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Settings' })).toBeVisible();
});

test('Given DevHub is running, when you open Settings, then each tool says it is not connected', async ({ page }) => {
  await page.goto('/settings');

  await expect(page).toHaveURL(/\/settings\/connections$/);
  const list = page.getByRole('list', { name: 'Connections' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(list.getByRole('button', { name: /: Not connected\. Manage connection$/ })).toHaveCount(3);
});

test('Given the Appearance tab, when you pick Dark, then the page turns dark and stays dark after a reload', async ({
  page,
}) => {
  await page.goto('/settings/appearance');

  await page.getByRole('radio', { name: 'Dark' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
});

test('Given a caller without the page token, when it calls the API, then the hub refuses it', async ({ request }) => {
  const res = await request.get('/api/status');
  expect(res.status()).toBe(401);
});
