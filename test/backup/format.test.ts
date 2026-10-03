import { describe, expect, it } from 'vitest';
import { type BackupData, backupFileName, buildBackup, mergePlan, parseBackup } from '~core/backup/format';
import { DEFAULT_SETTINGS } from '~core/db/settings';

const empty = (): BackupData => ({ decks: [], cards: [], items: [], reviews: [], attempts: [] });
const deck = (id: string, updatedAt: number) => ({ id, updatedAt, deletedAt: null }) as never;
const review = (id: string) => ({ id, itemId: 'i', reviewedAt: 1 }) as never;

describe('buildBackup', () => {
  it('stamps the format, version and time', () => {
    const backup = buildBackup(empty(), DEFAULT_SETTINGS, 1000);
    expect(backup).toMatchObject({ format: 'fanka-backup', version: 1, exportedAt: 1000, settings: DEFAULT_SETTINGS, decks: [] });
  });
});

describe('backupFileName', () => {
  it('uses the local date', () => {
    expect(backupFileName(new Date(2026, 9, 3, 23, 30).getTime())).toBe('fanka-backup-2026-10-03.json');
  });
});

describe('parseBackup', () => {
  it('round-trips a built backup', () => {
    const backup = buildBackup({ ...empty(), decks: [deck('d1', 1)] }, DEFAULT_SETTINGS, 5);
    expect(parseBackup(JSON.stringify(backup))).toEqual({ ok: true, backup });
  });

  it('refuses text that is not JSON', () => {
    expect(parseBackup('{"format": "fanka-ba')).toEqual({ ok: false, error: 'This file is not a Fanka backup.' });
  });

  it('refuses JSON that is not a Fanka backup', () => {
    expect(parseBackup('{"hello": 1}')).toEqual({ ok: false, error: 'This file is not a Fanka backup.' });
  });

  it('refuses a backup from a newer version', () => {
    const future = { ...buildBackup(empty(), DEFAULT_SETTINGS, 5), version: 2 };
    expect(parseBackup(JSON.stringify(future))).toEqual({ ok: false, error: 'This backup comes from a newer Fanka. Update the app first.' });
  });

  it('refuses a backup with a missing table or a row without an id', () => {
    const { cards: _cards, ...noCards } = buildBackup(empty(), DEFAULT_SETTINGS, 5);
    expect(parseBackup(JSON.stringify(noCards)).ok).toBe(false);
    const badRow = { ...buildBackup(empty(), DEFAULT_SETTINGS, 5), decks: [{ name: 'x' }] };
    expect(parseBackup(JSON.stringify(badRow))).toEqual({ ok: false, error: 'This backup is damaged.' });
  });
});

describe('mergePlan', () => {
  it('writes rows missing locally and rows newer in the backup', () => {
    const local = { ...empty(), decks: [deck('d1', 10), deck('d2', 10)] };
    const backup = { ...empty(), decks: [deck('d1', 5), deck('d2', 20), deck('d3', 1)] };
    expect(mergePlan(local, backup).decks.map((d) => d.id)).toEqual(['d2', 'd3']);
  });

  it('only adds reviews and attempts whose id is absent', () => {
    const local = { ...empty(), reviews: [review('r1')] };
    const backup = { ...empty(), reviews: [review('r1'), review('r2')] };
    expect(mergePlan(local, backup).reviews.map((r) => r.id)).toEqual(['r2']);
  });
});
