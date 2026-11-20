import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { wrongScriptCharactersIn } from '../../core/chinese/script';
import type { Bundle, ContentIndex, Word } from '../../core/curriculum/types';

const root = path.resolve(__dirname, '..', '..', 'public', 'content');
const read = <T>(...parts: string[]): T => JSON.parse(readFileSync(path.join(root, ...parts), 'utf8')) as T;
const hanParts = (form: string) => form.split(/[^\p{Script=Han}]/u).filter(Boolean);

describe.each(['mainland', 'taiwan'] as Bundle[])('%s content', (bundle) => {
  const index = read<ContentIndex>(bundle, 'index.json');
  const levels = index.levels.map((l) => ({ ref: l, words: read<Word[]>(bundle, l.file) }));
  const all = levels.flatMap((l) => l.words);

  it('has an index for the bundle with a version', () => {
    expect(index.bundle).toBe(bundle);
    expect(index.version).toMatch(/^[0-9a-f]{12}$/);
    expect(existsSync(path.join(root, bundle, 'rejected.json'))).toBe(true);
  });

  it('has unique word ids', () => {
    expect(new Set(all.map((w) => w.id)).size).toBe(all.length);
  });

  it('lists lessons whose words exist, once, in their level', () => {
    for (const { ref, words } of levels) {
      const ids = new Set(words.map((w) => w.id));
      expect(ref.wordCount).toBe(words.length);
      const listed = ref.lessons.flatMap((l) => l.wordIds);
      expect(listed).toEqual(words.map((w) => w.id));
      expect(listed.every((id) => ids.has(id))).toBe(true);
      expect(ref.units.flatMap((u) => u.lessonIds)).toEqual(ref.lessons.map((l) => l.id));
      for (const w of words) expect(ref.lessons.find((l) => l.id === w.lesson)?.wordIds).toContain(w.id);
    }
  });

  it('keeps every word and example in the bundle script', () => {
    const wrong = all.flatMap((w) =>
      [w.hanzi, ...(w.variants ?? []), ...(w.example ? [w.example.text] : [])].flatMap((t) => wrongScriptCharactersIn(t, bundle)),
    );
    expect(wrong).toEqual([]);
  });

  it('gives every word a meaning', () => {
    expect(all.filter((w) => !w.readings.some((r) => r.meanings.length > 0)).map((w) => w.id)).toEqual([]);
  });

  it('has examples that contain their word', () => {
    const bad = all.filter(
      (w) => w.example && ![w.hanzi, ...(w.variants ?? [])].some((f) => hanParts(f).length > 0 && hanParts(f).every((p) => w.example!.text.includes(p))),
    );
    expect(bad.map((w) => w.id)).toEqual([]);
  });
});
