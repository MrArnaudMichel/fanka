import { expect, test } from '@playwright/test';

/**
 * The spec's own end-to-end scenario: import a small CSV and find its cards
 * afterwards. A fresh deck (created here, not the seed's) keeps this test
 * independent of whatever the seed happens to contain and free of any
 * duplicate-hanzi collision with it.
 */
test('importing a small CSV lands on the deck and shows its cards', async ({ page }) => {
  const deckName = `Import test ${Date.now()}`;

  await page.goto('/decks');
  await page.getByRole('button', { name: 'New deck' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill(deckName);
  await page.getByRole('button', { name: 'Create deck' }).click();
  await expect(page.getByRole('main').getByText(deckName)).toBeVisible();

  await page.goto('/import');
  await expect(page.getByRole('heading', { name: 'Import', level: 1 })).toBeVisible();

  await page.getByRole('combobox', { name: 'Destination deck' }).click();
  await page.getByRole('option', { name: deckName }).click();

  const csv = ['hanzi,pinyin,translation', '朋友,peng2 you5,friend', '老師,lao3 shi1,teacher'].join('\n');
  await page
    .locator('kt-drag-drop input[type="file"]')
    .setInputFiles({ name: 'cards.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') });

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Step 2 of 3 — Field mapping')).toBeVisible();

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Step 3 of 3 — Review')).toBeVisible();
  await expect(page.getByText('Valid', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Import' }).click();

  await page.waitForURL(/\/decks\/[^/?]+$/);
  await expect(page.getByRole('heading', { name: deckName, level: 1 })).toBeVisible();
  await expect(page.getByText('朋友', { exact: true })).toBeVisible();
  await expect(page.getByText('老師', { exact: true })).toBeVisible();
});
