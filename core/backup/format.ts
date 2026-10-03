/**
 * The backup file Settings › Data exports and restores. Pure: no Dexie, no
 * file I/O — `core/db/backup.ts` reads and writes the database, and
 * `useBackup` gets the file in and out of the device.
 */
import type { Attempt, Card, Deck, Item, Review } from '~core/db/schema';
import type { Settings } from '~core/db/settings';

export interface BackupData {
  decks: Deck[];
  cards: Card[];
  items: Item[];
  reviews: Review[];
  attempts: Attempt[];
}

export interface Backup extends BackupData {
  format: 'fanka-backup';
  version: 1;
  exportedAt: number;
  settings: Settings;
}

export type ParsedBackup = { ok: true; backup: Backup } | { ok: false; error: string };

const TABLES = ['decks', 'cards', 'items', 'reviews', 'attempts'] as const;
const NOT_A_BACKUP = 'This file is not a Fanka backup.';

export function buildBackup(data: BackupData, settings: Settings, now: number): Backup {
  return { format: 'fanka-backup', version: 1, exportedAt: now, settings, ...data };
}

export function backupFileName(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `fanka-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

/** Checks the shape only as far as a restore needs: the stamp, each table, an id on every row. */
export function parseBackup(text: string): ParsedBackup {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: NOT_A_BACKUP };
  }
  if (typeof value !== 'object' || value === null || (value as { format?: unknown }).format !== 'fanka-backup') {
    return { ok: false, error: NOT_A_BACKUP };
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.version !== 'number' || candidate.version > 1) {
    return { ok: false, error: 'This backup comes from a newer Fanka. Update the app first.' };
  }
  const tablesOk = TABLES.every(
    (table) => Array.isArray(candidate[table]) && (candidate[table] as unknown[]).every((row) => typeof (row as { id?: unknown })?.id === 'string'),
  );
  if (!tablesOk || typeof candidate.settings !== 'object' || candidate.settings === null) {
    return { ok: false, error: 'This backup is damaged.' };
  }
  return { ok: true, backup: candidate as unknown as Backup };
}

function newer<T extends { id: string; updatedAt: number }>(local: T[], incoming: T[]): T[] {
  const byId = new Map(local.map((row) => [row.id, row]));
  return incoming.filter((row) => {
    const existing = byId.get(row.id);
    return !existing || row.updatedAt > existing.updatedAt;
  });
}

function absent<T extends { id: string }>(local: T[], incoming: T[]): T[] {
  const ids = new Set(local.map((row) => row.id));
  return incoming.filter((row) => !ids.has(row.id));
}

/**
 * The rows a restore writes: decks, cards and items when missing here or
 * newer in the backup; reviews and attempts are history, insert-only, added
 * when their id is missing.
 */
export function mergePlan(local: BackupData, backup: BackupData): BackupData {
  return {
    decks: newer(local.decks, backup.decks),
    cards: newer(local.cards, backup.cards),
    items: newer(local.items, backup.items),
    reviews: absent(local.reviews, backup.reviews),
    attempts: absent(local.attempts, backup.attempts),
  };
}
