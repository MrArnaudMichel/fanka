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
});
