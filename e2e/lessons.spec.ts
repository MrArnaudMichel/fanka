import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/onboarded';

/** What the discover step showed for a word, so its exercises can be answered. */
interface Seen {
  hanzi: string;
  meaning: string;
  reading: string;
}

const squash = (text: string | null): string => (text ?? '').replace(/\s+/g, ' ').trim();

/** Walks the introductions, writing down each word. Ends on the first exercise. */
async function discover(page: Page): Promise<Seen[]> {
  const seen: Seen[] = [];
  await expect(page.getByText('New word', { exact: true })).toBeVisible();
  while (await page.getByText('New word', { exact: true }).isVisible()) {
    seen.push({
      hanzi: squash(await page.locator('.intro .hanzi').first().textContent()),
      meaning: squash(await page.locator('.intro .reading .meaning').first().textContent()),
      reading: squash(await page.locator('.intro .reading :not(.meaning)').first().textContent()),
    });
    const previous = seen[seen.length - 1]!.hanzi;
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    // The next word, or the first exercise, replaces this one.
    await page.waitForFunction((prev) => document.querySelector('.intro .hanzi')?.textContent?.trim() !== prev, previous);
  }
  return seen;
}

/** Answers one choice exercise from what discover showed; a listening one has no visible answer, so it takes the first choice. */
async function answerChoice(page: Page, seen: Seen[], instruction: string): Promise<void> {
  const choices = page.getByRole('group', { name: instruction }).locator('kt-button');
  const texts = (await choices.allTextContents()).map(squash);
  let at = 0;
  if (instruction === 'Choose the word') {
    const meaning = squash(await page.locator('.exercise .meaning').textContent());
    at = texts.indexOf(seen.find((w) => w.meaning.startsWith(meaning))!.hanzi);
  } else if (instruction === 'Choose the meaning') {
    const hanzi = squash(await page.locator('.exercise .hanzi').textContent());
    const full = seen.find((w) => w.hanzi === hanzi)!.meaning;
    // The exercise asks for the first meaning; the intro lists them all joined.
    at = texts.findIndex((t) => full.startsWith(t));
  } else if (instruction === 'Choose the reading') {
    const hanzi = squash(await page.locator('.exercise .hanzi').textContent());
    at = texts.indexOf(seen.find((w) => w.hanzi === hanzi)!.reading);
  }
  await choices.nth(Math.max(at, 0)).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

/** Plays every exercise through to the summary. */
async function exercises(page: Page, seen: Seen[]): Promise<void> {
  const summary = page.getByRole('heading', { name: 'Lesson complete' });
  for (let guard = 0; guard < 40 && !(await summary.isVisible()); guard += 1) {
    const instruction = page.locator('.exercise .overline');
    const writing = page.getByRole('button', { name: "I don't know" });
    await expect(instruction.or(writing).or(summary).first()).toBeVisible();
    if (await summary.isVisible()) break;
    if (await writing.isVisible()) {
      // Drawing is covered by writing.spec; here the learner gives up and moves on.
      await writing.click();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      continue;
    }
    await answerChoice(page, seen, squash(await instruction.textContent()));
  }
  await expect(summary).toBeVisible();
  // The answers are written once the summary has saved them.
  await expect(page.getByText('Saving your answers…')).toHaveCount(0);
  await expect(page.getByText(/\d+ of \d+ right/)).toBeVisible();
}

test('Taiwan lesson 1, from Today to the deck', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Next: Lesson 1 · Taiwan 1')).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).first().click();
  await expect(page).toHaveURL(/\/lessons\/tbcl1-l001$/);

  const seen = await discover(page);
  expect(seen).toHaveLength(10);
  await exercises(page, seen);

  // Nothing is due right after a lesson: its words are scheduled for tomorrow or later.
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start review — nothing due right now' }).first()).toBeVisible();

  await page.goto('/decks');
  await expect(page.getByText('Taiwan 1', { exact: true }).first()).toBeVisible();
  await page.goto('/browse?deck=curriculum%3Atbcl1');
  await expect(page.locator('kt-table tr[part=row]')).toHaveCount(10);
});

test('a Mainland lesson shows simplified characters', async ({ page }) => {
  await page.goto('/settings/study');
  await page.getByRole('button', { name: /Mainland Chinese/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-bundle', 'mainland');

  await page.goto('/');
  await expect(page.getByText('Next: Lesson 1 · HSK 1')).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).first().click();
  await expect(page).toHaveURL(/\/lessons\/hsk1-l001$/);
  await expect(page.locator('html')).toHaveAttribute('data-bundle', 'mainland');

  const seen = await discover(page);
  expect(seen).toHaveLength(10);
  // 爱 is the simplified form; 愛 would be the traditional one.
  const hanzi = seen.map((w) => w.hanzi).join('');
  expect(hanzi).toMatch(/[\u4e00-\u9fff]/);
  expect(hanzi).not.toMatch(/[愛們國學]/);
  await exercises(page, seen);

  await page.goto('/browse?deck=curriculum%3Ahsk1');
  await expect(page.locator('kt-table tr[part=row]')).toHaveCount(10);
});

test('switching the bundle reloads the lessons list, and a long level opens', async ({ page }) => {
  await page.goto('/lessons');
  await expect(page.getByText('Taiwan 1 · ', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('HSK 1 · ')).toHaveCount(0);

  await page.goto('/settings/study');
  await page.getByRole('button', { name: /Mainland Chinese/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-bundle', 'mainland');
  await page.goto('/lessons');
  await expect(page.getByText('HSK 1 · ').first()).toBeVisible();
  await expect(page.getByText('Taiwan 1 · ')).toHaveCount(0);

  // HSK 7–9 is split into sections; opening it must render its lessons.
  const heading = page.getByText(/^HSK 7–9 · /);
  const long = page.locator('kt-collapsible').filter({ has: heading }).last();
  await heading.locator('..').click();
  // Its lessons come in sections, each its own collapsible.
  const firstSection = long.getByText(/^Lessons 1–/);
  await expect(firstSection).toBeVisible();
  await firstSection.locator('..').click();
  await expect(long.getByRole('button', { name: 'Lesson 1', exact: true })).toBeVisible();
  // Closing a section leaves its level open.
  await firstSection.locator('..').click();
  await expect(long.getByRole('button', { name: 'Lesson 1', exact: true })).toBeHidden();
  await expect(firstSection).toBeVisible();
});
