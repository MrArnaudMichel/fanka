import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { attempts, cards, decks, items, reviews } from '~core/db/repositories';
import type { Attempt, Card, Deck, Item, Review } from '~core/db/schema';
import { runSync } from '~core/sync/engine';
import type { LocalChanges, RemoteChanges, SyncTransport } from '~core/sync/types';

const NOW = Date.parse('2026-09-16T08:00:00Z');
const DAY = 86_400_000;

const aDeck = (over: Partial<Deck> = {}): Deck => ({
  id: 'd1',
  name: 'HSK 1',
  description: '',
  colorToken: 'var(--chart-series-1)',
  tag: 'HSK',
  bundle: 'taiwan' as const, translationLang: 'en',
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
  ...over,
});

const aCard = (over: Partial<Card> = {}): Card => ({
  id: 'c1',
  deckId: 'd1',
  hanzi: '學習',
  pinyin: [{ text: 'xué', tone: 2 }],
  zhuyin: '',
  translation: 'to study',
  pos: 'verb',
  example: '',
  examplePinyin: '',
  exampleTranslation: '',
  tags: [],
  note: '',
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
  ...over,
});

const anItem = (over: Partial<Item> = {}): Item => ({
  id: 'c1:recognition',
  cardId: 'c1',
  dir: 'recognition',
  suspended: false,
  state: 'new',
  due: NOW,
  stability: 0,
  difficulty: 0,
  elapsedDays: 0,
  scheduledDays: 0,
  reps: 0,
  lapses: 0,
  learningSteps: 0,
  lastReview: null,
  updatedAt: NOW,
  ...over,
});

const aReview = (over: Partial<Review> = {}): Review => ({
  id: 'r1',
  itemId: 'c1:recognition',
  grade: 3,
  reviewedAt: NOW,
  durationMs: 1000,
  before: {
    state: 'new',
    due: NOW,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    learningSteps: 0,
    lastReview: null,
    updatedAt: NOW,
  },
  ...over,
});

/**
 * An in-memory stand-in for a real backend. Filters `pull` by `since` the
 * same way the Supabase migration's indexes are meant to (`updatedAt` for
 * decks/cards/items, `reviewedAt` for reviews), and rejects an attempt to
 * push a review id it already holds — the server's insert-only rule for
 * reviews, enforced here so a bug in `buildPayload` that tried to "update" a
 * review would fail loudly instead of silently overwriting one.
 */
class FakeTransport implements SyncTransport {
  decks = new Map<string, Deck>();
  cards = new Map<string, Card>();
  items = new Map<string, Item>();
  reviews = new Map<string, Review>();
  attempts = new Map<string, Attempt>();
  pushCalls: LocalChanges[] = [];
  pullSinceCalls: number[] = [];
  failPush = false;

  seed(remote: { decks?: Deck[]; cards?: Card[]; items?: Item[]; reviews?: Review[]; attempts?: Attempt[] }): void {
    for (const d of remote.decks ?? []) this.decks.set(d.id, d);
    for (const c of remote.cards ?? []) this.cards.set(c.id, c);
    for (const i of remote.items ?? []) this.items.set(i.id, i);
    for (const r of remote.reviews ?? []) this.reviews.set(r.id, r);
    for (const a of remote.attempts ?? []) this.attempts.set(a.id, a);
  }

  async pull(since: number): Promise<RemoteChanges> {
    this.pullSinceCalls.push(since);
    const decks = [...this.decks.values()].filter((d) => d.updatedAt > since);
    const cards = [...this.cards.values()].filter((c) => c.updatedAt > since);
    const items = [...this.items.values()].filter((i) => i.updatedAt > since);
    const reviews = [...this.reviews.values()].filter((r) => r.reviewedAt > since);
    const attempts = [...this.attempts.values()].filter((a) => a.at > since);
    const at = Math.max(
      since,
      ...decks.map((d) => d.updatedAt),
      ...cards.map((c) => c.updatedAt),
      ...items.map((i) => i.updatedAt),
      ...reviews.map((r) => r.reviewedAt),
      ...attempts.map((a) => a.at),
    );
    return { decks, cards, items, reviews, attempts, lessonProgress: [], at };
  }

