import type { Deck } from '~core/db/schema';

/**
 * A lesson is the decks that share a tag: "Lesson 5" holds the batches
 * "Lesson 5 - 1", "Lesson 5 - 2"… The tag is the only link, so renaming it
 * on a deck moves that deck to another lesson.
 */
type Named = Pick<Deck, 'name' | 'tag'>;

export interface LessonGroup<T> {
  /** Null for the decks that carry no tag. */
  lesson: string | null;
  items: T[];
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Names in reading order: "Lesson 2" before "Lesson 10". */
export function compareNames(a: string, b: string): number {
  return collator.compare(a, b);
}

export function lessonOf(deck: Pick<Deck, 'tag'>): string | null {
  return deck.tag.trim() || null;
}

/** One group per lesson in natural order, untagged decks last; each group's decks by name. */
export function groupByLesson<T>(rows: readonly T[], deckOf: (row: T) => Named): LessonGroup<T>[] {
  const groups = new Map<string | null, T[]>();
  for (const row of rows) {
    const lesson = lessonOf(deckOf(row));
    groups.set(lesson, [...(groups.get(lesson) ?? []), row]);
  }
  return [...groups]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : compareNames(a, b)))
    .map(([lesson, items]) => ({ lesson, items: items.sort((a, b) => compareNames(deckOf(a).name, deckOf(b).name)) }));
}

export function lessonNames(decks: readonly Pick<Deck, 'tag'>[]): string[] {
  return [...new Set(decks.map(lessonOf).filter((l): l is string => l !== null))].sort(compareNames);
}

export function deckIdsInLesson(decks: readonly Pick<Deck, 'id' | 'tag'>[], lesson: string): string[] {
  return decks.filter((d) => lessonOf(d) === lesson).map((d) => d.id);
}
