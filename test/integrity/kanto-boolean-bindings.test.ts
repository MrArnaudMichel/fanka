import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const APP = join(ROOT, 'app');

interface Manifest {
  modules: { declarations?: { tagName?: string; attributes?: { name: string; fieldName?: string; type?: { text?: string } }[] }[] }[];
}

/**
 * Kanto's boolean attributes whose name has a hyphen. Bound dynamically as
 * `:full-width="x"`, Vue finds no `full-width` property on the element and
 * sets the attribute instead — `full-width="false"` — which Lit reads as
 * true, since a boolean attribute is true whenever it is present. The
 * camelCase binding (`:fullWidth`) is set as a property and works.
 */
function hyphenatedBooleans(): Map<string, string> {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'node_modules/kanto-ds/dist/custom-elements.json'), 'utf-8')) as Manifest;
  const found = new Map<string, string>();
  for (const mod of manifest.modules) {
    for (const decl of mod.declarations ?? []) {
      if (!decl.tagName) continue;
      for (const attr of decl.attributes ?? []) {
        if (attr.name.includes('-') && /\bboolean\b/.test(attr.type?.text ?? '') && attr.fieldName) found.set(attr.name, attr.fieldName);
      }
    }
  }
  return found;
}

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return vueFiles(path);
    return path.endsWith('.vue') ? [path] : [];
  });
}

describe('Kanto boolean bindings', () => {
  it('finds the hyphenated boolean attributes to guard', () => {
    expect(hyphenatedBooleans().get('full-width')).toBe('fullWidth');
  });

  it('never binds a hyphenated Kanto boolean dynamically', () => {
    const booleans = hyphenatedBooleans();
    const offenders: string[] = [];
    for (const file of vueFiles(APP)) {
      const template = /<template>([\s\S]*)<\/template>/.exec(readFileSync(file, 'utf-8'))?.[1] ?? '';
      for (const [attr, field] of booleans) {
        if (new RegExp(`(?:\\s:|v-bind:)${attr}=`).test(template)) offenders.push(`${relative(ROOT, file)}: :${attr} → use :${field}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