  async push(changes: LocalChanges): Promise<{ at: number }> {
    this.pushCalls.push(changes);
    if (this.failPush) throw new Error('push failed');
    for (const d of changes.decks) this.decks.set(d.id, d);
    for (const c of changes.cards) this.cards.set(c.id, c);
    for (const i of changes.items) this.items.set(i.id, i);
    for (const r of changes.reviews) {
      if (this.reviews.has(r.id)) throw new Error(`review ${r.id} already exists — reviews are insert-only`);
      this.reviews.set(r.id, r);
    }
    for (const a of changes.attempts) {
      if (this.attempts.has(a.id)) throw new Error(`attempt ${a.id} already exists — attempts are insert-only`);
      this.attempts.set(a.id, a);
    }
    return { at: NOW + DAY };
  }
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('runSync', () => {
  it('uploads a local-only change', async () => {
    await decks.put(aDeck());
    const transport = new FakeTransport();

    const result = await runSync(transport);

    expect(result.pushed).toEqual({ decks: 1, cards: 0, items: 0, reviews: 0, attempts: 0, lessonProgress: 0 });
    expect(transport.decks.get('d1')).toMatchObject({ name: 'HSK 1' });
    expect(await db.outbox.count()).toBe(0);
  });

  it('lands a remote-only change', async () => {
    const transport = new FakeTransport();
    transport.seed({ decks: [aDeck({ id: 'remote-deck' })] });

    const result = await runSync(transport);

    expect(result.pulled.decks).toBe(1);
    expect(await db.decks.get('remote-deck')).toMatchObject({ id: 'remote-deck' });
    expect(transport.pushCalls).toHaveLength(0);
  });

  it('resolves the same row edited on both sides by updatedAt — remote newer wins', async () => {
    await decks.put(aDeck({ updatedAt: NOW }));
    const transport = new FakeTransport();
    transport.seed({ decks: [aDeck({ name: 'Remote name', updatedAt: NOW + DAY })] });

    await runSync(transport);

    expect((await db.decks.get('d1'))?.name).toBe('Remote name');
  });

  it('resolves the same row edited on both sides by updatedAt — local newer wins', async () => {
    await decks.put(aDeck({ name: 'Local name', updatedAt: NOW + DAY }));
    const transport = new FakeTransport();
    transport.seed({ decks: [aDeck({ name: 'Remote name', updatedAt: NOW })] });

    await runSync(transport);

    expect((await db.decks.get('d1'))?.name).toBe('Local name');
    // The still-newer local row is what gets pushed back.
    expect(transport.decks.get('d1')?.name).toBe('Local name');
  });

  it('a remote delete beats an older local edit', async () => {
    await decks.put(aDeck({ name: 'Edited locally', updatedAt: NOW }));
    const transport = new FakeTransport();
    transport.seed({ decks: [aDeck({ name: 'Edited locally', deletedAt: NOW + DAY, updatedAt: NOW + DAY })] });

    await runSync(transport);

    expect((await db.decks.get('d1'))?.deletedAt).toBe(NOW + DAY);
  });

  it('keeps reviews from both sides after a sync', async () => {
    await items.put(anItem());
    await reviews.record({
      item: anItem(),
      before: anItem(),
      grade: 3,
      reviewedAt: NOW,
      durationMs: 500,
    });
    const [localReview] = await db.reviews.toArray();

    const transport = new FakeTransport();
    transport.seed({ reviews: [aReview({ id: 'remote-review', reviewedAt: NOW - DAY })] });

    const result = await runSync(transport);

    expect(result.pulled.reviews).toBe(1);
    const ids = (await db.reviews.toArray()).map((r) => r.id).sort();
    expect(ids).toEqual([localReview!.id, 'remote-review'].sort());
    expect(transport.reviews.has(localReview!.id)).toBe(true);
  });

  it('leaves the outbox intact when push fails', async () => {
    await decks.put(aDeck());
    const before = await db.outbox.toArray();
    expect(before.length).toBeGreaterThan(0);

    const transport = new FakeTransport();
    transport.failPush = true;

    await expect(runSync(transport)).rejects.toThrow('push failed');

    const after = await db.outbox.toArray();
    expect(after).toEqual(before);
  });

  it('is a no-op the second time it runs', async () => {
    await decks.put(aDeck());
    const transport = new FakeTransport();
    transport.seed({ cards: [aCard({ id: 'remote-card', deckId: 'd1' })] });

    await runSync(transport);
    const stateAfterFirst = await db.decks.toArray();
    const cardsAfterFirst = await db.cards.toArray();

    transport.pushCalls = [];
    const result = await runSync(transport);

    expect(result.pushed).toEqual({ decks: 0, cards: 0, items: 0, reviews: 0, attempts: 0, lessonProgress: 0 });
    expect(transport.pushCalls).toHaveLength(0);
    expect(await db.decks.toArray()).toEqual(stateAfterFirst);
    expect(await db.cards.toArray()).toEqual(cardsAfterFirst);
    expect(await db.outbox.count()).toBe(0);
  });

  it('pushes a practice attempt and lands a remote one', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['production'], NOW);
    const item = (await db.items.get('c1:production'))!;
    await attempts.log({ item, grade: 3, at: NOW, durationMs: 1, detail: { checked: false, writing: null } });
    const transport = new FakeTransport();
    const remote: Attempt = { id: 'remote', itemId: 'c1:production', cardId: 'c1', deckId: 'd1', mode: 'writing', source: 'practice', grade: 1, correct: false, at: NOW + 1, durationMs: 1, checked: false, writing: null };
    transport.seed({ attempts: [remote] });

    const result = await runSync(transport);

    expect(result.pushed.attempts).toBe(1);
    expect(result.pulled.attempts).toBe(1);
    expect(await db.attempts.get('remote')).toEqual(remote);
  });

