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
  autoplayStrokes: boolean;
  audio: boolean;
  hanziFont: 'serif' | 'sans';
  theme: 'dark' | 'light' | 'auto';
  reminders: { enabled: boolean; hour: number; minute: number };
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
  autoplayStrokes: true,
  audio: true,
  hanziFont: 'serif',
  theme: 'dark',
  reminders: { enabled: true, hour: 19, minute: 0 },
  offlineStrokeCache: true,
};

const KEY = 'settings';

/**
 * Merged over the defaults on every read, so a release that adds a setting
 * does not need a migration and an older stored record stays valid.
 *
 * The top-level spread only merges one level deep, so `reminders` — the only
 * nested object today — is merged by hand below. If a second nested-object
 * setting is added, it needs the same manual treatment or the top-level
 * spread will silently replace it wholesale instead of filling in new keys.
 */
export async function loadSettings(): Promise<Settings> {
  const row = await db.settings.get(KEY);
  const stored = (row?.value ?? {}) as Partial<Settings>;
  return { ...DEFAULT_SETTINGS, ...stored, reminders: { ...DEFAULT_SETTINGS.reminders, ...stored.reminders } };
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
