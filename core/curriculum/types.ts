import type { Bundle } from '../chinese/script';

export type { Bundle };

export interface Reading {
  /** Numbered, space-separated: "ba4 ba5". */
  pinyin: string;
  zhuyin?: string;
  meanings: string[];
}

export interface Example {
  text: string;
  pinyin: string;
  translation: string;
  segments: string[];
}

export interface Word {
  id: string;
  hanzi: string;
  variants?: string[];
  readings: Reading[];
  pos?: string;
  level: number;
  lesson: string;
  example?: Example;
}

export interface LessonRef {
  id: string;
  unit: string;
  wordIds: string[];
}

export interface UnitRef {
  id: string;
  lessonIds: string[];
}

export interface LevelRef {
  level: number;
  name: string;
  file: string;
  units: UnitRef[];
  lessons: LessonRef[];
  wordCount: number;
}

export interface ContentIndex {
  bundle: Bundle;
  version: string;
  levels: LevelRef[];
}
