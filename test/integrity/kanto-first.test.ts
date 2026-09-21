import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALLOWLIST } from './native-elements.allowlist';

const ROOT = join(__dirname, '..', '..');
const APP = join(ROOT, 'app');

/**
 * Native elements that Kanto has a component for, or that make a structure
 * Kanto owns. `a` is included because navigation goes through NuxtLink or a
 * Kanto navigation element; a raw anchor is almost always a recreation.
 */
const WATCHED = ['button', 'a', 'nav', 'table', 'input', 'select', 'textarea', 'dialog', 'ul', 'ol'];

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return vueFiles(path);
    return path.endsWith('.vue') ? [path] : [];
  });
}

/** The <template> block only — comments and scripts can mention tags freely. */
function template(source: string): string {
  const match = /<template>([\s\S]*)<\/template>/.exec(source);
  return (match?.[1] ?? '').replace(/<!--[\s\S]*?-->/g, '');
}

function nativeTags(source: string): string[] {
  const found: string[] = [];
  for (const tag of WATCHED) {
    const pattern = new RegExp(`<${tag}(\\s|>|/)`, 'g');
    if (pattern.test(template(source))) found.push(tag);
  }
  return found;
}

/**
 * A type-only import (`import type { Deck } from '~core/db/schema'`) is
 * erased at compile time — it never touches Dexie at runtime, so it is not
 * the kind of database access the "pages never touch Dexie directly" rule
 * is guarding against. Stripping whole `import type ... ;` statements first
 * (rather than only skipping lines that start with `import type`, which
 * would miss a statement wrapped across several lines) means a genuine,
 * non-type import from `~core/db` further down the file still gets caught.
 */
function stripsTypeOnlyImports(source: string): string {
  return source.replace(/^import\s+type\b[^;]*;?/gm, '');
}

const files = vueFiles(APP).map((path) => ({ path: relative(ROOT, path), source: readFileSync(path, 'utf8') }));

describe('Kanto first', () => {
  it('uses no native interactive or structural element without a listed reason', () => {
    const offending = files.flatMap(({ path, source }) =>
      nativeTags(source)
        .filter((tag) => !ALLOWLIST.some((e) => e.file === path && e.tag === tag))
        .map((tag) => `${path}: <${tag}>`),
    );
    expect(offending).toEqual([]);
  });

  it('has no allowlist entry that no longer matches anything', () => {
    const stale = ALLOWLIST.filter((entry) => {
      const file = files.find((f) => f.path === entry.file);
      return !file || !nativeTags(file.source).includes(entry.tag);
    }).map((e) => `${e.file}: <${e.tag}>`);
    expect(stale).toEqual([]);
  });

  it('keeps pages away from the database layer', () => {
    const pages = files.filter((f) => f.path.startsWith('app/pages/'));
    const leaking = pages
      .filter(
        (f) =>
          /from\s+['"]~core\/db/.test(stripsTypeOnlyImports(f.source)) ||
          // A dynamic `import('~core/db/...')` has no `from` clause, so it
          // would slip past the static-import check above, and there is no
          // type-only form of it to strip.
          /import\s*\(\s*['"]~core\/db/.test(f.source),
      )
      .map((f) => f.path);
    expect(leaking).toEqual([]);
  });
});
