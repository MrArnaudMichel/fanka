import { expect, test } from '@playwright/test';

/**
 * Each test gets its own browser context and so its own IndexedDB — the
 * seed plugin re-runs fresh every time. No test depends on another, and
 * none leaves anything behind that would change another's result.
 */

// The card's own prompt (hanzi for recognition, the translation prompt for
// production) — a `.face > .hanzi`/`.face > .prompt` direct child, so it
// never includes `.answer`'s revealed content and reads the same whether
// the card is revealed or not. Comparing this across steps proves the app
// moved to a genuinely different card, not just that a counter changed.
const cardIdentity = (page: import('@playwright/test').Page) => page.locator('.face > .hanzi, .face > .prompt').first();

const position = (page: import('@playwright/test').Page) => page.locator('.progress').getByText(/^\d+ \/ \d+$/);

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

/**
 * Installs a hook on IndexedDB reads and writes before any app code runs, so
 * a test can make one specific operation fail (or come back empty) on
 * demand, the way a quota error, a blocked `versionchange`, a vanished row,
 * or IndexedDB connection loss after the Android app is backgrounded would.
 * Armed and disarmed through `window.__fankaFaults` from `page.evaluate`.
 *
 * - `failSessionReads`: how many reads of the persisted session to reject.
 *   Only `restore()` reads that key, so seeding and the Today page's counts
 *   are unaffected.
 * - `missingCards`: while true, every read of the `cards` store resolves to
 *   nothing, as if the row were gone.
 * - `failReviewPuts`: how many writes to the `reviews` store to reject.
 *   `reviews.record()`'s transaction is the only writer, so this fails a
 *   grade before anything in it is written (the `items` write inside the
 *   same transaction precedes it, but the transaction only commits once
 *   every write in it succeeds).
 * - `failItemPuts`: how many writes to the `items` store to reject. Both
 *   `reviews.record()` and `reviews.undo()` write `items` — arm this only
 *   once the state under test (e.g. a card already graded) is in place, so
 *   it fails the operation actually being tested rather than an earlier one.
 */
async function installReadFaults(
  page: import('@playwright/test').Page,
  initial: { failSessionReads?: number; failReviewPuts?: number; failItemPuts?: number },
) {
  await page.addInitScript(
    (init) => {
      const faults = { ...init, missingCards: false };
      (window as unknown as { __fankaFaults: typeof faults }).__fankaFaults = faults;
      const get = IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get = function (this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
        if (this.name === 'settings' && key === 'session' && faults.failSessionReads > 0) {
          faults.failSessionReads -= 1;
          throw new DOMException('Injected read failure', 'UnknownError');
        }
        if (this.name === 'cards' && faults.missingCards) return get.call(this, '￿-no-such-card');
        return get.call(this, key);
      };
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
        if (this.name === 'reviews' && faults.failReviewPuts > 0) {
          faults.failReviewPuts -= 1;
          throw new DOMException('Injected write failure', 'UnknownError');
        }
        if (this.name === 'items' && faults.failItemPuts > 0) {
          faults.failItemPuts -= 1;
          throw new DOMException('Injected write failure', 'UnknownError');
        }
        return put.call(this, value, key);
      };
    },
    {
      failSessionReads: initial.failSessionReads ?? 0,
      failReviewPuts: initial.failReviewPuts ?? 0,
      failItemPuts: initial.failItemPuts ?? 0,
    },
  );
}

test('a failed load offers Retry, and the keyboard works once it succeeds', async ({ page }) => {
  await installReadFaults(page, { failSessionReads: 1 });
  await page.goto('/review');

  // Not a permanent skeleton: the failure is shown, with a way out.
  await expect(page.getByText("Couldn't load this session")).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();

  const face = cardIdentity(page);
  await expect(face).toBeVisible();
  await expect(position(page)).toHaveText(/^1 \/ \d+$/);

  // Retry's success unmounts the Retry button that had focus; the Show
  // answer button claims it, the same way it does after a grade.
  const showAnswer = page.getByRole('button', { name: 'Show answer', exact: true });
  await expect(showAnswer).toBeFocused();

  // The shortcuts were registered even though the first load failed.
  await page.keyboard.press('Space');
  await expect(page.locator('.answer .meaning')).toHaveText(/\S+/);
});

