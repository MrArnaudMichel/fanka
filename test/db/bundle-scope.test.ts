import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { activeBundle, deckInScope, setActiveBundle } from '~core/db/bundle-scope';
import { db } from '~core/db/db';
import { cards, decks, items, reviews, stats } from '~core/db/repositories';
import { itemId } from '~core/db/schema';
import { studyDeckFilter, saveStudyDeckIds } from '~core/db/study-decks';
import type { Bundle } from '~core/chinese/script';

const NOW = Date.parse('2026-09-16T08:00:00Z');

const aDeck = (id: string, bundle: Bundle) => ({
  id, name: id, description: '', colorToken: 'var(--chart-series-1)',
  tag: '', bundle, translationLang: 'en', createdAt: NOW, updatedAt: NOW, deletedAt: null,
});
const aCard = (id: string, deckId: string) => ({
  id, deckId, hanzi: '学', pinyin: [{ text: 'xué', tone: 2 as const }],
  zhuyin: '', translation: 'to study', pos: 'verb' as const, example: '', examplePinyin: '',
  exampleTranslation: '', tags: [], note: '', createdAt: NOW, updatedAt: NOW, deletedAt: null,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  await decks.put(aDeck('tw', 'taiwan'));
  await decks.put(aDeck('cn', 'mainland'));
  await cards.create(aCard('ctw', 'tw'), ['recognition'], NOW);
  await cards.create(aCard('ccn', 'cn'), ['recognition'], NOW);
  for (const cardId of ['ctw', 'ccn']) {
    const item = (await items.get(itemId(cardId, 'recognition')))!;
    await reviews.record({ item, before: item, grade: 3, reviewedAt: NOW, durationMs: 1 });
  }
  await db.items.toCollection().modify({ state: 'review', due: NOW });
});

afterEach(() => setActiveBundle(null));

describe('bundle scope', () => {
  it('lists, schedules and counts only the active bundle', async () => {
    setActiveBundle('mainland');
    expect((await decks.listAll()).map((d) => d.bundle)).toEqual(['mainland']);
    expect((await decks.summaries(NOW)).map((d) => d.deck.id)).toEqual(['cn']);
    const due = await items.due(NOW);
    expect(due.map((i) => i.cardId)).toEqual(['ccn']);
    setActiveBundle('taiwan');
    expect((await decks.listAll()).map((d) => d.bundle)).toEqual(['taiwan']);
  });

  it('shows every live deck while no bundle is active', async () => {
    expect(activeBundle()).toBeNull();
    expect((await decks.listAll()).map((d) => d.id).sort()).toEqual(['cn', 'tw']);
    expect(deckInScope({ deletedAt: NOW, bundle: 'taiwan' })).toBe(false);
  });

  it('keeps statistics to the active bundle', async () => {
    setActiveBundle('mainland');
    const s = await stats.snapshot();
    expect(s.attempts.map((a) => a.deckId)).toEqual(['cn']);
    expect(s.decks.map((d) => d.id)).toEqual(['cn']);
    expect(s.cards.map((c) => c.id)).toEqual(['ccn']);
    expect(s.items.length).toBe(1);
    expect(s.reviews.length).toBe(1);
  });

  it('drops a study selection from the other bundle', async () => {
    await saveStudyDeckIds(['tw', 'cn']);
    setActiveBundle('taiwan');
    expect([...(await studyDeckFilter())!]).toEqual(['tw']);
  });

  it('picks up a switch on the next query, without a reload', async () => {
    setActiveBundle('taiwan');
    expect((await decks.listAll()).map((d) => d.id)).toEqual(['tw']);
    setActiveBundle('mainland');
    expect((await decks.listAll()).map((d) => d.id)).toEqual(['cn']);
  });
});
