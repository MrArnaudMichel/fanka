// Builds .cache/content/<bundle>-words.json from the downloaded sources.
// Run `npm run content:fetch` first.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readXlsxRows } from './lib/xlsx.mjs';
import { parseCedict } from './lib/cedict.mjs';
import { hskWords } from './lib/hsk.mjs';
import { tbclWords } from './lib/tbcl.mjs';
import { wrongScriptCharactersIn } from './lib/core.mjs';

const cacheDir = path.resolve(import.meta.dirname, '../../.cache/content');
const read = (/** @type {string} */ name) => readFileSync(path.join(cacheDir, name));

/** A bundle may lose at most this share of its words to the script guard. */
const MAX_EXCLUDED = 0.01;

/**
 * Words whose hanzi or variants hold a character of the wrong script are left
 * out, listed in <bundle>-excluded.json and warned about; too many fail the build.
 * @param {'mainland' | 'taiwan'} bundle
 * @param {ReturnType<typeof hskWords>} words
 */
function guardAndWrite(bundle, words) {
  const kept = [];
  const excluded = [];
  for (const word of words) {
    const wrong = [word.hanzi, ...(word.variants ?? [])].flatMap((t) => wrongScriptCharactersIn(t, bundle));
    if (wrong.length > 0) excluded.push({ id: word.id, hanzi: word.hanzi, variants: word.variants, wrong: [...new Set(wrong)] });
    else kept.push(word);
  }
  writeFileSync(path.join(cacheDir, `${bundle}-excluded.json`), JSON.stringify(excluded, null, 2));
  if (excluded.length > 0) {
    console.warn(`${bundle}: ${excluded.length} word(s) excluded for wrong-script characters:`);
    for (const e of excluded) console.warn(`  ${e.id} ${e.hanzi} (${e.wrong.join('')})`);
  }
  if (excluded.length > words.length * MAX_EXCLUDED) {
    throw new Error(`${bundle}: ${excluded.length} of ${words.length} words fail the script guard (limit ${MAX_EXCLUDED * 100}%)`);
  }
  writeFileSync(path.join(cacheDir, `${bundle}-words.json`), JSON.stringify(kept, null, 2));
  const perLevel = new Map();
  for (const w of kept) perLevel.set(w.level, (perLevel.get(w.level) ?? 0) + 1);
  const needs = kept.filter((w) => w.needsMeaning).length;
  console.log(`${bundle}: ${kept.length} words`, Object.fromEntries([...perLevel].sort((a, b) => a[0] - b[0])), `needsMeaning ${needs}`);
}

const hsk = JSON.parse(read('hsk-complete.json').toString('utf8'));
guardAndWrite('mainland', hskWords(hsk));

const tbclRows = readXlsxRows(read('tbcl.xlsx'));
const cedict = parseCedict(read('cedict.txt').toString('utf8'));
guardAndWrite('taiwan', tbclWords(tbclRows, cedict));
