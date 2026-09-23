import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { clearSession, loadSession, saveSession } from '~core/db/session';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('session', () => {
  it('returns null when nothing is stored', async () => {
    expect(await loadSession('review')).toBeNull();
  });

  it('round-trips a saved session', async () => {
    const session = { queueIds: ['a', 'b'], index: 1, startedAt: 1000, log: [{ reviewId: 'r1', itemId: 'a', grade: 3 as const }] };
    await saveSession('review', session);
    expect(await loadSession('review')).toEqual(session);
  });

  it('clearSession removes it', async () => {
    await saveSession('review', { queueIds: ['a'], index: 0, startedAt: 1000, log: [] });
    await clearSession('review');
    expect(await loadSession('review')).toBeNull();
  });

  // This runs on every app open (a review page restores on mount), so a
  // malformed or half-written record must degrade to "no session" rather
  // than throw and blank the screen.
  it('degrades to null rather than throwing on a completely malformed record', async () => {
    await db.settings.put({ key: 'session:review', value: { nonsense: true } });
    expect(await loadSession('review')).toBeNull();
  });

  it('degrades to null when queueIds is not an array', async () => {
    await db.settings.put({ key: 'session:review', value: { queueIds: 'oops', index: 0, startedAt: 1000, log: [] } });
    expect(await loadSession('review')).toBeNull();
  });

  it('degrades to null when index is missing', async () => {
    await db.settings.put({ key: 'session:review', value: { queueIds: ['a'], startedAt: 1000, log: [] } });
    expect(await loadSession('review')).toBeNull();
  });

  it('defaults a missing log to an empty array rather than rejecting the record', async () => {
    await db.settings.put({ key: 'session:review', value: { queueIds: ['a'], index: 0, startedAt: 1000 } });
    expect((await loadSession('review'))?.log).toEqual([]);
  });

  it('keeps Review and Writing apart', async () => {
    await saveSession('review', { queueIds: ['a'], index: 0, startedAt: 1000, log: [] });
    await saveSession('writing', { queueIds: ['b', 'c'], index: 1, startedAt: 2000, log: [] });
    await clearSession('review');
    expect(await loadSession('review')).toBeNull();
    expect((await loadSession('writing'))?.queueIds).toEqual(['b', 'c']);
  });

  it('drops the mixed-direction session stored before the split', async () => {
    await db.settings.put({ key: 'session', value: { queueIds: ['a'], index: 0, startedAt: 1000, log: [] } });
    expect(await loadSession('review')).toBeNull();
    expect(await db.settings.get('session')).toBeUndefined();
  });
});
