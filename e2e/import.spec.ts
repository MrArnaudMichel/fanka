import { expect, test } from './fixtures/onboarded';

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
  await expect(page.getByText('Tell Fanka what each column holds.')).toBeVisible();

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Check the rows before they are added.')).toBeVisible();
  await expect(page.getByText('Valid', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Import' }).click();

  await page.waitForURL(/\/decks\/[^/?]+$/);
  await expect(page.getByRole('heading', { name: deckName, level: 1 })).toBeVisible();
  await expect(page.getByText('朋友', { exact: true })).toBeVisible();
  await expect(page.getByText('老師', { exact: true })).toBeVisible();
});

/**
 * Final review C1: step 2's per-column `kt-select` must actually feed the
 * mapping that step 3 verifies — not just show the learner's choice while
 * the guessed mapping is what gets checked and imported. Mapping the
 * translation column to Ignore leaves every row without a translation, so
 * every row turns into an error.
 */
test('changing a column mapping in step 2 changes the step-3 counts', async ({ page }) => {
  const deckName = `Mapping test ${Date.now()}`;

  await page.goto('/decks');
  await page.getByRole('button', { name: 'New deck' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill(deckName);
  await page.getByRole('button', { name: 'Create deck' }).click();
  await expect(page.getByRole('main').getByText(deckName)).toBeVisible();

  await page.goto('/import');
  await page.getByRole('combobox', { name: 'Destination deck' }).click();
  await page.getByRole('option', { name: deckName }).click();

  const csv = ['hanzi,pinyin,translation', '朋友,peng2 you5,friend', '老師,lao3 shi1,teacher'].join('\n');
  await page
    .locator('kt-drag-drop input[type="file"]')
    .setInputFiles({ name: 'cards.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') });

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Tell Fanka what each column holds.')).toBeVisible();

  const translationTarget = page.getByRole('combobox', { name: 'Maps to, for translation' });
  await translationTarget.click();
  await page.getByRole('option', { name: 'Ignore' }).click();

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Check the rows before they are added.')).toBeVisible();

  await expect(page.locator('kt-stat', { hasText: 'Valid' }).locator('[part=value]')).toHaveText('0');
  await expect(page.locator('kt-stat', { hasText: 'Errors' }).locator('[part=value]')).toHaveText('2');
  await expect(page.getByRole('button', { name: 'Import' })).toBeDisabled();
});

test('a duplicate can update the existing card and a broken row can be fixed', async ({ page }) => {
  const deckName = `Duplicate test ${Date.now()}`;

  await page.goto('/decks');
  await page.getByRole('button', { name: 'New deck' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill(deckName);
  await page.getByRole('button', { name: 'Create deck' }).click();
  await expect(page.getByRole('main').getByText(deckName)).toBeVisible();

  const importCsv = async (csv: string) => {
    await page.goto('/import');
    await page.getByRole('combobox', { name: 'Destination deck' }).click();
    await page.getByRole('option', { name: deckName }).click();
    await page
      .locator('kt-drag-drop input[type="file"]')
      .setInputFiles({ name: 'cards.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') });
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Check the rows before they are added.')).toBeVisible();
  };

  await importCsv(['hanzi,pinyin,translation', '朋友,peng2 you5,friend'].join('\n'));
  await page.getByRole('button', { name: 'Import' }).click();
  await page.waitForURL(/\/decks\/[^/?]+$/);

  await importCsv(['hanzi,pinyin,translation', '朋友,peng2 you5,pal', '老師,lao3 shi1,'].join('\n'));
  await expect(page.locator('kt-stat', { hasText: 'Already in deck' }).locator('[part=value]')).toHaveText('1');
  await expect(page.locator('kt-stat', { hasText: 'Errors' }).locator('[part=value]')).toHaveText('1');

  await page.getByRole('row', { name: /老師/ }).click();
  await page.getByRole('textbox', { name: 'Translation', exact: true }).fill('teacher');
  await page.getByRole('button', { name: 'Check row' }).click();
  await expect(page.locator('kt-stat', { hasText: 'Errors' }).locator('[part=value]')).toHaveText('0');

  await page.getByRole('radio', { name: 'Update' }).click();
  await page.getByRole('button', { name: 'Import' }).click();
  await page.waitForURL(/\/decks\/[^/?]+$/);
  await expect(page.getByText('pal', { exact: true })).toBeVisible();
  await expect(page.getByText('老師', { exact: true })).toBeVisible();
});

test('leaving an import with rows loaded asks first', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/import');
  const csv = ['hanzi,pinyin,translation', '朋友,peng2 you5,friend'].join('\n');
  await page
    .locator('kt-drag-drop input[type="file"]')
    .setInputFiles({ name: 'cards.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') });
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Tell Fanka what each column holds.')).toBeVisible();

  await page.getByRole('link', { name: 'Decks' }).click();
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog')).filter({ hasText: "The rows you loaded haven't been imported yet." });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Stay' }).click();
  await expect(page).toHaveURL(/\/import/);
});
