import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/onboarded';

/**
 * Writing practice end to end: the learner draws on the pad with a real
 * pointer, the app checks the strokes, and the verdict sets the grade.
 *
 * The drawing replays the Make Me a Hanzi medians of whatever card the
 * session opened on — read from the session record and the card row in
 * IndexedDB, then from the bundled stroke files — so the test does not
 * depend on the seed's order.
 */

type Median = [number, number][];

/** The hanzi of the card the Writing session is showing. */
async function currentHanzi(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('fanka');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['settings', 'items', 'cards'], 'readonly');
          const session = tx.objectStore('settings').get('session:writing');
          session.onsuccess = () => {
            const { queueIds, index } = session.result.value as { queueIds: string[]; index: number };
            const item = tx.objectStore('items').get(queueIds[index]!);
            item.onsuccess = () => {
              const card = tx.objectStore('cards').get(item.result.cardId);
              card.onsuccess = () => {
                db.close();
                resolve(card.result.hanzi as string);
              };
            };
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

async function mediansFor(page: Page, character: string): Promise<Median[]> {
  const file = `${character.codePointAt(0)!.toString(16)}.json`;
  return page.evaluate(async (path) => (await (await fetch(path)).json()).medians, `/strokes/${file}`);
}

/**
 * The verdict alert's heading — `nth` 0 for the character, 1 for the stroke
 * order. `heading` is a property (Kanto data goes in as properties), not an
 * attribute.
 */
const heading = (page: Page, nth = 0) =>
  page.locator('kt-alert').nth(nth).evaluate((el) => (el as HTMLElement & { heading: string }).heading);

/**
 * Draws each median on the pad, model space (1024, y up from 900) to screen.
 * `live`: stroke-by-stroke feedback is on, so the pad is replaced as soon
 * as the character's last stroke is accepted and there is no ink to count.
 */
async function draw(page: Page, medians: Median[], reversed = false, live = false): Promise<void> {
  const ink = page.locator('svg.pad polyline');
  // Each character gets a fresh pad: wait for it to be empty, so no stroke
  // lands on the previous character's pad while it is being replaced.
  await expect(ink).toHaveCount(0);
  const box = (await page.locator('svg.pad').boundingBox())!;
  // A few medians start a hair outside the box (習's do, above it); a finger
  // cannot start a stroke off the pad, so neither does this.
  const clamp = (v: number) => Math.min(1016, Math.max(8, v));
  const toScreen = ([x, y]: [number, number]) => ({
    x: box.x + (clamp(x) / 1024) * box.width,
    y: box.y + (clamp(900 - y) / 1024) * box.height,
  });
  for (const median of medians) {
    const points = (reversed ? [...median].reverse() : median).map(toScreen);
    await page.mouse.move(points[0]!.x, points[0]!.y);
    await page.mouse.down();
    for (const p of points.slice(1)) await page.mouse.move(p.x, p.y, { steps: 4 });
    await page.mouse.up();
  }
  if (!live) await expect(ink).toHaveCount(medians.length);
}

/** A short stroke in the pad's top-left corner, far from any median. */
async function scribble(page: Page): Promise<void> {
  const box = (await page.locator('svg.pad').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.04, box.y + box.height * 0.04);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.12, box.y + box.height * 0.06, { steps: 4 });
  await page.mouse.up();
}

/** Stroke-by-stroke feedback is on by default; the whole-character Check needs it off. */
async function setStrokeFeedback(page: Page, on: boolean): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start writing', exact: true })).toBeEnabled();
  await page.evaluate(
    (value) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('fanka');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('settings', 'readwrite');
          const store = tx.objectStore('settings');
          const get = store.get('settings');
          get.onsuccess = () => store.put({ key: 'settings', value: { ...(get.result?.value ?? {}), strokeFeedback: value } });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    on,
  );
}

async function openWriting(page: Page, live = false): Promise<string> {
  await setStrokeFeedback(page, live);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start writing', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Start writing', exact: true }).click();
  await expect(page).toHaveURL(/\/writing$/);
  await expect(page.locator('svg.pad')).toBeVisible();
  return currentHanzi(page);
}

