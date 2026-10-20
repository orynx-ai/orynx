import { expect, test, type Page } from '@playwright/test';

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

/** The profile menu's trigger: the sidebar footer, or the narrow bar's avatar under 768 px. */
function profileButton(page: Page) {
  return page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Profile/ });
}

/** Opens the theme choices: a sub menu from 768 px, and in the menu itself in a narrow window. */
async function openAppearance(page: Page) {
  await profileButton(page).click();
  if ((page.viewportSize()?.width ?? 0) >= 768) await page.getByRole('menuitem', { name: 'Appearance' }).click();
}

test('Given the profile menu, when you pick Dark under Appearance, then the page turns dark and stays dark after a reload', async ({
  page,
}) => {
  await page.goto('/');

  await openAppearance(page);
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await openAppearance(page);
  await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
});

test('Given Edit profile, when you add a picture, name and bio, then the sidebar shows them after a reload', async ({
  page,
}) => {
  await page.goto('/');

  await profileButton(page).click();
  await page.getByRole('menu', { name: 'Profile' }).getByRole('menuitem').first().click();
  const dialog = page.getByRole('dialog', { name: 'Edit profile' });
  // A 2 × 1 red PNG: wider than tall, so the dialog crops it to a square.
  await dialog.getByLabel('Add picture').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8DwH4QBEfcD/ePF9e8AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(dialog.getByRole('button', { name: 'Remove' })).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Ada Lovelace');
  await dialog.getByRole('textbox', { name: 'Bio' }).fill('Writes the first program');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await profileButton(page).click();
  const person = page.getByRole('menuitem', { name: 'Ada Lovelace Writes the first program' });
  await expect(person).toBeVisible();
  await expect(person.locator('img')).toHaveAttribute('src', /^data:image\/(webp|png);base64,/);
});

test('Given a caller without the page token, when it calls the API, then the hub refuses it', async ({ request }) => {
  const res = await request.get('/api/status');
  expect(res.status()).toBe(401);
});
