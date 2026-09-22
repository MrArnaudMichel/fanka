import { expect, test } from '@playwright/test';
import { installReadFaults } from './fixtures/read-faults';

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

/**
 * Final review I3: a failed read of the cards must show "Couldn't load"
 * with Retry — not "No cards yet" — and Retry must recover once the store
 * reads again. The fault is armed only after the Today page has finished
 * seeding, and Browse is reached by a client-side navigation, so the
 * window (and its fault switch) survives into it.
 */
test('a failed card load on Browse offers Retry, and Retry recovers', async ({ page }) => {
  await installReadFaults(page, {});
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start session', exact: true })).toBeEnabled();

  await page.evaluate(() => {
    (window as unknown as { __fankaFaults: { failCardScans: boolean } }).__fankaFaults.failCardScans = true;
  });
  await page.getByRole('link', { name: 'Cards' }).first().click();
  await expect(page).toHaveURL(/\/browse$/);

  await expect(page.getByText("Couldn't load your cards")).toBeVisible();
  await expect(page.getByText('No cards yet')).toHaveCount(0);

  await page.evaluate(() => {
    (window as unknown as { __fankaFaults: { failCardScans: boolean } }).__fankaFaults.failCardScans = false;
  });
  await page.getByRole('button', { name: 'Retry' }).click();

  await expect(page.locator('kt-table tr[part=row]').first()).toBeVisible();
  await expect(page.getByText("Couldn't load your cards")).toHaveCount(0);
});
