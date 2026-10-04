import { expect, test } from '@playwright/test';

test('the privacy policy is public and names the contact address', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy policy', level: 1 })).toBeVisible();
  await expect(page.getByText('contact@arnaudmichel.fr').first()).toBeVisible();
  // Every launch fetches fonts from Google, and the web build is served by
  // Vercel: the policy has to say so rather than claim nothing leaves the device.
  await expect(page.getByText(/Google Fonts/).first()).toBeVisible();
  await expect(page.getByText(/Vercel/).first()).toBeVisible();
  await expect(page.getByText('Nothing is sent anywhere.', { exact: false })).toHaveCount(0);
  // The legal layout has no sidebar: its Search button (AppSidebar.vue) is absent.
  await expect(page.getByRole('button', { name: 'Search' })).toHaveCount(0);
});

test('the privacy policy opens with a summary and lists who receives what', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'At a glance' })).toBeVisible();
  await expect(page.getByText('Stays on your device', { exact: true })).toBeVisible();
  const providers = page.locator('kt-table tr[part=row]');
  await expect(providers).toHaveCount(3);
  await expect(providers.filter({ hasText: 'Supabase' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Email us' })).toBeVisible();
});

test('the account deletion page explains both ways to delete', async ({ page }) => {
  await page.goto('/delete-account');
  await expect(page.getByRole('heading', { name: 'Delete your Fanka account', level: 1 })).toBeVisible();
  await expect(page.getByText('Open Settings', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What is deleted' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What stays' })).toBeVisible();
  await expect(page.getByText('contact@arnaudmichel.fr').first()).toBeVisible();
});

test('a legal page opened directly leads to the app', async ({ page }) => {
  await page.goto('/privacy');
  await page.getByRole('button', { name: 'Open Fanka' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('the legal pages link to each other', async ({ page }) => {
  await page.goto('/privacy');
  await page.getByRole('radio', { name: 'Licences' }).click();
  await expect(page).toHaveURL(/\/licences$/);
  await page.getByRole('radio', { name: 'Delete account' }).click();
  await expect(page).toHaveURL(/\/delete-account$/);
});

test('the licences page credits the stroke data and the libraries', async ({ page }) => {
  await page.goto('/licences');
  await expect(page.getByRole('heading', { name: 'Open source licences', level: 1 })).toBeVisible();
  await expect(page.getByText('Make Me a Hanzi stroke data', { exact: false })).toBeVisible();
  await expect(page.locator('kt-table tr[part=row]', { hasText: 'Vue Router' })).toBeVisible();
  // Two columns fit a phone: the website opens from the row instead.
  await expect(page.locator('kt-table th[part=header-cell]', { hasText: 'Website' })).toHaveCount(0);
});
