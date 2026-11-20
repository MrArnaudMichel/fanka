# Content pipeline (phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every word of HSK (2025 exam syllabus) and the TBCL, with readings, English meanings, one checked example each where possible, cut into lessons and units, written as static JSON the app loads offline.

**Architecture:** Node scripts in `scripts/content/` (run by hand, never in CI) with their logic in pure, tested modules under `scripts/content/lib/`. Sources are downloaded at pinned versions into an untracked cache; generated examples go to a committed JSONL cache so a night of generation is never lost; assembly writes `public/content/<bundle>/`. Shared word types live in `core/curriculum/types.ts`.

**Tech Stack:** Node 22 (ESM, built-in fetch, `zlib`), Ollama HTTP API (`qwen3.5:latest`, 9B Q4_K_M), Vitest, `fflate` (new devDependency, MIT) to read the TBCL `.xlsx`.

**Spec:** `docs/superpowers/specs/2026-11-21-mainland-taiwan-curriculum-design.md` (phase 2 of 3)

## Global Constraints

- `core/curriculum` and `core/chinese` are pure (no Vue, Nuxt, Dexie, Capacitor).
- Bundles: Mainland = simplified, HSK, numbered pinyin; Taiwan = traditional, TBCL, numbered pinyin and zhuyin.
- Content is in its bundle's script, never mixed: assembly fails on any `wrongScriptCharactersIn(text, bundle)` hit in `hanzi`, `variants` or an example.
- Sources, pinned:
  - HSK: `https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/7ac65bf1a6387d35f1ade478906172a19311c7f9/complete.json` (MIT). Levels `newest-1` … `newest-7` (the 15 Nov 2025 exam syllabus; `newest-7` is the 7–9 band).
  - TBCL: `https://coct.naer.edu.tw/file/files/14452%E8%A9%9E%E8%AA%9E%E8%A1%A8202504.xlsx` (CC BY, 國家教育研究院《臺灣華語文能力基準》), checked by SHA-256 recorded on first download in `scripts/content/sources.json`.
  - CC-CEDICT: `https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz` (CC BY-SA 4.0), SHA-256 recorded the same way.
- Ids are stable: `hsk<level>-<nnnn>` / `tbcl<level>-<nnnn>` by order within the level (4 digits); HSK level 7 is `hsk7` and is named "HSK 7–9". Lesson ids `hsk1-l003`, unit ids `hsk1-u01`.
- Lessons of 10 words in level order; a last lesson under 5 words merges into the previous one. Units of 3 lessons; a last unit of 1 or 2 lessons stands alone.
- Example checks, all required: contains the word; script guard passes; every other segment of a greedy longest match against the allowed vocabulary (the bundle's words at the word's level and below, plus single Han characters that are themselves allowed words) is allowed, with at most one exception; 4 to 20 Han characters; one pinyin syllable per Han character. Up to 3 attempts.
- Generation never runs in CI or tests; tests use a fake Ollama client.
- Commits authored by Arnaud Michel alone; no AI trailer. All copy English.

## Review Focus

- A TBCL entry with variants and a matching number of readings (`爸爸/爸`, `bàba / bà`) → word `爸爸`, variant `爸`, the first reading only for the word. Test in Task 3.
- An Ollama reply that is not valid JSON, or a timeout → counted as a failed attempt, the run continues. Test in Task 4.
- An interrupted run restarted → no word is generated twice; the cache line written last is complete or absent (append whole lines only). Test in Task 4.
- A CC-CEDICT miss for a TBCL word → the word is kept with `needsMeaning`, and step 4 fills it; it never ships with an empty meaning list. Test in Tasks 3 and 4.
- A neutral tone in zhuyin (`˙ㄅㄚ`) → tone 5. Test in Task 1.

---

### Task 1: Zhuyin to pinyin, and the content types

**Files:**
- Modify: `core/chinese/zhuyin.ts`
- Create: `core/curriculum/types.ts`
- Test: `test/chinese/zhuyin.test.ts`

**Interfaces:**
- Produces: `fromZhuyin(zhuyin: string): PinyinSyllable[]` (syllables separated by spaces; tone marks ˊˇˋ, `˙` prefix = 5, none = 1; throws on an unknown syllable naming it).
- Produces in `core/curriculum/types.ts`:

