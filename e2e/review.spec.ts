import { expect, test } from '@playwright/test';

/**
 * Each test gets its own browser context and so its own IndexedDB — the
 * seed plugin re-runs fresh every time. Neither test depends on the other,
 * and neither leaves anything behind that would change the other's result.
 */

// The card's own prompt (hanzi for recognition, the translation prompt for
// production) — a `.face > .hanzi`/`.face > .prompt` direct child, so it
// never includes `.answer`'s revealed content and reads the same whether
// the card is revealed or not. Comparing this across steps proves the app
// moved to a genuinely different card, not just that a counter changed.
const cardIdentity = (page: import('@playwright/test').Page) => page.locator('.face > .hanzi, .face > .prompt').first();

const position = (page: import('@playwright/test').Page) => page.locator('.bar').getByText(/^\d+ \/ \d+$/);

test('a learner can start, reveal, grade and resume a session after a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();

  // Waiting for this to become enabled also waits out seeding and the due
  // count query: while nothing is due it stays disabled with a different
  // accessible name, so an exact match only resolves once it is ready.
  const startButton = page.getByRole('button', { name: 'Start session', exact: true });
  await expect(startButton).toBeEnabled();
  await startButton.click();
  await expect(page).toHaveURL(/\/review$/);

  const face = cardIdentity(page);
  const pos = position(page);
  await expect(face).toBeVisible();
  await expect(pos).toHaveText(/^1 \/ \d+$/);
  const firstCard = (await face.innerText()).trim();
  expect(firstCard.length).toBeGreaterThan(0);

  const showAnswer = page.getByRole('button', { name: 'Show answer', exact: true });
  await showAnswer.click();

  // Revealing must show real content, not just flip a flag.
  const answer = page.locator('.answer .meaning');
  await expect(answer).toHaveText(/\S+/);
  // Focus lands on the first grade button so the 1-4 shortcuts are usable
  // without a pointer.
  const again = page.getByRole('button', { name: 'Again' });
  await expect(again).toBeFocused();

  const good = page.getByRole('button', { name: 'Good' });
  await good.click();

  await expect(pos).toHaveText(/^2 \/ \d+$/);
  const secondCard = (await face.innerText()).trim();
  expect(secondCard).not.toBe(firstCard);
  // A new, unrevealed card landed — the Show-answer button takes focus.
  await expect(showAnswer).toBeVisible();
  await expect(showAnswer).toBeFocused();
  const secondPosition = await pos.textContent();

  // The session survives a reload — the point of persisting it. The
  // learner must land on the same card at the same position, not restart.
  await page.reload();
  await expect(face).toBeVisible();
  await expect(pos).toHaveText(secondPosition!);
  expect((await face.innerText()).trim()).toBe(secondCard);
  // A reload's first paint must not steal focus from wherever the browser
  // put it.
  await expect(showAnswer).toBeVisible();
  await expect(showAnswer).not.toBeFocused();
});

test('the keyboard drives the review loop: space reveals, a digit grades, u undoes', async ({ page }) => {
  await page.goto('/review');

  const face = cardIdentity(page);
  const pos = position(page);
  await expect(face).toBeVisible();
  await expect(pos).toHaveText(/^1 \/ \d+$/);
  const firstCard = (await face.innerText()).trim();

  await page.keyboard.press('Space');
  const answer = page.locator('.answer .meaning');
  await expect(answer).toHaveText(/\S+/);
  const again = page.getByRole('button', { name: 'Again' });
  await expect(again).toBeFocused();

  // '3' grades Good.
  await page.keyboard.press('3');
  await expect(pos).toHaveText(/^2 \/ \d+$/);
  const secondCard = (await face.innerText()).trim();
  expect(secondCard).not.toBe(firstCard);
  const showAnswer = page.getByRole('button', { name: 'Show answer', exact: true });
  await expect(showAnswer).toBeFocused();

  // Undo steps back to the same card and shows its answer again.
  await page.keyboard.press('u');
  await expect(pos).toHaveText(/^1 \/ \d+$/);
  expect((await face.innerText()).trim()).toBe(firstCard);
  await expect(answer).toHaveText(/\S+/);
  await expect(page.getByRole('button', { name: 'Good' })).toBeVisible();
});
