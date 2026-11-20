import { parsePinyin } from '~core/chinese/pinyin';
import { toZhuyin } from '~core/chinese/zhuyin';
import { writingCharacters, seedState } from '~core/curriculum/schedule';
import { scoreLesson, writingId } from '~core/curriculum/engine';
import type { Exercise } from '~core/curriculum/exercises';
import type { Bundle, LessonRef, LevelRef, UnitRef, Word } from '~core/curriculum/types';
import type { Scheduler, SchedulerSettings } from '~core/srs/types';
import { buildAttempt } from './attempts';
import { db } from './db';
import { outboxEntry } from './repositories';
import { type Card, type Deck, type Direction, type Item, type PartOfSpeech, SELF_GRADED, itemId } from './schema';

export interface LessonResult {
  wordId: string;
  exercise: Exercise['kind'];
  right: boolean;
  at: number;
  durationMs: number;
}

export interface WritingResult {
  wordId: string;
  right: boolean;
  at: number;
  durationMs: number;
}

const DECK_PREFIX: Record<Bundle, string> = { mainland: 'hsk', taiwan: 'tbcl' };
const DECK_TAG: Record<Bundle, string> = { mainland: 'HSK', taiwan: 'TBCL' };
const POS: readonly PartOfSpeech[] = ['noun', 'verb', 'adjective', 'adverb', 'phrase'];

export function curriculumDeckId(bundle: Bundle, level: number): string {
  return `curriculum:${DECK_PREFIX[bundle]}${level}`;
}

function toPos(pos: string | undefined): PartOfSpeech {
  return POS.find((p) => p === pos) ?? 'phrase';
}

function cardFor(word: Word, deckId: string, levelName: string, now: number): Card {
  const first = word.readings[0];
  const pinyin = parsePinyin(first?.pinyin ?? '');
  const note = word.readings
    .slice(1)
    .map((r) => `${r.pinyin}: ${r.meanings.join('; ')}`)
    .join('\n');
  return {
    id: word.id,
    deckId,
    hanzi: word.hanzi,
    pinyin,
    zhuyin: first?.zhuyin ?? toZhuyin(pinyin),
    translation: first?.meanings.join('; ') ?? '',
    pos: toPos(word.pos),
    example: word.example?.text ?? '',
    examplePinyin: word.example?.pinyin ?? '',
    exampleTranslation: word.example?.translation ?? '',
    tags: [levelName],
    note,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

async function ensureDeck(bundle: Bundle, level: LevelRef, now: number): Promise<string> {
  const id = curriculumDeckId(bundle, level.level);
  if (await db.decks.get(id)) return id;
  const deck: Deck = {
    id,
    name: level.name,
    description: '',
    colorToken: 'var(--chart-series-1)',
    tag: DECK_TAG[bundle],
    bundle,
    translationLang: 'en',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.decks.put(deck);
  await db.outbox.put(outboxEntry('deck', id, 'put', now));
  return id;
}

/** The item for `wordId` in `dir`, seeded when it is new; an existing one is kept as it is. */
async function ensureItem(
  wordId: string,
  dir: Direction,
  right: boolean,
  now: number,
  scheduler: Scheduler,
  settings: SchedulerSettings,
): Promise<Item> {
  const id = itemId(wordId, dir);
  const existing = await db.items.get(id);
  if (existing) return existing;
  const item: Item = { ...seedState(scheduler, settings, right, now), id, cardId: wordId, dir, suspended: false, updatedAt: now };
  await db.items.put(item);
  await db.outbox.put(outboxEntry('item', id, 'put', now));
  return item;
}

function allRight(results: { wordId: string; right: boolean }[], wordId: string): boolean {
  const own = results.filter((r) => r.wordId === wordId);
  return own.length > 0 && own.every((r) => r.right);
}

async function logAttempt(
  item: Item,
  deckId: string,
  mode: 'review' | 'writing',
  result: { right: boolean; at: number; durationMs: number },
): Promise<void> {
  const id = crypto.randomUUID();
  const attempt = buildAttempt({
    id,
    item,
    deckId,
    source: 'lesson',
    grade: result.right ? 3 : 1,
    at: result.at,
    durationMs: result.durationMs,
    detail: SELF_GRADED,
  });
  await db.attempts.put({ ...attempt, mode });
  await db.outbox.put(outboxEntry('attempt', id, 'put', result.at));
}

async function putProgress(
  id: string,
  bundle: Bundle,
  kind: 'lesson' | 'writing',
  results: { wordId: string; right: boolean }[],
  now: number,
): Promise<void> {
  const { right, total } = scoreLesson(results);
  await db.lessonProgress.put({ id, bundle, kind, completedAt: now, right, total, known: false, updatedAt: now });
  await db.outbox.put(outboxEntry('lessonProgress', id, 'put', now));
}

/**
 * Finishing a lesson: its words become cards with a seeded reading item in the
 * level's curriculum deck, every answer is logged and the progress is
 * recorded — all in one transaction. Doing a lesson again creates nothing new.
 */
export async function completeLesson(input: {
  bundle: Bundle;
  level: LevelRef;
  lesson: LessonRef;
  words: Word[];
  results: LessonResult[];
  durationMs: number;
  now: number;
  scheduler: Scheduler;
  settings: SchedulerSettings;
}): Promise<void> {
  const { bundle, level, lesson, words, results, now, scheduler, settings } = input;
  await db.transaction('rw', [db.decks, db.cards, db.items, db.attempts, db.lessonProgress, db.outbox], async () => {
    const deckId = await ensureDeck(bundle, level, now);
    const itemsByWord = new Map<string, Item>();
    for (const word of words) {
      if (!(await db.cards.get(word.id))) {
        await db.cards.put(cardFor(word, deckId, level.name, now));
        await db.outbox.put(outboxEntry('card', word.id, 'put', now));
      }
      itemsByWord.set(word.id, await ensureItem(word.id, 'recognition', allRight(results, word.id), now, scheduler, settings));
    }
    for (const result of results) {
      const item = itemsByWord.get(result.wordId);
      if (item) await logAttempt(item, deckId, result.exercise === 'writing' ? 'writing' : 'review', result);
    }
    await putProgress(lesson.id, bundle, 'lesson', results, now);
  });
}

/**
 * Finishing a unit's writing session: the `production` item of each word that
 * has a card and stroke data, seeded from how it was written.
 */
export async function completeWriting(input: {
  bundle: Bundle;
  level: LevelRef;
  unit: UnitRef;
  words: Word[];
  results: WritingResult[];
  now: number;
  scheduler: Scheduler;
  settings: SchedulerSettings;
  hasStrokes: (ch: string) => boolean;
}): Promise<void> {
  const { bundle, level, unit, words, results, now, scheduler, settings, hasStrokes } = input;
  const writable = new Set(writingCharacters(words, hasStrokes).map((w) => w.wordId));
  await db.transaction('rw', [db.cards, db.items, db.attempts, db.lessonProgress, db.outbox], async () => {
    const itemsByWord = new Map<string, Item>();
    for (const word of words) {
      if (!writable.has(word.id) || !(await db.cards.get(word.id))) continue;
      itemsByWord.set(word.id, await ensureItem(word.id, 'production', allRight(results, word.id), now, scheduler, settings));
    }
    const deckId = curriculumDeckId(bundle, level.level);
    for (const result of results) {
      const item = itemsByWord.get(result.wordId);
      if (item) await logAttempt(item, deckId, 'writing', result);
    }
    await putProgress(writingId(unit.id), bundle, 'writing', results, now);
  });
}
