import type { Attempt, Card, Deck, Direction, Item, Review } from '~core/db/schema';

export const local = (m: number, d: number, h = 10, min = 0) => new Date(2026, m - 1, d, h, min).getTime();
export const NOW = local(9, 29, 12);

export const aDeck = (id: string, over: Partial<Deck> = {}): Deck => ({
  id, name: id.toUpperCase(), description: '', colorToken: 'var(--chart-series-1)', tag: '', bundle: 'taiwan' as const, translationLang: 'en',
  createdAt: 0, updatedAt: 0, deletedAt: null, ...over,
});

export const aCard = (id: string, deckId: string, over: Partial<Card> = {}): Card => ({
  id, deckId, hanzi: '學', pinyin: [], zhuyin: '', translation: 'to study', pos: 'verb', example: '', examplePinyin: '',
  exampleTranslation: '', tags: [], note: '', createdAt: 0, updatedAt: 0, deletedAt: null, ...over,
});

export const anItem = (cardId: string, dir: Direction, over: Partial<Item> = {}): Item => ({
  id: `${cardId}:${dir}`, cardId, dir, suspended: false, state: 'review', due: NOW, stability: 1, difficulty: 5,
  elapsedDays: 0, scheduledDays: 5, reps: 3, lapses: 0, learningSteps: 0, lastReview: null, updatedAt: 0, ...over,
});

export const aReview = (id: string, itemId: string, over: Partial<Review> = {}, before: Partial<Review['before']> = {}): Review => ({
  id, itemId, grade: 3, reviewedAt: NOW, durationMs: 5000,
  before: { state: 'review', due: 0, stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 5, reps: 1, lapses: 0, learningSteps: 0, lastReview: null, updatedAt: 0, ...before },
  ...over,
});

export const anAttempt = (id: string, over: Partial<Attempt> = {}): Attempt => ({
  id, itemId: 'c1:production', cardId: 'c1', deckId: 'd1', mode: 'writing', source: 'scheduled', grade: 3, correct: true,
  at: NOW, durationMs: 5000, checked: false, writing: null, ...over,
});
