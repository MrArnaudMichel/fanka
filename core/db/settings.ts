import { db } from './db';
import type { Algorithm } from '~core/srs';

/** Kanto's accent presets (`data-accent`); violet is Kanto's own default. */
export const ACCENTS = ['violet', 'blue', 'teal', 'green', 'orange', 'pink', 'slate'] as const;
export type Accent = (typeof ACCENTS)[number];
/** Kanto's `data-text-size` values. */
export const TEXT_SIZES = ['small', 'default', 'large'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export interface Settings {
  algorithm: Algorithm;
  desiredRetention: number;
  newPerDay: number;
  maxInterval: number;
  showZhuyin: boolean;
  toneColors: boolean;
  hidePinyinUntilRevealed: boolean;
  /** Writing checks each stroke as it is drawn, instead of the whole character on Check. */
  strokeFeedback: boolean;
  /** Say the hanzi aloud when the answer is shown in Review and Writing. */
  autoPlayAudio: boolean;
  autoplayStrokes: boolean;
  hanziFont: 'serif' | 'sans';
  theme: 'dark' | 'light' | 'auto';
  /** Kanto accent preset, applied as `data-accent` on <html>. */
  accent: Accent;
  /** Kanto text size, applied as `data-text-size` on <html>. */
  textSize: TextSize;
  /** Reminders on the Android app; off until the learner allows notifications. */
  reminderEnabled: boolean;
  /** Local times of the reminders, "HH:MM", 1 to 4, sorted. */
  reminderTimes: string[];
  /** Weekdays the reminders fire, 0 = Sunday … 6 = Saturday. */
  reminderDays: number[];
  offlineStrokeCache: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  algorithm: 'FSRS',
  desiredRetention: 0.9,
  newPerDay: 15,
  maxInterval: 365,
  showZhuyin: false,
  toneColors: true,
  hidePinyinUntilRevealed: false,
  strokeFeedback: true,
  autoPlayAudio: false,
  autoplayStrokes: true,
  hanziFont: 'serif',
  theme: 'dark',
  accent: 'violet',
  textSize: 'default',
  reminderEnabled: false,
  reminderTimes: ['19:00'],
  reminderDays: [0, 1, 2, 3, 4, 5, 6],
  offlineStrokeCache: true,
};

const KEY = 'settings';

/**
 * Merged over the defaults on every read, so a release that adds a setting
 * does not need a migration and an older stored record stays valid. Stored
 * keys that are no longer settings are dropped. Settings are flat; a nested
 * setting would need a hand-written merge here.
 */
export async function loadSettings(): Promise<Settings> {
  const row = await db.settings.get(KEY);
  const stored = (row?.value ?? {}) as Partial<Settings>;
  const merged: Settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (key in stored) (merged as unknown as Record<string, unknown>)[key] = stored[key];
  }
  // Before reminderTimes, a single reminderTime was stored; carry it over once.
  const legacyTime = (stored as { reminderTime?: unknown }).reminderTime;
  if (!('reminderTimes' in stored) && typeof legacyTime === 'string') merged.reminderTimes = [legacyTime];
  // These two become attributes Kanto matches by value; an unknown one (an
  // edited record, a backup from elsewhere) would leave the page unstyled.
  if (!(ACCENTS as readonly string[]).includes(merged.accent)) merged.accent = DEFAULT_SETTINGS.accent;
  if (!TEXT_SIZES.includes(merged.textSize)) merged.textSize = DEFAULT_SETTINGS.textSize;
  return merged;
}

/**
 * Read-modify-write with no transaction: two update() calls fired close
 * together can both read the same base and the later put() wins, silently
 * dropping the earlier patch. Known and accepted for this phase — a settings
 * screen that applies multiple field changes should batch them into one
 * patch rather than call this once per field.
 */
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const merged = { ...(await loadSettings()), ...patch };
  await db.settings.put({ key: KEY, value: merged });
  return merged;
}
