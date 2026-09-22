import { expect, test } from '@playwright/test';

/**
 * The seed's one card whose translation contains "study" — unique across
 * the seed set (checked against core/seed/data/hsk1.json), so the query
 * narrows the table to exactly this row.
 */
test('filtering by a query and opening a row shows the panel with the card', async ({ page }) => {
  await page.goto('/browse');
  await expect(page.getByRole('heading', { name: 'Browse', level: 1 })).toBeVisible();

  await page.getByPlaceholder('Search hanzi, pinyin or translation').fill('study');

  const row = page.locator('kt-table tr[part=row]', { hasText: '學習' });
  await expect(row).toBeVisible();
  await expect(page.locator('kt-table tr[part=row]')).toHaveCount(1);

  await row.click();

  await expect(page.getByText('Card', { exact: true })).toBeVisible();
  await expect(page.locator('kt-side-panel').getByText('學習', { exact: true }).first()).toBeVisible();
});
