import { expect, test } from '@playwright/test';

test('statistics open on Overview, empty before any answer, then with this week and the words to work on', async ({ page }) => {
  await page.goto('/stats');
  await expect(page.getByRole('tab', { name: 'Overview', selected: true })).toBeVisible();
  await expect(page.getByText('Nothing to show yet')).toBeVisible();

  // One missed answer gives the week a figure and the weak words a row.
  await page.goto('/review');
  await expect(page.getByRole('button', { name: 'Show answer', exact: true })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Again' })).toBeFocused();
  await page.keyboard.press('1');
  await expect(page.getByRole('button', { name: 'Show answer', exact: true })).toBeVisible();

  await page.goto('/stats');
  await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
  await expect(page.getByText('Words known', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Work on these', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Practise these' })).toBeVisible();

  await page.getByRole('button', { name: 'Practise these' }).click();
  await expect(page).toHaveURL(/\/review\?endless=1&cards=/);
  await expect(page.getByText(/Practising 1 weak word/)).toBeVisible();
  await page.getByRole('button', { name: 'Practise everything' }).click();
  await expect(page).toHaveURL(/\/review\?endless=1$/);
});

test('memory compares decks, and a deck row filters the page', async ({ page }) => {
  await page.goto('/stats');
  await page.getByRole('tab', { name: 'Memory' }).click();
  const row = page.locator('kt-table tr[part=row]', { hasText: 'HSK 1' });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.locator('kt-select')).toHaveJSProperty('value', 'hsk1-traditional');
});
