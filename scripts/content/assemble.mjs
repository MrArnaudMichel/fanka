// Assembles lessons, units and level files into public/content/<bundle>/ from
// the word lists (.cache/content/<bundle>-words.json) and the generated
// examples and meanings (content/generated/<bundle>.jsonl, read only: the
// generator may be appending to it while this runs).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { cleanHanzi } from './lib/check.mjs';
import { wrongScriptCharactersIn } from './lib/core.mjs';
import { cutLessons } from './lib/lessons.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const BUNDLES = /** @type {const} */ (['mainland', 'taiwan']);
const PREFIX = { mainland: 'hsk', taiwan: 'tbcl' };

/** @param {'mainland' | 'taiwan'} bundle @param {number} level */
export const levelName = (bundle, level) =>
  bundle === 'mainland' ? (level === 7 ? 'HSK 7–9' : `HSK ${level}`) : `Taiwan ${level}`;

/**
 * Latest accepted example (any version) and latest meaning per id. Only
 * complete lines count: a partial final line is ignored, nothing is written.
 * @param {string} file
 */
export function readGenerated(file) {
  /** @type {Map<string, { example?: any, meaning?: string[] }>} */
  const byId = new Map();
  if (!existsSync(file)) return byId;
  const text = readFileSync(file, 'utf8');
  const complete = text.slice(0, text.lastIndexOf('\n') + 1);
  for (const line of complete.split('\n')) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    const entry = byId.get(rec.id) ?? {};
    if (rec.example) entry.example = rec.example;
    if (Array.isArray(rec.meaning) && rec.meaning.length > 0) entry.meaning = rec.meaning;
    byId.set(rec.id, entry);
  }
  return byId;
}

/** @param {any} word */
function formsOf(word) {
  return [word.hanzi, ...(word.variants ?? [])];
}

/** The example contains the word (every Han part of one of its forms). */
function containsWord(/** @type {string} */ text, /** @type {any} */ word) {
  return formsOf(word).some((form) => {
    const parts = cleanHanzi(form) ? form.split(/[^\p{Script=Han}]/u).filter(Boolean) : [];
    return parts.length > 0 && parts.every((p) => text.includes(p));
  });
}

/**
 * @param {'mainland' | 'taiwan'} bundle
 * @param {any[]} words
 * @param {Map<string, { example?: any, meaning?: string[] }>} generated
 */
export function assembleBundle(bundle, words, generated) {
  const prefix = /** @type {'hsk' | 'tbcl'} */ (PREFIX[bundle]);
  /** @type {Array<{ id: string, hanzi: string, reason: string }>} */
  const rejected = [];
  /** @type {Map<number, any[]>} */
  const byLevel = new Map();
  for (const raw of words) {
    const { needsMeaning, ...word } = raw;
    const gen = generated.get(word.id);
    if (needsMeaning || word.readings.some((/** @type {any} */ r) => r.meanings.length === 0)) {
      if (!gen?.meaning) {
        rejected.push({ id: word.id, hanzi: word.hanzi, reason: 'no meaning yet' });
        continue;
      }
      word.readings = word.readings.map((/** @type {any} */ r) => (r.meanings.length ? r : { ...r, meanings: gen.meaning }));
    }
    const wrong = formsOf(word).flatMap((f) => wrongScriptCharactersIn(f, bundle));
    if (wrong.length) throw new Error(`${word.id} ${word.hanzi}: wrong script ${wrong.join('')}`);
    if (gen?.example) {
      const { text, pinyin, translation, segments } = gen.example;
      const bad = wrongScriptCharactersIn(text, bundle);
      if (bad.length) throw new Error(`${word.id} example: wrong script ${bad.join('')}`);
      if (containsWord(text, word)) word.example = { text, pinyin, translation, segments };
    }
    const list = byLevel.get(word.level) ?? [];
    list.push(word);
    byLevel.set(word.level, list);
  }

  const levelFiles = [];
  const levels = [];
  for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
    const levelWords = /** @type {any[]} */ (byLevel.get(level));
    const { lessons, units } = cutLessons(levelWords, level, prefix);
    const lessonOf = new Map(lessons.flatMap((l) => l.wordIds.map((id) => [id, l.id])));
    const out = levelWords.map((w) => ({ ...w, lesson: lessonOf.get(w.id) }));
    const file = `level-${level}.json`;
    levelFiles.push({ file, json: JSON.stringify(out) });
    levels.push({ level, name: levelName(bundle, level), file, units, lessons, wordCount: out.length });
  }
  const hash = createHash('sha256');
  for (const f of levelFiles) hash.update(f.json);
  const index = { bundle, version: hash.digest('hex').slice(0, 12), levels };
  return { index, levelFiles, rejected };
}

function main() {
  for (const bundle of BUNDLES) {
    const words = JSON.parse(readFileSync(path.join(root, '.cache', 'content', `${bundle}-words.json`), 'utf8'));
    const generated = readGenerated(path.join(root, 'content', 'generated', `${bundle}.jsonl`));
    const { index, levelFiles, rejected } = assembleBundle(bundle, words, generated);
    const dir = path.join(root, 'public', 'content', bundle);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const f of levelFiles) writeFileSync(path.join(dir, f.file), f.json);
    writeFileSync(path.join(dir, 'index.json'), `${JSON.stringify(index)}\n`);
    writeFileSync(path.join(dir, 'rejected.json'), `${JSON.stringify(rejected, null, 1)}\n`);
    for (const l of index.levels) {
      const lw = JSON.parse(levelFiles.find((f) => f.file === l.file)?.json ?? '[]');
      const withEx = lw.filter((/** @type {any} */ w) => w.example).length;
      console.log(`${bundle} ${l.name}: ${l.wordCount} words, ${l.lessons.length} lessons, ${l.units.length} units, examples ${withEx}`);
    }
    console.log(`${bundle}: version ${index.version}, ${rejected.length} left out`);
  }
}

if (import.meta.filename === process.argv[1]) main();
