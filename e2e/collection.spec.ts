import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';

/**
 * The phase's three end-to-end scenarios, plus one carried regression test
 * for the Today page's Retry path (task-3's controller ruling — verified by
 * hand when it shipped, never given its own test). Each test gets its own
 * browser context and so its own IndexedDB — the seed plugin re-runs fresh
 * every time (see review.spec.ts's own comment) — so nothing here depends on
 * another test, or on run order.
 */

const smallCsvPath = fileURLToPath(new URL('./fixtures/small.csv', import.meta.url));

// ---------------------------------------------------------------------------
// Scenario 1 — import
// ---------------------------------------------------------------------------

/**
 * `e2e/fixtures/small.csv` has three data rows: two valid traditional cards
 * (蘋果, 學校) and one row (电视) written in simplified characters, which
 * `validateCard` must reject — see core/import/validate.ts's `simplifiedIssue`.
 * This overlaps import.spec.ts's own scenario (a fresh deck, the file zone,
 * the three-step wizard) but goes further: it checks the verification
 * counts split correctly between the valid and rejected rows, and it finds
 * the imported cards afterwards through Browse rather than only on the deck
 * detail page that import.spec.ts already covers.
 */
test('importing small.csv through the file zone shows the right counts and lands the valid cards in Browse', async ({ page }) => {
  const deckName = `Collection import ${Date.now()}`;

  await page.goto('/decks');
  await page.getByRole('button', { name: 'New deck' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill(deckName);
  await page.getByRole('button', { name: 'Create deck' }).click();
  await expect(page.getByRole('main').getByText(deckName)).toBeVisible();

  await page.goto('/import');
  await expect(page.getByRole('heading', { name: 'Import', level: 1 })).toBeVisible();

  await page.getByRole('combobox', { name: 'Destination deck' }).click();
  await page.getByRole('option', { name: deckName }).click();

  await page.locator('kt-drag-drop input[type="file"]').setInputFiles(smallCsvPath);

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Tell Fanka what each column holds.')).toBeVisible();

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Check the rows before they are added.')).toBeVisible();

  // Two importable rows, one rejected for its simplified characters — see
  // core/chinese/data/simplified-only.json (電 and 視's simplified forms).
  // `label` is a plain (unreflected) Lit property, not a DOM attribute — see
  // kt-stat.ts — so each stat is found by its shadow-rendered label text
  // instead of a `[label=...]` attribute selector.
  await expect(page.locator('kt-stat', { hasText: 'Valid' }).locator('[part=value]')).toHaveText('2');
  await expect(page.locator('kt-stat', { hasText: 'Warnings' }).locator('[part=value]')).toHaveText('0');
  await expect(page.locator('kt-stat', { hasText: 'Errors' }).locator('[part=value]')).toHaveText('1');

  await page.getByRole('button', { name: 'Import' }).click();
  await page.waitForURL(/\/decks\/[^/?]+$/);

  await page.goto('/browse');
  await expect(page.getByRole('heading', { name: 'Browse', level: 1 })).toBeVisible();

  const search = page.getByPlaceholder('Search hanzi, pinyin or translation');

  await search.fill('蘋果');
  await expect(page.locator('kt-table tr[part=row]', { hasText: '蘋果' })).toBeVisible();

  await search.fill('學校');
  await expect(page.locator('kt-table tr[part=row]', { hasText: '學校' })).toBeVisible();

  // The simplified row was never imported at all.
  await search.fill('电视');
  await expect(page.getByText('No cards match')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 2 — edit
// ---------------------------------------------------------------------------

/**
 * The seed's one card whose translation contains "study" — the same unique
 * row browse.spec.ts anchors on. Editing it is safe: every test gets its own
 * IndexedDB, so this never leaks into another spec file.
 */
test('editing a card in Browse updates its translation in the table and the side panel', async ({ page }) => {
  await page.goto('/browse');
  await expect(page.getByRole('heading', { name: 'Browse', level: 1 })).toBeVisible();

  const search = page.getByPlaceholder('Search hanzi, pinyin or translation');
  await search.fill('study');

  const row = page.locator('kt-table tr[part=row]', { hasText: '學習' });
  await expect(row).toBeVisible();
  await row.click();

  await expect(page.getByText('Card', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();

  await expect(page).toHaveURL(/\/cards\/[^/?]+$/);
  await expect(page.getByRole('heading', { name: 'Edit card', level: 1 })).toBeVisible();

  const newTranslation = `to study hard ${Date.now()}`;
  const translationField = page.getByRole('textbox', { name: 'Translation', exact: true });
  await expect(translationField).toBeVisible();
  await translationField.fill(newTranslation);
  await page.getByRole('button', { name: 'Save' }).click();

  // Save navigates back to wherever the edit came from — Browse here.
  await expect(page).toHaveURL(/\/browse$/);

  // A fresh page instance resets the filter, so the table shows every card
  // again until searched — proof the *table*, not just the panel that is
  // now closed, reflects the new text.
  await search.fill(newTranslation);
  const updatedRow = page.locator('kt-table tr[part=row]', { hasText: '學習' });
  await expect(updatedRow).toBeVisible();
  await expect(updatedRow.getByText(newTranslation)).toBeVisible();

  await updatedRow.click();
  await expect(page.locator('kt-side-panel').getByText(newTranslation)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 3 — delete a deck
// ---------------------------------------------------------------------------

/**
 * Writes a deck, a card and a *due* (not merely "new") item straight into
 * IndexedDB, the same directness review.spec.ts's settings write and
 * fault-injection use for deterministic setup — going through the card
 * editor here would only prove the editor works, which card-editor.spec.ts
 * already does.
 *
 * `newPerDay` is pinned to 0 first so the seed's own 20-card "new" allowance
 * (capped at 15, see core/db/settings.ts's `DEFAULT_SETTINGS`) contributes
 * nothing to Today's counts or the review queue — without that, the seed's
 * own new cards would swamp the count this test is trying to isolate, and
 * backfill straight over whatever the deleted deck's card contributed,
 * masking the very drop this scenario exists to prove.
 *
 * The target card's item is put on the deck about to be deleted; the
 * control item reuses one of the seed's own existing cards (any live one —
 * there is no test dependency on which) so a session can still start once
 * the target deck is gone, and its continued presence in that one-card
 * session is the actual proof that only the deleted deck's card vanished.
 */
async function seedDueCardsForDeletion(
  page: Page,
  target: { deckId: string; deckName: string; cardId: string; hanzi: string },
): Promise<{ controlHanzi: string }> {
  return page.evaluate((t) => {
    return new Promise<{ controlHanzi: string }>((resolve, reject) => {
      const open = indexedDB.open('fanka');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(['decks', 'cards', 'items', 'settings'], 'readwrite');
        tx.onerror = () => reject(tx.error);

        tx.objectStore('settings').put({ key: 'settings', value: { newPerDay: 0 } });

        const now = Date.now();
        const dueState = {
          state: 'review',
          due: now - 1000,
          stability: 5,
          difficulty: 5,
          elapsedDays: 1,
          scheduledDays: 1,
          reps: 1,
          lapses: 0,
          learningSteps: 0,
          lastReview: now - 86_400_000,
        };

        tx.objectStore('decks').put({
          id: t.deckId,
          name: t.deckName,
          description: '',
          colorToken: 'var(--chart-series-1)',
          tag: '',
          translationLang: 'en',
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
        tx.objectStore('cards').put({
          id: t.cardId,
          deckId: t.deckId,
          hanzi: t.hanzi,
          pinyin: [{ text: 'shān', tone: 1 }],
          zhuyin: '',
          translation: 'the card about to be deleted',
          pos: 'noun',
          example: '',
          examplePinyin: '',
          exampleTranslation: '',
          tags: [],
          note: '',
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
        tx.objectStore('items').put({
          id: `${t.cardId}:recognition`,
          cardId: t.cardId,
          dir: 'recognition',
          suspended: false,
          updatedAt: now,
          ...dueState,
        });

        const cardsReq = tx.objectStore('cards').getAll();
        cardsReq.onsuccess = () => {
          const rows = cardsReq.result as { id: string; deletedAt: number | null; hanzi: string }[];
          const control = rows.find((c) => c.deletedAt === null && c.id !== t.cardId);
          if (!control) {
            reject(new Error('no existing card to use as a control'));
            return;
          }
          tx.objectStore('items').put({
            id: `${control.id}:recognition`,
            cardId: control.id,
            dir: 'recognition',
            suspended: false,
            updatedAt: now,
            ...dueState,
          });
          tx.oncomplete = () => {
            db.close();
            resolve({ controlHanzi: control.hanzi });
          };
        };
        cardsReq.onerror = () => reject(cardsReq.error);
      };
    });
  }, target);
}

test('deleting a deck drops Today’s counts and a new session never shows one of its cards', async ({ page }) => {
  const deckId = randomUUID();
  const cardId = randomUUID();
  const deckName = `Delete test ${Date.now()}`;
  const targetHanzi = '刪除';

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  // Waiting for this also waits out seeding — the same reasoning
  // review.spec.ts's own first test relies on.
  await expect(page.getByRole('button', { name: 'Start review', exact: true })).toBeEnabled();

  const { controlHanzi } = await seedDueCardsForDeletion(page, { deckId, deckName, cardId, hanzi: targetHanzi });

  await page.reload();
  await expect(page.getByText('2 cards today · about 1 min')).toBeVisible();

  await page.goto('/decks');
  await expect(page.getByRole('heading', { name: 'Decks', level: 1 })).toBeVisible();
  const deckCard = page.locator('kt-card', { hasText: deckName });
  await expect(deckCard).toBeVisible();

  await deckCard.getByRole('button', { name: 'Deck actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(deckCard).toHaveCount(0);

  await page.goto('/');
  await expect(page.getByText('1 card today · about 1 min')).toBeVisible();

  const startButton = page.getByRole('button', { name: 'Start review', exact: true });
  await expect(startButton).toBeEnabled();
  await startButton.click();
  await expect(page).toHaveURL(/\/review$/);

  const face = page.locator('.face > .hanzi, .face > .prompt').first();
  await expect(face).toBeVisible();
  await expect(page.locator('.progress').getByText(/^\d+ \/ \d+$/)).toHaveText('1 / 1');

  const shown = (await face.innerText()).trim();
  expect(shown).toBe(controlHanzi);
  expect(shown).not.toBe(targetHanzi);
});

// ---------------------------------------------------------------------------
// Carried item — Today's Retry path (controller ruling from Task 3)
// ---------------------------------------------------------------------------

/**
 * Fails Today's own settings read (the `settings` store's `settings` row —
 * distinct from the `session` key review.spec.ts's own fault targets) for as
 * long as `failing` stays true, the same class of injected fault as
 * review.spec.ts's `installReadFaults`. A boolean gate rather than a
 * use-count budget: `useDueCounts()` fires its own background refresh on
 * every call (see useDueCounts.ts), so more than one read of this row can
 * happen before Today's own `loadToday()` gets to it — a budget sized for
 * one caller could be spent by another. The gate is flipped off from the
 * test once the failure is on screen, before Retry is clicked.
 */
async function installTodayReadFault(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = { failing: true };
    (window as unknown as { __fankaTodayFault: typeof state }).__fankaTodayFault = state;
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
      if (this.name === 'settings' && key === 'settings' && state.failing) {
        throw new DOMException('Injected read failure', 'UnknownError');
      }
      return get.call(this, key);
    };
  });
}

test('a failed Today load offers Retry, and focus lands on Start review once it recovers', async ({ page }) => {
  await installTodayReadFault(page);
  await page.goto('/');

  await expect(page.getByText("Couldn't load today's data")).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __fankaTodayFault: { failing: boolean } }).__fankaTodayFault.failing = false;
  });
  await page.getByRole('button', { name: 'Retry' }).click();

  const startButton = page.getByRole('button', { name: 'Start review', exact: true });
  await expect(startButton).toBeEnabled();
  await expect(startButton).toBeFocused();
});
