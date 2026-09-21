import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = Date.parse('2026-09-16T08:00:00Z');

function badCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-01',
    hanzi: '學習',
    pinyin: 'xue2 xi2',
    translation: 'to study',
    pos: 'verb',
    example: '',
    examplePinyin: '',
    exampleTranslation: '',
    tags: [],
    ...overrides,
  };
}

// This suite mocks the seed data module per test, so each test needs a
// fresh module graph — `seedIfNeeded` (and its `hsk1.json` import) must be
// re-imported after the mock is in place, not reused from a prior test.
beforeEach(() => {
  vi.resetModules();
});

// `vi.doMock` registers a factory that survives past the test that set it
// up — `resetModules` only clears vitest's evaluated-module cache, not the
// mock registrations themselves — so the next test would otherwise still
// see this test's fake hsk1.json.
afterEach(() => {
  vi.doUnmock('~core/seed/data/hsk1.json');
});

describe('seedIfNeeded validates every entry before writing anything', () => {
  it('throws, naming the deck and the entry id, and writes nothing', async () => {
    vi.doMock('~core/seed/data/hsk1.json', () => ({
      default: {
        id: 'bad-deck',
        name: 'Bad deck',
        description: 'x',
        colorToken: 'var(--chart-series-1)',
        tag: 'BAD',
        cards: [badCard({ id: 'entry-bad', hanzi: '' })],
      },
    }));
    const { db } = await import('~core/db/db');
    await db.delete();
    await db.open();
    const { seedIfNeeded } = await import('~core/seed/seed');

    const error: Error = await seedIfNeeded(NOW).catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('Bad deck');
    expect(error.message).toContain('entry-bad');
    expect(error.message).toContain('Hanzi is required');
    expect(await db.decks.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
  });

  it('catches a duplicate hanzi within the seed file itself, before any write', async () => {
    vi.doMock('~core/seed/data/hsk1.json', () => ({
      default: {
        id: 'dup-deck',
        name: 'Dup deck',
        description: 'x',
        colorToken: 'var(--chart-series-1)',
        tag: 'DUP',
        cards: [
          badCard({ id: 'entry-first', hanzi: '學習', pinyin: 'xue2 xi2' }),
          badCard({ id: 'entry-second', hanzi: '學習', pinyin: 'xue2 xi2' }),
        ],
      },
    }));
    const { db } = await import('~core/db/db');
    await db.delete();
    await db.open();
    const { seedIfNeeded } = await import('~core/seed/seed');

    const error: Error = await seedIfNeeded(NOW).catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('Dup deck');
    expect(error.message).toContain('entry-second');
    expect(error.message).toContain('Already in this deck');
    expect(await db.decks.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
  });

  it('does not throw for the real seed data', async () => {
    const { db } = await import('~core/db/db');
    await db.delete();
    await db.open();
    const { seedIfNeeded } = await import('~core/seed/seed');

    await expect(seedIfNeeded(NOW)).resolves.toEqual({ seeded: true, deckCount: 1 });
  });
});