  it('leaves a pulled attempt alone when its id is already here', async () => {
    const local: Attempt = { id: 'r1', itemId: 'c1:production', cardId: 'c1', deckId: 'd1', mode: 'writing', source: 'scheduled', grade: 3, correct: true, at: NOW, durationMs: 1, checked: true, writing: [] };
    await db.attempts.put(local);
    const transport = new FakeTransport();
    transport.seed({ attempts: [{ ...local, checked: false, writing: null }] });

    const result = await runSync(transport);

    expect(result.pulled.attempts).toBe(0);
    expect(await db.attempts.get('r1')).toEqual(local);
  });

  it('derives a self-graded attempt for a pulled review that arrives with none', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    const transport = new FakeTransport();
    transport.seed({ reviews: [aReview({ id: 'remote-review', itemId: 'c1:recognition', grade: 3, reviewedAt: NOW, durationMs: 2000 })] });

    const result = await runSync(transport);

    expect(result.pulled.attempts).toBe(1);
    const derived = await db.attempts.get('remote-review');
    expect(derived).toMatchObject({ id: 'remote-review', itemId: 'c1:recognition', cardId: 'c1', deckId: 'd1', mode: 'review', source: 'scheduled', grade: 3, correct: true, checked: false, writing: null });
    expect(await db.outbox.count()).toBe(0);
  });

  it('keeps the remote attempt, with its writing verdicts, over a derived one under the same review id', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['production'], NOW);
    const writing: Attempt['writing'] = [{ character: '學', shapeCorrect: true, orderCorrect: false, error: 'stroke-order', strokeIndex: 2, expected: 7, drawn: 7 }];
    const remoteAttempt: Attempt = { id: 'remote-review', itemId: 'c1:production', cardId: 'c1', deckId: 'd1', mode: 'writing', source: 'scheduled', grade: 3, correct: true, at: NOW, durationMs: 3000, checked: true, writing };
    const transport = new FakeTransport();
    transport.seed({
      reviews: [aReview({ id: 'remote-review', itemId: 'c1:production', grade: 3, reviewedAt: NOW })],
      attempts: [remoteAttempt],
    });

    const result = await runSync(transport);

    expect(result.pulled.attempts).toBe(1);
    expect(await db.attempts.get('remote-review')).toEqual(remoteAttempt);
    expect(await db.outbox.count()).toBe(0);
  });
});