```ts
export type Bundle = 'mainland' | 'taiwan'; // re-export of core/chinese/script's
export interface Reading { pinyin: string /* numbered, space-separated: "ba4 ba5" */; zhuyin?: string; meanings: string[] }
export interface Example { text: string; pinyin: string; translation: string; segments: string[] }
export interface Word { id: string; hanzi: string; variants?: string[]; readings: Reading[]; pos?: string; level: number; lesson: string; example?: Example }
export interface LessonRef { id: string; unit: string; wordIds: string[] }
export interface UnitRef { id: string; lessonIds: string[] }
export interface LevelRef { level: number; name: string; file: string; units: UnitRef[]; lessons: LessonRef[]; wordCount: number }
export interface ContentIndex { bundle: Bundle; version: string; levels: LevelRef[] }
```

- [ ] **Step 1: Failing tests**

```ts
it('reads zhuyin back as numbered pinyin', () => {
  expect(toNumbered(fromZhuyin('ㄅㄚˋ ˙ㄅㄚ'))).toBe('ba4 ba5');
  expect(toNumbered(fromZhuyin('ㄞˋ'))).toBe('ai4');
  expect(toNumbered(fromZhuyin('ㄗㄨㄛˋ ㄗ'))).toBe('zuo4 zi1');
  expect(toNumbered(fromZhuyin('ㄋㄩˇ'))).toBe('nü3');
});
it('round-trips every syllable toZhuyin knows', () => { /* for each table entry, fromZhuyin(toZhuyin(s)) equals s for tones 1–5 */ });
it('names an unknown syllable', () => { expect(() => fromZhuyin('ㄅㄅ')).toThrow(/ㄅㄅ/); });
```

- [ ] **Step 2: Run, see them fail** — `npx vitest run test/chinese/zhuyin.test.ts`
- [ ] **Step 3: Implement** `fromZhuyin` by inverting the table `toZhuyin` already uses; add the types file.
- [ ] **Step 4: Run** — `npm test && npm run typecheck`. PASS.
- [ ] **Step 5: Commit** — `Read zhuyin back as pinyin and define the content types`

### Task 2: Sources, fetched and pinned

**Files:**
- Create: `scripts/content/fetch.mjs`, `scripts/content/sources.json`, `scripts/content/lib/xlsx.mjs`, `scripts/content/lib/cedict.mjs`
- Modify: `package.json` (devDependency `fflate`; script `"content:fetch": "node scripts/content/fetch.mjs"`), `.gitignore` (`.cache/`)
- Test: `test/scripts/content/xlsx.test.ts`, `test/scripts/content/cedict.test.ts`

**Interfaces:**
- Produces: `.cache/content/hsk-complete.json`, `.cache/content/tbcl.xlsx`, `.cache/content/cedict.txt`.
- `readXlsxRows(buffer: Uint8Array): string[][]` (first sheet, shared strings resolved, empty cells as `''`, row order kept).
- `parseCedict(text: string): Map<string, CedictEntry[]>` keyed by traditional and by simplified, `CedictEntry = { traditional; simplified; pinyin /* numbered lower-case, u: → ü */; meanings: string[] }`; comment lines skipped; `/`-separated meanings.

- [ ] **Step 1: Failing tests** — `readXlsxRows` on a tiny xlsx fixture built in the test with fflate (two rows, one shared string, one empty cell); `parseCedict` on three lines including `#` comment, `lu:4`, and a word whose traditional and simplified differ.
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement.** `fetch.mjs` downloads each source to `.cache/content/` unless present, computes SHA-256, writes it into `sources.json` when missing and fails with both hashes when it differs. Gunzip CC-CEDICT with `zlib`.
- [ ] **Step 4: Run** — tests, typecheck, then `npm run content:fetch` (real network) and commit the recorded hashes.
- [ ] **Step 5: Commit** — `Fetch the word lists and CC-CEDICT at pinned versions`

### Task 3: Words for both bundles

**Files:**
- Create: `scripts/content/words.mjs`, `scripts/content/lib/hsk.mjs`, `scripts/content/lib/tbcl.mjs`, `scripts/content/lib/order.mjs`
- Modify: `package.json` (`"content:words": "node scripts/content/words.mjs"`)
- Test: `test/scripts/content/hsk.test.ts`, `test/scripts/content/tbcl.test.ts`

