import { expect, test } from '@playwright/test';

test('a fresh install lands on the onboarding', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading', { name: 'Learn Chinese, one card at a time.' })).toBeVisible();
});

test('picking Mainland Chinese and finishing leads to Today in the Mainland bundle', async ({ page }) => {
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'What do you want to learn?' })).toBeVisible();
  // Nothing studied yet, so nothing is preselected and Continue waits for a choice.
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await page.getByRole('button', { name: /Mainland Chinese/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'How many lessons a day?' })).toBeVisible();
  await page.getByRole('radio', { name: '2' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Sync across devices' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send link' })).toBeVisible();
  await page.getByRole('button', { name: 'Not now' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('html')).toHaveAttribute('data-bundle', 'mainland');
  // Onboarded: /welcome is not offered again.
  await page.goto('/welcome');
  await expect(page).toHaveURL(/\/$/);
});

test('Back returns to the previous step', async ({ page }) => {
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Learn Chinese, one card at a time.' })).toBeVisible();
});

test('the privacy policy opens without the onboarding', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { name: 'Privacy policy', level: 1 })).toBeVisible();
});
