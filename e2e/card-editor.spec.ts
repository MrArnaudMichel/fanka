import { expect, test } from '@playwright/test';

/**
 * `kt-input-menu` computes the Enter key's active option synchronously
 * against whatever `options` it was last given — but `TagInput`'s "Add …"
 * option for a brand-new tag only lands a tick later, through the
 * `kt-filter` round trip. Typing a new tag and pressing Enter *immediately*
 * (no arrow-key navigation first) therefore found no active option and
 * committed nothing — see task-11-report.md's Fix round 1.
 */
test('typing a tag and pressing Enter adds it', async ({ page }) => {
  await page.goto('/cards/new');
  await expect(page.getByRole('heading', { name: 'New card', level: 1 })).toBeVisible();

  const tagField = page.getByRole('combobox', { name: 'Tags' });
  await tagField.fill('greeting');
  await tagField.press('Enter');

  await expect(page.getByText('greeting', { exact: true })).toBeVisible();
});

/**
 * kt-form re-runs its `syncDisabled()` — `disabled = false` on every nested
 * control — on every default-slot `slotchange`, not only on first render.
 * The pinyin preview is a conditional child of the form, so typing pinyin
 * used to re-enable direction toggles that must stay locked: the sole
 * remaining direction on a new card, and both toggles of a fully suspended
 * card. The toggles now live outside kt-form entirely.
 */
test('typing pinyin keeps the sole remaining direction locked on a new card', async ({ page }) => {
  await page.goto('/cards/new');
  await expect(page.getByRole('heading', { name: 'New card', level: 1 })).toBeVisible();

  const recognition = page.getByRole('switch', { name: /^Recognition/ });
  await page.getByRole('switch', { name: /^Production/ }).click();
  await expect(recognition).toBeDisabled();

  await page.getByRole('textbox', { name: 'Pinyin', exact: true }).fill('ni3 hao3');
  await expect(page.locator('.preview')).toBeVisible();
  await expect(recognition).toBeDisabled();
});

test('typing pinyin keeps a suspended card’s direction toggles read-only', async ({ page }) => {
  await page.goto('/browse');
  await page.getByPlaceholder('Search hanzi, pinyin or translation').fill('study');
  await page.locator('kt-table tr[part=row]', { hasText: '學習' }).click();
  const panel = page.locator('kt-side-panel');
  await panel.getByRole('button', { name: 'Suspend' }).click();
  await expect(panel.getByRole('button', { name: 'Unsuspend' })).toBeVisible();
  await panel.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { name: 'Edit card', level: 1 })).toBeVisible();

  const recognition = page.getByRole('switch', { name: 'Recognition' });
  const production = page.getByRole('switch', { name: 'Production' });
  await expect(recognition).toBeDisabled();
  await expect(production).toBeDisabled();

  // Clearing and retyping drops the preview and brings it back — two slot changes.
  const pinyin = page.getByRole('textbox', { name: 'Pinyin', exact: true });
  await pinyin.fill('');
  await pinyin.fill('xue2 xi2');
  await expect(page.locator('.preview')).toBeVisible();
  await expect(recognition).toBeDisabled();
  await expect(production).toBeDisabled();
});
