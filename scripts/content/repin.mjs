// Rewrites the pinyin of every cached example from the word list (no model
// calls) and re-checks it; lines that now fail become `rejected`.
// Do not run while a generation is appending to the same file.
// Usage: node scripts/content/repin.mjs --bundle mainland|taiwan
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parsePinyin } from './lib/core.mjs';
import { checkExample } from './lib/check.mjs';
import { allowedByLevel, charReadingLookup, loadCedict, readingLookup } from './examples.mjs';

const i = process.argv.indexOf('--bundle');
const bundle = process.argv[i + 1];
if (bundle !== 'mainland' && bundle !== 'taiwan') {
  console.error('Usage: repin.mjs --bundle mainland|taiwan');
  process.exit(1);
}
const root = path.resolve(import.meta.dirname, '../..');
const words = JSON.parse(readFileSync(path.join(root, `.cache/content/${bundle}-words.json`), 'utf8'));
const byId = new Map(words.map((/** @type {any} */ w) => [w.id, w]));
const byLevel = allowedByLevel(words);
const readingOf = readingLookup(words);
const charReadings = charReadingLookup(loadCedict(root), bundle);
const file = path.join(root, `content/generated/${bundle}.jsonl`);

const neutral = (/** @type {string} */ p) => p.split(' ').every((s) => s.endsWith('5'));
let before = 0;
let after = 0;
let failed = 0;
let changed = 0;
const out = readFileSync(file, 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((line) => {
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      console.warn('skipping a corrupt line');
      return null;
    }
    const word = byId.get(rec.id);
    if (!rec.example || !word) return rec;
    if (neutral(rec.example.pinyin)) before += 1;
    // Records from before modelPinyin existed fall back to their stored pinyin.
    const modelPinyin = parsePinyin(rec.example.modelPinyin ?? rec.example.pinyin).map((s) => s.text).join(' ');
    const r = checkExample({ ...rec.example, pinyin: modelPinyin }, word, byLevel.get(word.level) ?? new Set(), bundle, readingOf, charReadings);
    if (r.ok) {
      if (r.pinyin !== rec.example.pinyin) changed += 1;
      rec.example = { ...rec.example, pinyin: r.pinyin, segments: r.segments };
      if (neutral(r.pinyin)) after += 1;
    } else {
      failed += 1;
      delete rec.example;
      rec.rejected = r.reasons;
    }
    return rec;
  })
  .filter(Boolean);
const tmp = `${file}.tmp`;
writeFileSync(tmp, out.map((/** @type {any} */ r) => `${JSON.stringify(r)}\n`).join(''));
renameSync(tmp, file);
console.log(`${bundle}: all-neutral examples before ${before}, after ${after}; newly rejected ${failed}; pinyin changed ${changed}`);
