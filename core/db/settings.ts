import { db } from './db';
import type { Algorithm } from '~core/srs';

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
  /** Daily notification on the Android app; off until the learner allows notifications. */
  reminderEnabled: boolean;
  /** Local time of the daily reminder, "HH:MM". */
  reminderTime: string;
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
  reminderEnabled: false,
  reminderTime: '19:00',
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
