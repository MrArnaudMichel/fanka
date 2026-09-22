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
