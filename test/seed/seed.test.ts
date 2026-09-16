import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { cards, decks } from '~core/db/repositories';
import { SEED_VERSION, seedIfNeeded } from '~core/seed/seed';

const NOW = Date.parse('2026-09-16T08:00:00Z');

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('seedIfNeeded', () => {
  it('creates decks and cards on a fresh database', async () => {
    const result = await seedIfNeeded(NOW);
    expect(result.seeded).toBe(true);
    expect(result.deckCount).toBeGreaterThan(0);
    expect(await db.cards.count()).toBeGreaterThan(0);
  });

  it('creates two items per seeded card', async () => {
    await seedIfNeeded(NOW);
    expect(await db.items.count()).toBe((await db.cards.count()) * 2);
  });

  it('is idempotent — running twice changes nothing', async () => {
    await seedIfNeeded(NOW);
    const before = await db.cards.count();
    const second = await seedIfNeeded(NOW);
    expect(second.seeded).toBe(false);
    expect(await db.cards.count()).toBe(before);
  });

  it('records the version it seeded', async () => {
    await seedIfNeeded(NOW);
    expect((await db.settings.get('seedVersion'))?.value).toBe(SEED_VERSION);
  });

  it('gives every seeded card parsed pinyin and derived zhuyin', async () => {
    await seedIfNeeded(NOW);
    for (const card of await db.cards.toArray()) {
      expect(card.pinyin.length).toBeGreaterThan(0);
      expect(card.pinyin.every((s) => s.tone >= 1 && s.tone <= 5)).toBe(true);
      expect(card.zhuyin.length).toBeGreaterThan(0);
    }
  });

  it('seeds traditional characters only', async () => {
    await seedIfNeeded(NOW);
    // Built from the simplified spelling of each deck word's compound, minus
    // 迎/忙/程 — those three are identical in traditional and simplified
    // script (歡迎/幫忙/課程 keep them unchanged), so including them made the
    // class false-positive on correct traditional data.
    const simplifiedOnly = /[习学问题时间开电话认识欢压这个买两点课给号码]/;
    for (const card of await db.cards.toArray()) {
      expect(card.hanzi).not.toMatch(simplifiedOnly);
    }
  });

  it('does not overwrite a card the learner has edited', async () => {
    await seedIfNeeded(NOW);
    const [first] = await db.cards.toArray();
    await db.cards.put({ ...first!, translation: 'my own wording', updatedAt: NOW + 1000 });
    await seedIfNeeded(NOW + 2000);
    expect((await db.cards.get(first!.id))!.translation).toBe('my own wording');
  });

  // The test above proves nothing about the per-card guard: after a first
  // seed, `recorded === SEED_VERSION` is true, so the second call returns
  // early — before it ever reaches `if (await cards.get(id)) continue` — and
  // touches no card at all. This test forces a genuine reseed (as a version
  // bump would in production) past that early return, so the per-card guard
  // that actually protects a learner's edit is exercised.
  it('does not overwrite an edited card when a genuine reseed runs past the early return', async () => {
    await seedIfNeeded(NOW);
    const [first] = await db.cards.toArray();
    await db.cards.put({ ...first!, translation: 'my own wording', updatedAt: NOW + 1000 });

    await db.settings.put({ key: 'seedVersion', value: SEED_VERSION - 1 });
    const before = await db.cards.count();
    const result = await seedIfNeeded(NOW + 2000);

    expect(result.seeded).toBe(true);
    expect(await db.cards.count()).toBe(before);
    expect((await db.cards.get(first!.id))!.translation).toBe('my own wording');
    expect((await db.settings.get('seedVersion'))?.value).toBe(SEED_VERSION);
  });
});
