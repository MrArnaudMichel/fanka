import { expect, test } from './fixtures/onboarded';
import { seedStarterDeck } from './fixtures/starter-deck';

test.beforeEach(async ({ page }) => {
  await seedStarterDeck(page);
});

/**
 * `.shell` in `app/layouts/default.vue` used to be a flex *row* at every
 * width, including below its own 900px sidebar/mobile-header breakpoint —
 * so `kt-header` and `main` sat side by side there instead of stacked,
 * pushing the page wider than the viewport. Both `/` and `/decks` measured
 * `scrollWidth > clientWidth` at 360px before the fix (see task-10-report.md,
 * "Fix round 1" — this test was run against the pre-fix CSS and failed on
 * both routes before `.shell` gained `flex-direction: column` below 900px).
 */
for (const [path, heading] of [
  ['/', 'Today'],
  ['/decks', 'Decks'],
  ['/import', 'Import'],
] as const) {
  test(`${path} has no horizontal overflow at 360px`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

/**
 * Final review I6: choosing a link in the mobile menu closes the menu,
 * which hides the link that had focus. Focus must land on `main`, not fall
 * to `<body>`, for every Collection destination.
 */
test('navigating through the mobile menu leaves focus on main, not body', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();

  for (const [label, heading] of [
    ['Decks', 'Decks'],
    ['Cards', 'Browse'],
    ['Add', 'New card'],
    ['Import', 'Import'],
  ] as const) {
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.locator('kt-header').getByRole('link', { name: label, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await expect(page.getByRole('main')).toBeFocused();
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('MAIN');
  }
});

/**
 * The phone pass: nothing scrolls sideways, the menu button sits flush
 * right (kt-header's bar grid used to park it mid-bar, with the session
 * button over the wordmark), and a revealed Review card never pushes the
 * grade buttons below the fold.
 */
test.describe('at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const [path, heading] of [
    ['/', 'Today'],
    ['/review', 'Review'],
    ['/writing', 'Writing'],
    ['/browse', 'Browse'],
    ['/decks', 'Decks'],
  ] as const) {
    test(`${path} fits the width and keeps the menu button flush right`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);

      const menu = (await page.getByRole('button', { name: 'Open menu' }).boundingBox())!;
      expect(390 - (menu.x + menu.width)).toBeLessThanOrEqual(24);
    });
  }

  test('every grade button is on screen once the answer is revealed', async ({ page }) => {
    await page.goto('/review');
    await page.getByRole('button', { name: 'Show answer', exact: true }).click();
    for (const name of ['Again', 'Hard', 'Good', 'Easy']) {
      await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeInViewport({ ratio: 1 });
    }
  });

  test('the action bar never covers the drawing pad', async ({ page }) => {
    await page.goto('/writing');
    const pad = (await page.locator('svg.pad').boundingBox())!;
    const actions = (await page.locator('.fk-session-actions').boundingBox())!;
    expect(pad.y + pad.height).toBeLessThanOrEqual(actions.y);
    expect(actions.y + actions.height).toBeLessThanOrEqual(844);
  });
});