**Interfaces:**
- Consumes: Task 1 types and `fromZhuyin`; Task 2 parsers; `wrongScriptCharactersIn` (core/chinese/script.ts).
- Produces: `.cache/content/<bundle>-words.json` — `Word[]` without `lesson` and `example`, plus `needsMeaning?: true`, ordered by level then in-level order, ids assigned.
- `hskWords(complete: unknown[]): Word[]`; `tbclWords(rows: string[][], cedict: Map<string, CedictEntry[]>): Word[]`.

Rules:
- HSK: entries with a `newest-n` level only; `hanzi` = `simplified`; `readings` from `forms[]` (pinyin from `transcriptions.numeric` lower-cased, meanings from `meanings`); in-level order by `frequency` ascending (missing last); an entry at several `newest-` levels keeps the lowest.
- TBCL: header row skipped; level = the digit in `ji` (第3級 → 3); `word` split on `/` → first is `hanzi`, the rest `variants`; `bopomofo` split on ` / ` → first part → `fromZhuyin` gives the pinyin, kept as `zhuyin` too; meanings from CC-CEDICT matched on traditional + pinyin (tone-insensitive fallback, then traditional only); none → `meanings: []` and `needsMeaning: true`. In-level order: `situation === '核心詞'` first, then `wfreq + sfreq` descending, then `id`.
- Duplicate hanzi within a bundle: kept once, at its lowest level.
- `words.mjs` fails listing every word whose `hanzi` or `variants` fail the script guard.

- [ ] **Step 1: Failing tests** — HSK: a two-form entry yields one word with two readings; `newest-2` before `newest-5` keeps level 2; frequency order. TBCL: the `爸爸/爸` row (`ㄅㄚˋ ˙ㄅㄚ / ㄅㄚˋ`) → `{ hanzi: '爸爸', variants: ['爸'], readings: [{ pinyin: 'ba4 ba5', zhuyin: 'ㄅㄚˋ ˙ㄅㄚ', … }] }`; core words first; CC-CEDICT miss → `needsMeaning`.
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — tests, typecheck, then `npm run content:words`; report the word count per level for each bundle and the `needsMeaning` count in the report.
- [ ] **Step 5: Commit** — `Normalise HSK and TBCL into words with readings and meanings`

### Task 4: Generated examples and missing meanings

**Files:**
- Create: `scripts/content/examples.mjs`, `scripts/content/lib/check.mjs`, `scripts/content/lib/segment.mjs`, `scripts/content/lib/ollama.mjs`, `scripts/content/lib/cache.mjs`
- Create (generated, committed): `content/generated/mainland.jsonl`, `content/generated/taiwan.jsonl`
- Modify: `package.json` (`"content:examples": "node scripts/content/examples.mjs"`)
- Test: `test/scripts/content/check.test.ts`, `test/scripts/content/segment.test.ts`, `test/scripts/content/examples.test.ts`

**Interfaces:**
- `segment(text: string, vocab: ReadonlySet<string>): string[]` — greedy longest match over Han runs; non-Han runs (punctuation, spaces) are separate segments; an unmatched Han character is its own segment.
- `checkExample(ex: { text; pinyin; translation }, word: Word, allowed: ReadonlySet<string>, bundle: Bundle): { ok: true; segments: string[] } | { ok: false; reasons: string[] }` — the constraint list in Global Constraints, each failing check one reason.
- `createOllama({ url = 'http://localhost:11434', model = 'qwen3.5:latest', timeoutMs = 60000 })` → `{ chat(prompt: string): Promise<string> }` (`/api/chat`, `stream: false`, `think: false`, `format: 'json'`, temperature 0.4).
- `generate(words: Word[], opts: { bundle; client; cache; promptVersion: string; attempts: 3; limit?: number; levels?: number[] })` — for each word without a cached result for `promptVersion`: up to 3 attempts; appends one JSON line per word `{ id, v, example? , meaning?, rejected?: string[] }`; never throws on a bad reply.
- CLI: `node scripts/content/examples.mjs --bundle mainland|taiwan [--levels 1,2] [--limit N]`; prints progress every 50 words with rate and ETA.

