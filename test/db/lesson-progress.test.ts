import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { lessonProgress } from '~core/db/repositories';
import type { LessonProgress } from '~core/db/schema';
import { runSync } from '~core/sync/engine';
import type { LocalChanges, RemoteChanges, SyncTransport } from '~core/sync/types';

const row = (id: string, over: Partial<LessonProgress> = {}): LessonProgress => ({
  id, bundle: 'mainland', kind: 'lesson', completedAt: 1000, right: 4, total: 5, known: false, updatedAt: 1000, ...over,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('lessonProgress', () => {
  it('puts a row, queues it for sync and lists done ids per bundle', async () => {
    await lessonProgress.put(row('hsk1-u01-l1'));
    await lessonProgress.put(row('tbcl1-u01-l1', { bundle: 'taiwan' }));
    expect([...(await lessonProgress.done('mainland'))]).toEqual(['hsk1-u01-l1']);
    expect([...(await lessonProgress.done('taiwan'))]).toEqual(['tbcl1-u01-l1']);
    expect((await db.outbox.toArray()).map((o) => `${o.entity}:${o.entityId}`).sort()).toEqual(['lessonProgress:hsk1-u01-l1', 'lessonProgress:tbcl1-u01-l1']);
  });

  it('replaces the row when a lesson is finished again', async () => {
    await lessonProgress.put(row('hsk1-u01-l1'));
    await lessonProgress.put(row('hsk1-u01-l1', { right: 5, completedAt: 2000, updatedAt: 2000 }));
    expect((await db.lessonProgress.get('hsk1-u01-l1'))?.right).toBe(5);
    expect(await db.lessonProgress.count()).toBe(1);
  });

  it('marks ids known without overwriting a finished lesson, and tells a writing session by its id', async () => {
    await lessonProgress.put(row('hsk1-u01-l1'));
    await lessonProgress.markKnown('mainland', ['hsk1-u01-l1', 'hsk1-u01-l2', 'hsk1-u01-writing'], 3000);
    expect(await db.lessonProgress.get('hsk1-u01-l1')).toMatchObject({ known: false, right: 4 });
    expect(await db.lessonProgress.get('hsk1-u01-l2')).toEqual({ id: 'hsk1-u01-l2', bundle: 'mainland', kind: 'lesson', completedAt: 3000, right: 0, total: 0, known: true, updatedAt: 3000 });
    expect((await db.lessonProgress.get('hsk1-u01-writing'))?.kind).toBe('writing');
    expect(await lessonProgress.done('mainland')).toEqual(new Set(['hsk1-u01-l1', 'hsk1-u01-l2', 'hsk1-u01-writing']));
  });

  it('counts only really done rows of the bundle since the given time', async () => {
    await lessonProgress.put(row('a', { completedAt: 500 }));
    await lessonProgress.put(row('b', { completedAt: 1500 }));
    await lessonProgress.put(row('c', { completedAt: 1600, kind: 'writing' }));
    await lessonProgress.put(row('d', { completedAt: 1700, bundle: 'taiwan' }));
    await lessonProgress.markKnown('mainland', ['e'], 1800);
    expect(await lessonProgress.countSince('mainland', 1000)).toBe(2);
    expect(await lessonProgress.countSince('taiwan', 1000)).toBe(1);
  });
});

describe('lesson progress sync', () => {
  it('pushes the current row and merges a remote one by updatedAt', async () => {
    const pushed: LocalChanges[] = [];
    const remote = row('hsk1-u01-l1', { right: 5, updatedAt: 5000 });
    const transport: SyncTransport = {
      pull: async (): Promise<RemoteChanges> => ({ decks: [], cards: [], items: [], reviews: [], attempts: [], lessonProgress: [remote], at: 9000 }),
      push: async (changes) => (pushed.push(changes), { at: 9000 }),
    };
    await lessonProgress.put(row('hsk1-u01-l1', { updatedAt: 1000 }));
    await lessonProgress.put(row('hsk1-u01-l2', { updatedAt: 1000 }));
    const result = await runSync(transport);
    expect(result.pulled.lessonProgress).toBe(1);
    expect(result.pushed.lessonProgress).toBe(2);
    expect((await db.lessonProgress.get('hsk1-u01-l1'))?.right).toBe(5);
    expect(pushed[0]!.lessonProgress.map((p) => p.id).sort()).toEqual(['hsk1-u01-l1', 'hsk1-u01-l2']);
    expect(await db.outbox.count()).toBe(0);
  });
});
