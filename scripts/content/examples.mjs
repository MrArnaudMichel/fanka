// Generates one example sentence per word (and meanings where missing) with a
// local model through Ollama. Resumable: results go to content/generated/<bundle>.jsonl.
// Never runs in CI. Usage:
//   node scripts/content/examples.mjs --bundle mainland|taiwan [--levels 1,2] [--limit N]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parsePinyin } from './lib/core.mjs';
import { checkExample, cleanHanzi } from './lib/check.mjs';
import { createOllama } from './lib/ollama.mjs';
import { openCache, TRANSPORT } from './lib/cache.mjs';
import { parseCedict } from './lib/cedict.mjs';

export const PROMPT_VERSION = 'v2';
/** Waits after each transport failure in a row; one more failure aborts the run. */
export const BACKOFF_MS = [5_000, 30_000, 120_000, 300_000];
const SAMPLE_SIZE = 400;

const SCRIPT_NAME = {
  mainland: 'Simplified Chinese as used in mainland China',
  taiwan: 'Traditional Chinese as used in Taiwan',
};

/** @param {string} s */
function parseJson(s) {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? v : null;
  } catch {
    const m = /\{[\s\S]*\}/.exec(s);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

/** Words of each level and below, as hanzi forms, cumulative by level. */
export function allowedByLevel(/** @type {any[]} */ words) {
  const levels = [...new Set(words.map((w) => w.level))].sort((a, b) => a - b);
  /** @type {Map<number, Set<string>>} */
  const map = new Map();
  const running = new Set();
  for (const level of levels) {
    for (const w of words) {
      if (w.level !== level) continue;
      for (const f of [w.hanzi, ...(w.variants ?? [])]) {
        const c = cleanHanzi(f);
        if (c) running.add(c);
      }
    }
    map.set(level, new Set(running));
  }
  return map;
}

/**
 * Numbered readings of each headword form: the first word's first reading
 * leads, then its other readings, then those of homograph words.
 */
export function readingLookup(/** @type {any[]} */ words) {
  /** @type {Map<string, string[]>} */
  const map = new Map();
  for (const w of words) {
    const list = (w.readings ?? []).map((/** @type {any} */ r) => r.pinyin).filter(Boolean);
    if (list.length === 0) continue;
    for (const f of [w.hanzi, ...(w.variants ?? [])]) {
      const c = cleanHanzi(f);
      if (!c) continue;
      const have = map.get(c) ?? [];
      for (const p of list) if (!have.includes(p)) have.push(p);
      map.set(c, have);
    }
  }
  return (/** @type {string} */ w) => map.get(w);
}

/** Single-character CC-CEDICT readings, numbered, for the bundle's script. */
export function charReadingLookup(/** @type {Map<string, any[]>} */ cedict, /** @type {'mainland'|'taiwan'} */ bundle) {
  return (/** @type {string} */ ch) => {
    const out = [];
    for (const e of cedict.get(ch) ?? []) {
      const own = bundle === 'mainland' ? e.simplified : e.traditional;
      if (own !== ch || e.pinyin.split(/\s+/).length !== 1) continue;
      if (!out.includes(e.pinyin)) out.push(e.pinyin);
    }
    return out;
  };
}

export function loadCedict(/** @type {string} */ root) {
  return parseCedict(readFileSync(path.join(root, '.cache/content/cedict.txt'), 'utf8'));
}

/** Up to SAMPLE_SIZE allowed words, the word's own level first. */
function sampleVocab(/** @type {any[]} */ words, /** @type {any} */ word) {
  const own = words.filter((w) => w.level === word.level && w.id !== word.id);
  const lower = words.filter((w) => w.level < word.level);
  const shuffle = (/** @type {any[]} */ a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  return [...shuffle(own), ...shuffle(lower)]
    .slice(0, SAMPLE_SIZE)
    .map((w) => cleanHanzi(w.hanzi))
    .filter(Boolean);
}

const reading = (/** @type {any} */ word) =>
  parsePinyin(word.readings[0].pinyin).map((s) => s.text).join(' ');

function examplePrompt(/** @type {any} */ word, /** @type {any[]} */ words, /** @type {string} */ bundle, /** @type {string[]} */ meanings) {
  return [
    `Write one example sentence for a Chinese learner using the word ${cleanHanzi(word.hanzi)} (reading: ${reading(word)}; meaning: ${meanings.join('; ')}).`,
    `Write in ${SCRIPT_NAME[bundle]}. The word is at level ${word.level}.`,
    `Use mostly words from this list, and no other rare words: ${sampleVocab(words, word).join(' ')}`,
    'The sentence must be one natural sentence of 4 to 20 characters, and must contain the word exactly as written.',
    'Reply with JSON only, with these fields:',
    '"text" (the sentence), "pinyin" (with tone marks on every syllable, never plain letters, exactly one syllable per Chinese character, space separated, no punctuation), "translation" (English).',
  ].join('\n');
}

function meaningPrompt(/** @type {any} */ word, /** @type {string} */ bundle) {
  return [
    `Give 1 to 3 short English glosses for the word ${cleanHanzi(word.hanzi)} (reading: ${reading(word)}), written in ${SCRIPT_NAME[bundle]}.`,
    'Reply with JSON only, with one field: "meanings" (an array of short English glosses).',
  ].join('\n');
}

/**
 * @param {any[]} words
 * @param {{ bundle: 'mainland'|'taiwan', client: { chat(p: string): Promise<string> }, cache: ReturnType<typeof openCache>, promptVersion: string, attempts: number, limit?: number, levels?: number[], charReadings?: (ch: string) => string[] | undefined, sleep?: (ms: number) => Promise<void>, onRetry?: (message: string, waitMs: number) => void, onProgress?: (done: number, total: number) => void }} opts
 */
export async function generate(words, opts) {
  const { bundle, client, cache, promptVersion, attempts, limit, levels, onProgress, charReadings } = opts;
  const sleep = opts.sleep ?? ((/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let consecutive = 0;
  /**
   * Counts a transport failure and backs off (an Ollama restart refuses
   * connections for a while); one more in a row than BACKOFF_MS has steps
   * aborts the run.
   */
  const transportFailed = async (/** @type {unknown} */ e) => {
    consecutive += 1;
    const wait = BACKOFF_MS[consecutive - 1];
    if (wait === undefined) {
      throw new Error(`Stopped: ${consecutive} transport failures in a row (${e instanceof Error ? e.message : String(e)}). Is Ollama running? Run again to resume.`);
    }
    opts.onRetry?.(e instanceof Error ? e.message : String(e), wait);
    await sleep(wait);
  };
  const byLevel = allowedByLevel(words);
  const readingOf = readingLookup(words);
  let todo = words.filter((w) => !cache.isDone(w.id, promptVersion) && !cache.hasExample(w.id) && (!levels || levels.includes(w.level)));
  if (limit !== undefined) todo = todo.slice(0, limit);
  let done = 0;
  for (const word of todo) {
    /** @type {any} */
    const rec = { id: word.id, v: promptVersion };
    let meanings = word.readings[0]?.meanings ?? [];
    if (word.needsMeaning) {
      /** @type {string[]} */
      let m = [];
      let transport = false;
      for (let attempt = 0; attempt < attempts && m.length === 0; attempt += 1) {
        try {
          const reply = parseJson(await client.chat(meaningPrompt(word, bundle)));
          consecutive = 0;
          m = Array.isArray(reply?.meanings)
            ? reply.meanings.filter((/** @type {any} */ x) => typeof x === 'string' && x.trim()).map((/** @type {string} */ x) => x.trim()).slice(0, 3)
            : [];
        } catch (e) {
          // Not a verdict on the word: leave it for a later run.
          transport = true;
          await transportFailed(e);
          break;
        }
      }
      // Without a meaning the word is not done, and its example is not
      // prompted (it would be prompted with no sense): a later run retries.
      if (transport || m.length === 0) continue;
      rec.meaning = m;
      meanings = m;
    }
    const allowed = byLevel.get(word.level) ?? new Set();
    /** @type {string[]} */
    const rejected = [];
    let transport = false;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const text = await client.chat(examplePrompt(word, words, bundle, meanings.slice(0, 3)));
        consecutive = 0;
        const reply = parseJson(text);
        if (!reply) {
          rejected.push('invalid JSON');
          continue;
        }
        const result = checkExample(reply, word, allowed, bundle, readingOf, charReadings);
        if (result.ok) {
          rec.example = {
            text: reply.text.trim(),
            pinyin: result.pinyin,
            translation: reply.translation.trim(),
            segments: result.segments,
            modelPinyin: result.modelPinyin,
          };
          break;
        }
        rejected.push(...result.reasons);
      } catch (e) {
        transport = true;
        rejected.push(`${TRANSPORT} ${e instanceof Error ? e.message : String(e)}`);
        await transportFailed(e);
      }
    }
    // A transport failure is not a verdict: write nothing so a resume retries.
    if (!rec.example && transport) continue;
    if (!rec.example) rec.rejected = rejected;
    cache.append(rec);
    done += 1;
    onProgress?.(done, todo.length);
  }
}

function arg(/** @type {string} */ name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const bundle = arg('bundle');
  if (bundle !== 'mainland' && bundle !== 'taiwan') {
    console.error('Usage: examples.mjs --bundle mainland|taiwan [--levels 1,2] [--limit N]');
    process.exit(1);
  }
  const root = path.resolve(import.meta.dirname, '../..');
  const words = JSON.parse(readFileSync(path.join(root, `.cache/content/${bundle}-words.json`), 'utf8'));
  const cache = openCache(path.join(root, `content/generated/${bundle}.jsonl`));
  const levels = arg('levels')?.split(',').map(Number);
  const limit = arg('limit') ? Number(arg('limit')) : undefined;
  const started = Date.now();
  try {
  await generate(words, {
    bundle,
    client: createOllama(),
    charReadings: charReadingLookup(loadCedict(root), bundle),
    cache,
    promptVersion: PROMPT_VERSION,
    attempts: 3,
    limit,
    levels,
    onRetry(message, waitMs) {
      console.warn(`Transport failure (${message}), retrying in ${waitMs / 1000} s`);
    },
    onProgress(done, total) {
      if (done % 50 !== 0 && done !== total) return;
      const rate = (Date.now() - started) / 1000 / done;
      const eta = Math.round(((total - done) * rate) / 60);
      console.log(`${done}/${total}  ${rate.toFixed(1)} s/word  ETA ${eta} min`);
    },
  });  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
