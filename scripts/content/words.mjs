// Builds .cache/content/<bundle>-words.json from the downloaded sources.
// Run `npm run content:fetch` first.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readXlsxRows } from './lib/xlsx.mjs';
import { parseCedict } from './lib/cedict.mjs';
import { hskWords } from './lib/hsk.mjs';
import { tbclReadingLevels, tbclWords } from './lib/tbcl.mjs';
import { guardScript } from './lib/guard.mjs';
import { syllableMismatches } from './lib/order.mjs';

const cacheDir = path.resolve(import.meta.dirname, '../../.cache/content');
const read = (/** @type {string} */ name) => readFileSync(path.join(cacheDir, name));

/** A bundle may lose at most this share of its words to the script guard. */
const MAX_EXCLUDED = 0.01;

/**
 * Script guard (see lib/guard.mjs): a failing variant is dropped, a word whose
 * headword fails is left out, listed in <bundle>-excluded.json and warned
 * about; too many fail the build, and so does any reading without one
 * syllable per Han character.
 * @param {'mainland' | 'taiwan'} bundle
 * @param {ReturnType<typeof hskWords>} words
 */
function guardAndWrite(bundle, words) {
  const mismatches = syllableMismatches(words);
  if (mismatches.length > 0) {
    throw new Error(`${bundle}: ${mismatches.length} reading(s) without one syllable per character:\n  ${mismatches.join('\n  ')}`);
  }
  const { kept, excluded, droppedVariants } = guardScript(words, bundle);
  writeFileSync(path.join(cacheDir, `${bundle}-excluded.json`), JSON.stringify({ excluded, droppedVariants }, null, 2));
  for (const d of droppedVariants) console.warn(`  ${bundle} ${d.id}: variant ${d.variant} dropped (${d.wrong.join('')})`);
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

const tbclRows = readXlsxRows(read('tbcl.xlsx'));
const hsk = JSON.parse(read('hsk-complete.json').toString('utf8'));
// The Mainland ranking cross-checks its readings against TBCL's.
guardAndWrite('mainland', hskWords(hsk, { tbclReadings: tbclReadingLevels(tbclRows) }));

const cedict = parseCedict(read('cedict.txt').toString('utf8'));
guardAndWrite('taiwan', tbclWords(tbclRows, cedict));
