import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { needsOnboarding, suggestedBundle } from '~core/db/onboarding';
import { idsKnownThrough, nextStep } from '~core/curriculum/engine';
import type { ContentIndex, LevelRef } from '~core/curriculum/types';
import { cards, decks, lessonProgress, reviews } from '~core/db/repositories';
import { seedStarterDeck } from '../helpers/starterDeck';

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
    await seedStarterDeck(NOW);
    expect(await suggestedBundle()).toBeNull();
  });

  it('suggests Taiwan to an install that already has a card of its own', async () => {
    await decks.put(aDeck);
    await cards.create(aCard, ['recognition'], NOW);
    expect(await suggestedBundle()).toBe('taiwan');
  });

  it('suggests Taiwan to an install that already has an attempt', async () => {
    await seedStarterDeck(NOW);
    const seeded = (await db.items.toArray())[0]!;
    await reviews.record({ item: seeded, before: seeded, grade: 3, reviewedAt: NOW, durationMs: 1 });
    expect(await suggestedBundle()).toBe('taiwan');
  });
});

function aLevel(level: number): LevelRef {
  const lessonIds = [1, 2, 3].map((n) => `l${level}-u1-${n}`);
  return {
    level,
    name: `HSK ${level}`,
    file: `level-${level}.json`,
    wordCount: 3,
    units: [{ id: `l${level}-u1`, lessonIds }],
    lessons: lessonIds.map((id) => ({ id, unit: `l${level}-u1`, wordIds: [] })),
  };
}
const index: ContentIndex = { bundle: 'taiwan', version: '1', levels: [aLevel(1), aLevel(2), aLevel(3)] };

describe('knowing levels already', () => {
  it('marks every lesson and writing session of levels 1 to 2, and the next step starts at level 3', async () => {
    const ids = idsKnownThrough(index, 2);
    expect(ids).toHaveLength(8);
    expect(ids).toContain('l2-u1-writing');
    expect(ids).not.toContain('l3-u1-1');

    await lessonProgress.markKnown('taiwan', ids, NOW);
    const step = nextStep(index, await lessonProgress.done('taiwan'));
    expect(step).toMatchObject({ kind: 'lesson', lesson: { id: 'l3-u1-1' } });
  });
});
