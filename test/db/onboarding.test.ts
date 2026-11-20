import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { needsOnboarding, suggestedBundle } from '~core/db/onboarding';
import { cards, decks, reviews } from '~core/db/repositories';
import { seedIfNeeded } from '~core/seed/seed';

const NOW = Date.parse('2026-11-21T08:00:00Z');

const aDeck = { id: 'd1', name: 'Mine', description: '', colorToken: 'var(--chart-series-1)', tag: '', bundle: 'taiwan' as const, translationLang: 'en', createdAt: NOW, updatedAt: NOW, deletedAt: null };
const aCard = { id: 'c1', deckId: 'd1', hanzi: '十', pinyin: [{ text: 'shí', tone: 2 as const }], zhuyin: '', translation: 'ten', pos: 'noun' as const, example: '', examplePinyin: '', exampleTranslation: '', tags: [], note: '', createdAt: NOW, updatedAt: NOW, deletedAt: null };

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('needsOnboarding', () => {
  it('sends a learner who has not onboarded to /welcome, except to legal pages', () => {
    expect(needsOnboarding({ onboardedAt: null }, '/')).toBe(true);
    expect(needsOnboarding({ onboardedAt: null }, '/settings/display')).toBe(true);
    expect(needsOnboarding({ onboardedAt: null }, '/privacy')).toBe(false);
    expect(needsOnboarding({ onboardedAt: null }, '/delete-account')).toBe(false);
    expect(needsOnboarding({ onboardedAt: null }, '/licences')).toBe(false);
    expect(needsOnboarding({ onboardedAt: null }, '/welcome')).toBe(false);
    expect(needsOnboarding({ onboardedAt: 1 }, '/')).toBe(false);
  });
});

describe('suggestedBundle', () => {
  it('suggests nothing to a fresh install, even once the starter deck is seeded', async () => {
    expect(await suggestedBundle()).toBeNull();
    await seedIfNeeded(NOW);
    expect(await suggestedBundle()).toBeNull();
  });

  it('suggests Taiwan to an install that already has a card of its own', async () => {
    await decks.put(aDeck);
    await cards.create(aCard, ['recognition'], NOW);
    expect(await suggestedBundle()).toBe('taiwan');
  });

  it('suggests Taiwan to an install that already has an attempt', async () => {
    await seedIfNeeded(NOW);
    const seeded = (await db.items.toArray())[0]!;
    await reviews.record({ item: seeded, before: seeded, grade: 3, reviewedAt: NOW, durationMs: 1 });
    expect(await suggestedBundle()).toBe('taiwan');
  });
});
