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
    expect(await loadSession()).toBeNull();
  });

  it('round-trips a saved session', async () => {
    const session = { queueIds: ['a', 'b'], index: 1, startedAt: 1000, log: [{ reviewId: 'r1', itemId: 'a', grade: 3 as const }] };
    await saveSession(session);
    expect(await loadSession()).toEqual(session);
  });

  it('clearSession removes it', async () => {
    await saveSession({ queueIds: ['a'], index: 0, startedAt: 1000, log: [] });
    await clearSession();
    expect(await loadSession()).toBeNull();
  });

  // This runs on every app open (a review page restores on mount), so a
  // malformed or half-written record must degrade to "no session" rather
  // than throw and blank the screen.
  it('degrades to null rather than throwing on a completely malformed record', async () => {
    await db.settings.put({ key: 'session', value: { nonsense: true } });
    expect(await loadSession()).toBeNull();
  });

  it('degrades to null when queueIds is not an array', async () => {
    await db.settings.put({ key: 'session', value: { queueIds: 'oops', index: 0, startedAt: 1000, log: [] } });
    expect(await loadSession()).toBeNull();
  });

  it('degrades to null when index is missing', async () => {
    await db.settings.put({ key: 'session', value: { queueIds: ['a'], startedAt: 1000, log: [] } });
    expect(await loadSession()).toBeNull();
  });

  it('defaults a missing log to an empty array rather than rejecting the record', async () => {
    await db.settings.put({ key: 'session', value: { queueIds: ['a'], index: 0, startedAt: 1000 } });
    expect((await loadSession())?.log).toEqual([]);
  });
});
