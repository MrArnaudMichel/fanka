import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures/onboarded';

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

test('leaving a settings page with unsaved changes asks first', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/settings/study');
  const save = page.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();

  const field = page.getByRole('spinbutton', { name: 'New cards per day' });
  await field.fill('9');
  await field.press('Tab');
  await expect(save).toBeEnabled();

  await page.getByRole('link', { name: 'Display' }).click();
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog')).filter({ hasText: 'Leave without saving?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Stay' }).click();
  await expect(page).toHaveURL(/\/settings\/study$/);

  await page.getByRole('link', { name: 'Display' }).click();
  await dialog.getByRole('button', { name: 'Leave' }).click();
  await expect(page).toHaveURL(/\/settings\/display$/);
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

test('account deletion is offered only to a signed-in learner', async ({ page }) => {
  await page.goto('/settings/account');
  await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send link' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete account' })).toHaveCount(0);
});

test('about links to the privacy policy, account deletion and licences', async ({ page }) => {
  await page.goto('/settings/about');
  await page.getByRole('button', { name: 'Privacy policy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page.goBack();
  await page.getByRole('button', { name: 'Open source licences' }).click();
  await expect(page).toHaveURL(/\/licences$/);
});

test('a backup exported here restores without an error', async ({ page }) => {
  await page.goto('/settings/data');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const exported = await download;
  const buffer = readFileSync(await exported.path());
  await page.locator('kt-drag-drop input[type="file"]').setInputFiles({ name: exported.suggestedFilename(), mimeType: 'application/json', buffer });
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  // A restore that lands reloads the page; one that fails toasts instead.
  const reloaded = page.waitForEvent('load');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restore', exact: true }).click();
  await reloaded;
  await expect(page.getByText("Couldn't restore the backup")).toHaveCount(0);
});

test('switching what you learn hides the other bundle\'s decks, and back', async ({ page }) => {
  await page.goto('/settings/study');
  await page.getByRole('button', { name: /Mainland Chinese/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-bundle', 'mainland');
  await page.goto('/radicals');
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/decks');
  await expect(page.getByRole('heading', { name: 'Decks', level: 1 })).toBeVisible();
  await expect(page.getByText('HSK 1 — traditional')).toHaveCount(0);
  await page.goto('/settings/study');
  await page.getByRole('button', { name: /Taiwanese Mandarin/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-bundle', 'taiwan');
  await page.goto('/decks');
  await expect(page.getByText('HSK 1 — traditional').first()).toBeVisible();
});
