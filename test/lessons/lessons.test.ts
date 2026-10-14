import { describe, expect, it } from 'vitest';
import { compareNames, deckIdsInLesson, groupByLesson, lessonNames, lessonOf } from '~core/lessons';

const deck = (id: string, name: string, tag = '') => ({ id, name, tag });

describe('lessonOf', () => {
  it("is the deck's tag, trimmed", () => {
    expect(lessonOf(deck('a', 'Lesson 1 - 1', '  Lesson 1 '))).toBe('Lesson 1');
  });

  it('is null for an untagged deck', () => {
    expect(lessonOf(deck('a', 'Food'))).toBeNull();
    expect(lessonOf(deck('a', 'Food', '   '))).toBeNull();
  });
});

describe('compareNames', () => {
  it('orders numbers by value, not by character', () => {
    expect(['Lesson 10', 'Lesson 2', 'Lesson 1'].sort(compareNames)).toEqual(['Lesson 1', 'Lesson 2', 'Lesson 10']);
  });
});

describe('groupByLesson', () => {
  const decks = [
    deck('d3', 'Lesson 2 - 1', 'Lesson 2'),
    deck('x', 'Food'),
    deck('d2', 'Lesson 1 - 10', 'Lesson 1'),
    deck('d10', 'Lesson 10 - 1', 'Lesson 10'),
    deck('d1', 'Lesson 1 - 2', 'Lesson 1'),
  ];

  it('groups by lesson in natural order, untagged decks last', () => {
    expect(groupByLesson(decks, (d) => d).map((g) => g.lesson)).toEqual(['Lesson 1', 'Lesson 2', 'Lesson 10', null]);
  });

  it("orders each lesson's decks by name, numbers by value", () => {
    expect(groupByLesson(decks, (d) => d)[0]!.items.map((d) => d.id)).toEqual(['d1', 'd2']);
  });

  it('reads the deck through the accessor, so rows that wrap a deck group too', () => {
    const rows = decks.map((d) => ({ deck: d }));
    expect(groupByLesson(rows, (r) => r.deck)[1]!.items).toEqual([{ deck: decks[0] }]);
  });

  it('has no groups for no decks', () => {
    expect(groupByLesson([], (d: ReturnType<typeof deck>) => d)).toEqual([]);
  });
});

describe('lessonNames', () => {
  it('lists each lesson once, in natural order', () => {
    expect(lessonNames([deck('a', 'x', 'Lesson 10'), deck('b', 'y', 'Lesson 2'), deck('c', 'z', 'Lesson 2'), deck('d', 'w')])).toEqual([
      'Lesson 2',
      'Lesson 10',
    ]);
  });
});

describe('deckIdsInLesson', () => {
  it("is every deck carrying the lesson's tag", () => {
    expect(deckIdsInLesson([deck('a', 'x', 'L1'), deck('b', 'y', ' L1'), deck('c', 'z', 'L2')], 'L1')).toEqual(['a', 'b']);
  });
});
