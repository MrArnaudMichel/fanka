import type { PinyinSyllable } from '~core/chinese/pinyin';
import type { Bundle } from '~core/chinese/script';
import type { WritingError } from '~core/chinese/strokes';
import type { Grade, SrsState } from '~core/srs';

export type Direction = 'recognition' | 'production';
export type PartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb' | 'phrase';

export interface Deck {
  id: string;
  name: string;
  description: string;
  colorToken: string;
  tag: string;
  /** Which curriculum the deck belongs to; fixes the script its content is written in. */
  bundle: Bundle;
  translationLang: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** The content. Holds no scheduling state — that is what Item is for. */
export interface Card {
  id: string;
  deckId: string;
  hanzi: string;
  pinyin: PinyinSyllable[];
  zhuyin: string;
  translation: string;
  pos: PartOfSpeech;
  example: string;
  examplePinyin: string;
  exampleTranslation: string;
  tags: string[];
  note: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/**
 * One scheduling state per direction. Recognising 學習 and being able to write
 * it from its meaning are different skills that a learner acquires at
 * different rates, so they are scheduled apart.
 */
export interface Item extends SrsState {
  id: string;
  cardId: string;
  dir: Direction;
  suspended: boolean;
  updatedAt: number;
}

/**
 * Append-only. Never updated, never deleted except by an explicit undo. It is
 * the only source for true retention, the activity heatmap and per-tone
 * accuracy, none of which can be derived from Item, which holds only the
 * present.
 */
export interface Review {
  id: string;
  itemId: string;
  grade: Grade;
  reviewedAt: number;
  durationMs: number;
  /**
   * The item's scheduling state immediately before this review, plus its
   * real `updatedAt` at that moment. `record()` is the only writer of this
   * field and always captures `updatedAt` from the item's row as it stood
   * before the write, regardless of what the caller's `before` argument
   * carries — so the type can promise it is always present.
   */
  before: SrsState & { updatedAt: number };
}

/** Which screen an answer came from: Review asks recognition, Writing production. */
export type StudyMode = 'review' | 'writing';

export const DIRECTION_MODE: Record<Direction, StudyMode> = { recognition: 'review', production: 'writing' };

/** A scheduled answer moved an item; a practice answer did not; a lesson answer is buffered and logged when the lesson finishes. */
export type AttemptSource = 'scheduled' | 'practice' | 'lesson';

/** The checker's verdict on one drawn character. */
export interface WritingResult {
  character: string;
  shapeCorrect: boolean;
  /** False too when the order could not be judged (wrong stroke count or shape). */
  orderCorrect: boolean;
  error: WritingError | null;
  strokeIndex: number | null;
  expected: number;
  drawn: number;
}

/** How an answer was judged: by the app from a drawing, or by the learner. */
export interface AttemptDetail {
  checked: boolean;
  /** One per character when `checked`; otherwise `null`. */
  writing: WritingResult[] | null;
}

export const SELF_GRADED: AttemptDetail = { checked: false, writing: null };

/**
 * Append-only, one per answer, from any session — the journal and the
 * statistics read this. `reviews` stays the scheduler's own history (exact
 * undo); a scheduled answer writes both, under the same id.
 */
export interface Attempt extends AttemptDetail {
  /** The review's id for a scheduled answer; a fresh uuid for practice. */
  id: string;
  itemId: string;
  cardId: string;
  /** The card's deck when the answer was given; a later move does not rewrite history. */
  deckId: string;
  mode: StudyMode;
  source: AttemptSource;
  grade: Grade;
  correct: boolean;
  at: number;
  durationMs: number;
}

/** A finished lesson or unit writing session (or one marked known at onboarding). */
export interface LessonProgress {
  /** The lesson id (`hsk1-u01-l1`) or the unit's writing session id (`hsk1-u01-writing`). */
  id: string;
  bundle: Bundle;
  kind: 'lesson' | 'writing';
  completedAt: number;
  right: number;
  total: number;
  /** Marked by the onboarding level choice rather than done; it does not count towards the daily goal. */
  known: boolean;
  updatedAt: number;
}

export interface OutboxEntry {
  id: string;
  entity: 'deck' | 'card' | 'item' | 'review' | 'attempt' | 'lessonProgress';
  entityId: string;
  op: 'put' | 'delete';
  at: number;
}

export function itemId(cardId: string, dir: Direction): string {
  return `${cardId}:${dir}`;
}