Prompts (`PROMPT_VERSION = 'v1'`), in English, asking for JSON only:
- Example: the word, its reading and meaning, the bundle's script ("Simplified Chinese as used in mainland China" / "Traditional Chinese as used in Taiwan"), the level, up to 400 allowed words sampled from the allowed vocabulary (the lesson's level first), "one natural sentence of 4 to 20 characters", fields `text`, `pinyin` (tone marks, one syllable per character, space separated), `translation`.
- Meaning (only `needsMeaning` words): fields `meanings` (1–3 short English glosses).

- [ ] **Step 1: Failing tests** — `segment('我的朋友很好。', vocab)` → `['我','的','朋友','很','好','。']`; `checkExample` rejects a sentence missing the word, one with a simplified character for Taiwan, one with two unknown words, one with 3 characters, one whose pinyin has a syllable too few; `generate` with a fake client that returns invalid JSON then a valid example writes one line with the example; a cached id is skipped; a word failing 3 times writes `rejected` reasons.
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement.** Pinyin returned with tone marks is converted to numbered with `parsePinyin` + `toNumbered`.
- [ ] **Step 4: Run** — tests and typecheck, then a real sample: `npm run content:examples -- --bundle mainland --levels 1` and `-- --bundle taiwan --levels 1`. Report acceptance rate, rate per word and 10 random accepted examples per bundle in the report.
- [ ] **Step 5: Commit** — `Generate and check one example per word with a local model` (with the two JSONL files).

### Task 5: Assembly, stroke data and credits

**Files:**
- Create: `scripts/content/assemble.mjs`, `scripts/content/lib/lessons.mjs`
- Create (generated, committed): `public/content/<bundle>/index.json`, `public/content/<bundle>/level-<n>.json`, `public/content/<bundle>/rejected.json`
- Modify: `scripts/build-stroke-data.mjs` (keep simplified-only characters too), `public/strokes/` (regenerated), `app/utils/licences.ts` (`CONTENT_SOURCES`), `app/pages/licences.vue`, `test/integrity/licences.test.ts` if needed, `package.json` (`"content:assemble"`, `"content": "npm run content:words && npm run content:assemble"`)
- Test: `test/scripts/content/lessons.test.ts`, `test/content/content.test.ts`

**Interfaces:**
- `cutLessons(levelWords: Word[], level: number, prefix: 'hsk' | 'tbcl'): { lessons: LessonRef[]; units: UnitRef[] }` — the lesson and unit rules from Global Constraints.
- Level names: Mainland `HSK 1` … `HSK 6`, `HSK 7–9`; Taiwan `Taiwan 1` … `Taiwan 7`.
- `version`: first 12 hex characters of the SHA-256 of the assembled level files.
- `CONTENT_SOURCES: { name; licence; url; notice }[]` shown on /licences under "Content": HSK vocabulary (drkameleon/complete-hsk-vocabulary, MIT), CC-CEDICT (CC BY-SA 4.0), 臺灣華語文能力基準 詞語表 (國家教育研究院, CC BY), example sentences (generated with Qwen3.5, Apache-2.0 model).

- [ ] **Step 1: Failing tests** — `cutLessons` on 23 words → lessons of 10 and 13 (last merges), one unit; on 64 words → 6 lessons (10×5 + 14), units of 3 and 3; `test/content/content.test.ts` reads the committed `public/content/*/index.json` and level files and asserts: every word id unique, every lesson's words exist, no `wrongScriptCharactersIn` hit, every word has at least one meaning, every example contains its word.
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement**; assembly takes examples and meanings from the JSONL cache (latest `v`), words without an example simply have none.
- [ ] **Step 4: Run** — `npm run content:assemble`, `node scripts/build-stroke-data.mjs`, then `npm test && npm run typecheck`. Report file sizes per bundle.
- [ ] **Step 5: Commit** — `Assemble lessons and units, build stroke data for both scripts, credit the sources`

## After the tasks

The full generation (`--bundle mainland` then `--bundle taiwan`, all levels; about 10 hours) is started in the background by the controller once Task 5 is committed. When it ends, `npm run content:assemble` and a commit `Generate examples for every level` land the result; until then the committed content has examples for level 1 only and the rest is assembled without examples.
