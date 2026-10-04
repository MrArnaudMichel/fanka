import { expect, test } from '@playwright/test';

test('the privacy policy is public and names the contact address', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy policy', level: 1 })).toBeVisible();
  await expect(page.getByText('contact@arnaudmichel.fr').first()).toBeVisible();
  // The legal layout has no sidebar: its Search button (AppSidebar.vue) is absent.
  await expect(page.getByRole('button', { name: 'Search' })).toHaveCount(0);
});

test('the account deletion page explains both ways to delete', async ({ page }) => {
  await page.goto('/delete-account');
  await expect(page.getByRole('heading', { name: 'Delete your Fanka account', level: 1 })).toBeVisible();
  await expect(page.getByText('Settings › Account › Delete account')).toBeVisible();
  await expect(page.getByText('contact@arnaudmichel.fr').first()).toBeVisible();
});

test('a legal page leads back to the app', async ({ page }) => {
  await page.goto('/privacy');
  await page.getByRole('button', { name: 'Back to Fanka' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('the licences page credits the stroke data and the libraries', async ({ page }) => {
  await page.goto('/licences');
  await expect(page.getByRole('heading', { name: 'Open source licences', level: 1 })).toBeVisible();
  await expect(page.getByText('Make Me a Hanzi stroke data', { exact: false })).toBeVisible();
  await expect(page.locator('kt-table tr[part=row]', { hasText: 'Vue Router' })).toBeVisible();
});
