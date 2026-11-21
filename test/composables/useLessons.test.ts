import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import type { ContentIndex } from '~core/curriculum/types';
import type { Settings } from '~core/db/settings';
import { DEFAULT_SETTINGS } from '~core/db/settings';
import { db } from '~core/db/db';
import { lessonProgress } from '~core/db/repositories';

const settings = ref<Settings>({ ...DEFAULT_SETTINGS, bundle: 'taiwan', dailyLessons: 2 });
const index = ref<ContentIndex | null>(null);
const error = ref<string | null>(null);
const loadIndex = vi.fn();

vi.mock('../../app/composables/useSettings', () => ({ useSettings: () => ({ settings }) }));
vi.mock('../../app/composables/useContent', () => ({ useContent: () => ({ index, error, loadIndex, retry: vi.fn() }) }));

import { sectionsOf, useLessons } from '../../app/composables/useLessons';

const lesson = (id: string, unit: string) => ({ id, unit, wordIds: [`${id}-w`] });
const content: ContentIndex = {
  bundle: 'taiwan',
  version: 'v1',
  levels: [
    {
      level: 1,
      name: 'Taiwan 1',
      file: 'level-1.json',
      wordCount: 6,
      units: [
        { id: 'u1', lessonIds: ['l1', 'l2', 'l3'] },
        { id: 'u2', lessonIds: ['l4'] },
      ],
      lessons: [lesson('l1', 'u1'), lesson('l2', 'u1'), lesson('l3', 'u1'), lesson('l4', 'u2')],
    },
  ],
};

const row = (id: string, completedAt: number, known = false) => ({
  id, bundle: 'taiwan' as const, kind: 'lesson' as const, completedAt, right: 1, total: 1, known, updatedAt: completedAt,
});
// Watchers outlive a test unless their scope stops, and they share `settings`.
let scope = effectScope();
const mount = () => scope.run(() => useLessons())!;
afterEach(() => scope.stop());
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(async () => {
  scope = effectScope();
  await db.delete();
  await db.open();
  settings.value = { ...DEFAULT_SETTINGS, bundle: 'taiwan', dailyLessons: 2 };
  index.value = null;
  error.value = null;
  loadIndex.mockReset();
  loadIndex.mockImplementation(async () => {
    index.value = content;
  });
});

describe('useLessons', () => {
  it('marks done lessons and points at the first one not done', async () => {
    await lessonProgress.put(row('l1', Date.now() - 3 * 86_400_000));
    const l = mount();
    await flush();
    const unit = l.levels.value[0]!.units[0]!;
    expect(unit.lessons.map((x) => x.done)).toEqual([true, false, false]);
    expect(unit.writingDone).toBe(false);
    expect(l.next.value).toMatchObject({ kind: 'lesson', lesson: { id: 'l2' } });
  });

  it('suggests the unit writing once its lessons are done', async () => {
    for (const id of ['l1', 'l2', 'l3']) await lessonProgress.put(row(id, Date.now() - 3 * 86_400_000));
    const l = mount();
    await flush();
    expect(l.next.value).toMatchObject({ kind: 'writing', unit: { id: 'u1' } });
  });

  it('counts today’s lessons only, not those marked known', async () => {
    await lessonProgress.put(row('l1', Date.now()));
    await lessonProgress.put(row('l2', Date.now(), true));
    await lessonProgress.put(row('l3', Date.now() - 2 * 86_400_000));
    const l = mount();
    await flush();
    expect(l.todayCount.value).toBe(1);
    expect(l.goal.value).toBe(2);
  });

  it('reports a load failure and recovers on retry', async () => {
    loadIndex.mockImplementationOnce(async () => {
      error.value = 'boom';
    });
    const l = mount();
    await flush();
    expect(l.error.value).toBe('boom');
    expect(l.levels.value).toEqual([]);
    error.value = null;
    await l.retry();
    expect(l.error.value).toBeNull();
    expect(l.levels.value).toHaveLength(1);
  });

  it('reloads when the bundle changes', async () => {
    mount();
    await flush();
    settings.value = { ...settings.value, bundle: 'mainland' };
    await flush();
    expect(loadIndex.mock.calls.map((c) => c[0])).toEqual(['taiwan', 'mainland']);
  });
});

describe('useLessons precomputed labels', () => {
  it('numbers lessons and units per level and heads each section', async () => {
    const l = mount();
    await flush();
    const row = l.levels.value[0]!;
    expect(row.numbers.get('l4')).toBe(4);
    expect(row.unitNumbers.get('u2')).toBe(2);
    expect(row.sections).toHaveLength(1);
    expect(row.sections[0]!.heading).toBe('Lessons 1–4');
    expect(row.sections[0]!.units.map((u) => u.unit.id)).toEqual(['u1', 'u2']);
  });

  it('labels the next step the way Today shows it', async () => {
    const l = mount();
    await flush();
    expect(l.nextLabel.value).toBe('Lesson 1 · Taiwan 1');
    for (const id of ['l1', 'l2', 'l3']) await lessonProgress.put(row(id, Date.now() - 3 * 86_400_000));
    await l.retry();
    expect(l.nextLabel.value).toBe('Writing · unit 1');
  });

  it('drops the previous bundle’s done marks while the new one loads', async () => {
    await lessonProgress.put(row('l1', Date.now() - 3 * 86_400_000));
    const l = mount();
    await flush();
    expect(l.loaded.value).toBe(true);
    let release: () => void = () => {};
    loadIndex.mockImplementationOnce(() => new Promise<void>((resolve) => { release = () => { index.value = { ...content, bundle: 'mainland' }; resolve(); }; }));
    settings.value = { ...settings.value, bundle: 'mainland' };
    await flush();
    expect(l.loaded.value).toBe(false);
    release();
    await flush();
  });
});

describe('sectionsOf', () => {
  const unit = (n: number) => ({ unit: { id: `u${n}`, lessonIds: [] }, lessons: Array.from({ length: 3 }, (_, i) => ({ ref: lesson(`l${n}-${i}`, `u${n}`), done: false })), writingDone: false });
  it('keeps a short level whole and splits a long one at 50 lessons', () => {
    expect(sectionsOf([unit(1), unit(2)])).toHaveLength(1);
    const sections = sectionsOf(Array.from({ length: 40 }, (_, i) => unit(i)));
    expect(sections.map((s) => s.length)).toEqual([16, 16, 8]);
  });
});