test('a failed grade shows an error toast and keeps the card on screen', async ({ page }) => {
  await installReadFaults(page, { failReviewPuts: 1 });
  await page.goto('/review');

  const face = cardIdentity(page);
  const pos = position(page);
  await expect(face).toBeVisible();
  await expect(pos).toHaveText(/^1 \/ \d+$/);
  const firstCard = (await face.innerText()).trim();

  await page.keyboard.press('Space');
  const answer = page.locator('.answer .meaning');
  await expect(answer).toHaveText(/\S+/);
  await page.keyboard.press('3');

  // The write to the `reviews` store rejected inside gradeCore's one Dexie
  // transaction, so nothing was written — the card, position and revealed
  // answer must all be exactly as before the failed grade.
  await expect(page.getByText("Couldn't save that answer")).toBeVisible();
  await expect(pos).toHaveText(/^1 \/ \d+$/);
  expect((await face.innerText()).trim()).toBe(firstCard);
  await expect(answer).toHaveText(/\S+/);

  // The queue was not corrupted by the failed write: grading now succeeds.
  await page.keyboard.press('3');
  await expect(pos).toHaveText(/^2 \/ \d+$/);
});

test('a failed undo shows an error toast and keeps the card on screen', async ({ page }) => {
  await installReadFaults(page, {});
  await page.goto('/review');

  const face = cardIdentity(page);
  const pos = position(page);
  await expect(face).toBeVisible();
  const firstCard = (await face.innerText()).trim();

  await page.keyboard.press('Space');
  await page.keyboard.press('3');
  await expect(pos).toHaveText(/^2 \/ \d+$/);
  const secondCard = (await face.innerText()).trim();
  expect(secondCard).not.toBe(firstCard);

  // Armed only now, after the grade this undo targets has already
  // succeeded — so it fails the undo under test, not an earlier write.
  await page.evaluate(() => {
    (window as unknown as { __fankaFaults: { failItemPuts: number } }).__fankaFaults.failItemPuts = 1;
  });
  await page.keyboard.press('u');

  // The write to the `items` store rejected inside undoCore's one Dexie
  // transaction, before the in-memory log/index/queue were touched — still
  // the second card, at the same position.
  await expect(page.getByText("Couldn't undo that grade")).toBeVisible();
  await expect(pos).toHaveText(/^2 \/ \d+$/);
  expect((await face.innerText()).trim()).toBe(secondCard);

  // The queue was not corrupted by the failed write: undo now succeeds.
  await page.keyboard.press('u');
  await expect(pos).toHaveText(/^1 \/ \d+$/);
  expect((await face.innerText()).trim()).toBe(firstCard);
});

test('a card that cannot be read offers Retry instead of a skeleton', async ({ page }) => {
  await installReadFaults(page, {});
  await page.goto('/review');

  const face = cardIdentity(page);
  const pos = position(page);
  await expect(face).toBeVisible();
  await expect(pos).toHaveText(/^1 \/ \d+$/);
  const firstCard = (await face.innerText()).trim();

  // The next card's row reads back as missing when the grade moves to it.
  await page.evaluate(() => {
    (window as unknown as { __fankaFaults: { missingCards: boolean } }).__fankaFaults.missingCards = true;
  });
  await page.keyboard.press('Space');
  await page.keyboard.press('3');
  await expect(page.getByText("Couldn't load this session")).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __fankaFaults: { missingCards: boolean } }).__fankaFaults.missingCards = false;
  });
  await page.getByRole('button', { name: 'Retry' }).click();

  // Resumed where the grade left it, on a real card.
  await expect(face).toBeVisible();
  await expect(pos).toHaveText(/^2 \/ \d+$/);
  expect((await face.innerText()).trim()).not.toBe(firstCard);
});

test('a learner can finish a session and return to Today', async ({ page }) => {
  await page.goto('/');
  const startButton = page.getByRole('button', { name: 'Start session', exact: true });
  await expect(startButton).toBeEnabled();

  // A two-card day keeps the loop short: the queue is built from settings
  // when the session starts, so writing them before clicking is enough.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('fanka');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('settings', 'readwrite');
          tx.objectStore('settings').put({ key: 'settings', value: { newPerDay: 2 } });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  // Reloaded so Today recounts under the new setting. Two cards at eight
  // seconds each round to zero minutes; the estimate never says less than one.
  await page.reload();
  await expect(page.getByText('2 cards due · about 1 min')).toBeVisible();
  await startButton.click();
  await expect(page).toHaveURL(/\/review$/);

  const pos = position(page);
  const answer = page.locator('.answer .meaning');
  await expect(pos).toHaveText('1 / 2');
  for (const step of [1, 2]) {
    await expect(pos).toHaveText(`${step} / 2`);
    await page.keyboard.press('Space');
    await expect(answer).toHaveText(/\S+/);
    // Easy, so neither card comes due again today.
    await page.keyboard.press('4');
  }

  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await expect(page.getByText('2 cards graded.')).toBeVisible();

  await page.getByRole('button', { name: 'Back to today' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  await expect(page.getByText('Nothing due right now')).toBeVisible();
  // With nothing left, the sidebar's session button is disabled and says why.
  await expect(page.getByRole('button', { name: "Today's session — nothing due right now" })).toBeDisabled();
});
