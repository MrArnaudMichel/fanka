import { expect, test } from '@playwright/test';

test('settings opens on Account with the sections beside it on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/settings');
  await page.waitForURL(/\/settings\/account$/);
  await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Study' }).click();
  await expect(page.getByRole('heading', { name: 'Study', level: 1 })).toBeVisible();
});

test('settings is a list on a phone, and each section goes back to it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings');
  await page.getByRole('link', { name: 'About' }).click();
  await expect(page.getByText('Platform')).toBeVisible();
  await page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test('a saved study setting survives a reload', async ({ page }) => {
  await page.goto('/settings/study');
  const field = page.getByRole('spinbutton', { name: 'New cards per day' });
  await field.fill('21');
  await field.press('Tab');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Settings saved')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: 'New cards per day' })).toHaveValue('21');
});

test('the command palette opens with Control+K and goes to a page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog');
  await expect(palette).toBeVisible();
  await palette.getByRole('combobox').fill('stat');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/stats$/);
});

test('the sidebar Search button opens the command palette without a keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: /^Search/ }).click();
  const palette = page.getByRole('dialog');
  await expect(palette).toBeVisible();
  await palette.getByRole('combobox').fill('decks');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/decks$/);
});

test('the command palette jumps straight to a deck', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog');
  await expect(palette).toBeVisible();
  await palette.getByRole('combobox').fill('HSK 1');
  await expect(palette.getByRole('option', { name: /HSK 1/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/decks\/[^/]+$/);
});

test('a file that is not a backup is refused and Restore stays disabled', async ({ page }) => {
  await page.goto('/settings/data');
  await page
    .locator('kt-drag-drop input[type="file"]')
    .setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}', 'utf-8') });
  await expect(page.getByText('This file is not a Fanka backup.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore', exact: true })).toBeDisabled();
});
