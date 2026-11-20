#!/usr/bin/env node
/**
 * Builds public/strokes/ from the Make Me a Hanzi stroke data, vendored by
 * the `hanzi-writer-data` devDependency (Arphic Public License — the licence
 * is copied next to the output).
 *
 * One file per character, named by its code point in lower-case hex
 * (學 → 5b78.json): non-ASCII file names are fragile in APK assets and URLs.
 * Each file keeps only `strokes` and `medians`, which is all
 * core/chinese/strokes.ts reads. Both scripts are kept: Mainland content is
 * simplified, Taiwan content traditional.
 *
 * The output is committed, so builds never depend on this script.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const source = path.join(root, 'node_modules', 'hanzi-writer-data');
const target = path.join(root, 'public', 'strokes');

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

let written = 0;
for (const name of readdirSync(source)) {
  if (!name.endsWith('.json')) continue;
  const character = name.slice(0, -'.json'.length);
  if ([...character].length !== 1) continue;
  const { strokes, medians } = JSON.parse(readFileSync(path.join(source, name), 'utf8'));
  const file = `${character.codePointAt(0).toString(16)}.json`;
  writeFileSync(path.join(target, file), JSON.stringify({ strokes, medians }));
  written += 1;
}

copyFileSync(path.join(source, 'ARPHICPL.TXT'), path.join(target, 'ARPHICPL.TXT'));
console.log(`public/strokes: ${written} characters written`);
