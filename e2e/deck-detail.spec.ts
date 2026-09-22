import { expect, test } from '@playwright/test';

/**
 * Ruling 6 (task-13-report.md): the active tab lives in `?tab=cards|settings`,
 * so a reload on Settings must land back on Settings rather than falling back
 * to Cards. Ruling 4: renaming through the Settings tab updates what the tab
 * itself shows, not just the page header above it.
 */
test('renaming a deck from its Settings tab survives a reload', async ({ page }) => {
  await page.goto('/decks');
  await expect(page.getByRole('heading', { name: 'Decks', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Deck actions' }).first().click();
  await page.getByRole('menuitem', { name: 'Browse cards' }).click();
  await page.waitForURL(/\/decks\/[^/?]+$/);

  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.waitForURL(/tab=settings/);

  const nameField = page.locator('#settings-panel').getByRole('textbox', { name: 'Name' });
  await expect(nameField).toBeVisible();
  const originalName = await nameField.inputValue();
  const newName = `${originalName} renamed`;

  await nameField.fill(newName);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: newName, level: 1 })).toBeVisible();

  await page.reload();

  await expect(page.locator('#settings-panel').getByRole('textbox', { name: 'Name' })).toBeVisible();
  await expect(page.locator('#settings-panel').getByRole('textbox', { name: 'Name' })).toHaveValue(newName);

  // Leave the deck as found, so this test does not depend on run order.
  await page.locator('#settings-panel').getByRole('textbox', { name: 'Name' }).fill(originalName);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: originalName, level: 1 })).toBeVisible();
});
