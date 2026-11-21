import { expect, test as base } from '@playwright/test';

/**
 * Every spec but the onboarding's own starts as a learner who has onboarded
 * as Taiwan, the way a real one does: through /welcome, picking Taiwanese
 * Mandarin and skipping the rest. Specs import `test` and `expect` from here
 * instead of `@playwright/test`.
 */
export const test = base.extend<{ onboarded: void }>({
  onboarded: [
    async ({ page }, use) => {
      await page.goto('/welcome');
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('button', { name: /Taiwanese Mandarin/ }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
      // Where do you start? The default is "I'm new".
      await page.getByRole('radio', { name: "I'm new" }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
      // The web build has no reminder step; the last one is the account's.
      await page.getByRole('button', { name: 'Not now' }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.locator('html')).toHaveAttribute('data-bundle', 'taiwan');
      await use();
    },
    { auto: true },
  ],
});

export { expect };
