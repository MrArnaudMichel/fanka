import type { PinyinSyllable } from '~core/chinese/pinyin';
import type { Grade, SrsState } from '~core/srs';

export type Direction = 'recognition' | 'production';
export type PartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb' | 'phrase';

export interface Deck {
  id: string;
  name: string;
  description: string;
  colorToken: string;
  tag: string;
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
  before: SrsState;
}

export interface OutboxEntry {
  id: string;
  entity: 'deck' | 'card' | 'item' | 'review';
  entityId: string;
  op: 'put' | 'delete';
  at: number;
}

export function itemId(cardId: string, dir: Direction): string {
  return `${cardId}:${dir}`;
}