test('drawing the right strokes in order is checked as right, and Continue moves on', async ({ page }) => {
  const hanzi = await openWriting(page);
  const check = page.getByRole('button', { name: 'Check', exact: true });

  for (const character of hanzi) {
    await draw(page, await mediansFor(page, character));
    await check.click();
  }

  await expect.poll(() => heading(page)).toBe('Character: Right');
  await expect(page.locator('.answer .hanzi')).toHaveText(hanzi);
  await expect(page.getByRole('button', { name: 'Count it as right' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('.progress').getByText(/^2 \/ \d+$/)).toBeVisible();
  await expect(page.locator('svg.pad')).toBeVisible();
});

test('strokes drawn backwards keep the character right and fault the stroke order', async ({ page }) => {
  const hanzi = await openWriting(page);
  const check = page.getByRole('button', { name: 'Check', exact: true });

  for (const character of hanzi) {
    await draw(page, await mediansFor(page, character), true);
    await check.click();
  }

  await expect.poll(() => heading(page)).toBe('Character: Right');
  await expect.poll(() => heading(page, 1)).toMatch(/stroke 1 drawn backwards$/);
});

test('Undo stroke and Clear empty the pad before a check', async ({ page }) => {
  const hanzi = await openWriting(page);
  const medians = await mediansFor(page, [...hanzi][0]!);
  const check = page.getByRole('button', { name: 'Check', exact: true });
  const ink = page.locator('svg.pad polyline');

  await expect(check).toBeDisabled();
  await draw(page, medians.slice(0, 2));
  await expect(ink).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo stroke' }).click();
  await expect(ink).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(ink).toHaveCount(0);
  await expect(check).toBeDisabled();
});

test('stroke by stroke: right strokes need no Check, and the verdict follows the last one', async ({ page }) => {
  const hanzi = await openWriting(page, true);
  await expect(page.getByRole('button', { name: 'Check', exact: true })).toHaveCount(0);

  for (const character of hanzi) await draw(page, await mediansFor(page, character), false, true);

  await expect.poll(() => heading(page)).toBe('Character: Right');
  await page.keyboard.press('Enter');
  await expect(page.locator('.progress').getByText(/^2 \/ \d+$/)).toBeVisible();
});

test('stroke by stroke: a wrong stroke is taken off the pad, and three show the expected one', async ({ page }) => {
  await openWriting(page, true);
  const ink = page.locator('svg.pad polyline');

  await scribble(page);
  await expect(page.locator('svg.pad polyline.rejected')).toHaveCount(1);
  await expect(ink).toHaveCount(0);
  await expect(page.locator('svg.pad path.hint')).toHaveCount(0);

  await scribble(page);
  await scribble(page);
  await expect(page.locator('svg.pad path.hint')).toHaveCount(1);
});

test('Review shows the hanzi alone until the answer is revealed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start review', exact: true }).click();
  await expect(page.locator('.face > .hanzi')).toBeVisible();
  await expect(page.locator('.answer')).toHaveCount(0);
  await expect(page.locator('.face').getByText(/[āáǎàēéěèīíǐìōóǒòūúǔù]/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Show answer', exact: true }).click();
  await expect(page.locator('.answer .meaning')).toHaveText(/\S+/);
});

test('Retry draws the word again after its verdict, and the first try still grades the card', async ({ page }) => {
  const hanzi = await openWriting(page);
  const check = page.getByRole('button', { name: 'Check', exact: true });

  for (const _ of hanzi) {
    await scribble(page);
    await check.click();
  }
  await expect.poll(() => heading(page)).toMatch(/^Character: .*wrong/);

  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('svg.pad')).toBeVisible();
  await expect(page.locator('.answer .hanzi')).toHaveCount(0);

  for (const character of hanzi) {
    await draw(page, await mediansFor(page, character));
    await check.click();
  }
  await expect.poll(() => heading(page)).toBe('Character: Right');
  await expect(page.getByText('Graded on your first try: Wrong.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Count it as right' })).toBeVisible();

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('.progress').getByText(/^2 \/ \d+$/)).toBeVisible();

  const stored = await page.evaluate(
    () =>
      new Promise<{ grades: number[]; practice: number }>((resolve, reject) => {
        const open = indexedDB.open('fanka');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(['reviews', 'attempts'], 'readonly');
          const reviews = tx.objectStore('reviews').getAll();
          const attempts = tx.objectStore('attempts').getAll();
          tx.oncomplete = () => {
            open.result.close();
            resolve({
              grades: (reviews.result as { grade: number }[]).map((r) => r.grade),
              practice: (attempts.result as { source: string }[]).filter((a) => a.source === 'practice').length,
            });
          };
        };
      }),
  );
  expect(stored).toEqual({ grades: [1], practice: 1 });
});

test('focused practice on a single card brings the pad back after each answer', async ({ page }) => {
  await setStrokeFeedback(page, false);
  await page.goto('/writing?endless=1&cards=hsk1-traditional:hsk1-01');
  await expect(page.getByText(/Practising 1 weak word/)).toBeVisible();
  const check = page.getByRole('button', { name: 'Check', exact: true });

  for (let round = 0; round < 2; round++) {
    await expect(page.locator('svg.pad')).toBeVisible();
    // The one card: 學習, two characters.
    for (const _ of '學習') {
      await scribble(page);
      await check.click();
    }
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  }
  await expect(page.locator('svg.pad')).toBeVisible();
});
