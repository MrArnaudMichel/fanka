# Fanka Phase 1 — Foundation and the Learning Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working Fanka web app: seeded Traditional Chinese decks, a review
session driven by real FSRS scheduling, persisted to IndexedDB and resumable
across a reload.

**Architecture:** Nuxt 4 with SSR disabled, because Kanto's custom elements need
a DOM at definition time. Pure, dependency-free cores (`core/srs`,
`core/chinese`) built test-first; Dexie repositories over them; Vue composables
over those; pages that only render. No page ever touches Dexie or a scheduler
directly.

**Tech Stack:** Nuxt 4.5, Vue 3.5, TypeScript, Kanto 1.0.1 (from `file:../kanto`),
ts-fsrs 5.4, Dexie 4.4, Vitest 3 with happy-dom and fake-indexeddb, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-16-fanka-design.md`

## Phase map

This plan is Phase 1 of five. Each phase ends with software that runs and is
worth using; the next phase's detailed plan is written when this one lands, so
it can be informed by what the code actually became.

| Phase | Delivers |
| --- | --- |
| **1 (this plan)** | Scaffold, Kanto, the two pure cores, the database, seeded decks, the review loop, Today, the app shell |
| 2 | Collection: Decks, Deck detail, Browse, Add/Edit, Import (CSV / pasted / `.apkg`) |
| 3 | Statistics, Writing practice, full Settings, light/dark/auto |
| 4 | Capacitor Android, local notifications, haptics, PWA, debug APK |
| 5 | Supabase auth and sync, GitHub + Vercel, CI |

## Global Constraints

- **All copy is English.** UI strings, seed translations, code, comments, commit
  messages. Sentence case, terse, no emoji in product UI.
- **Commits are authored by Arnaud Michel alone.** No `Co-Authored-By` trailer,
  no AI attribution, in commits or PR descriptions. Verify with
  `git log -1 --format='%(trailers)'` — it must print nothing.
- **No hard-coded colour, size, duration or radius.** Everything resolves to a
  Kanto token. Prefer semantic aliases (`--surface-card`) over ramp steps
  (`--color-dark-16`). Apply type whole: `font: var(--font-normal-medium)`.
- **Kanto data goes in as properties, never attributes**, for anything that is
  not a string or boolean. Events are `kt-`-prefixed, payload in `detail`.
- **`ssr: false`** project-wide. Kanto elements are imported client-side only.
- **The core layers are pure.** `core/srs` and `core/chinese` import nothing
  from Vue, Nuxt, Dexie or Capacitor.
- **Node >= 20.** The repo uses Node 22.23.1.
- Traditional characters only in seed content (繁體字), never simplified.

---

### Task 1: Project scaffold, Kanto wiring, and the repo's rules

**Files:**
- Create: `package.json`, `nuxt.config.ts`, `tsconfig.json`, `vitest.config.ts`
- Create: `app/app.vue`, `app/plugins/kanto.client.ts`, `app/assets/css/fanka.css`
- Create: `CLAUDE.md`
- Test: `test/setup/kanto.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a Nuxt app where `<kt-*>` elements are compiled as custom elements
  and Kanto's tokens are loaded; `~/core/*` resolves to `core/*`.

- [ ] **Step 1: Scaffold the Nuxt project**

Run, from `~/WebstormProjects/fanka` (the directory already exists and is a git
repo with the spec committed — do not re-init it):

```bash
npx nuxi@latest init . --force --package-manager npm --no-install --no-gitInit
npm install
npm install kanto@file:../kanto ts-fsrs@^5.4.2 dexie@^4.4.6
npm install -D vitest@^3 @vue/test-utils happy-dom fake-indexeddb @nuxt/test-utils
```

- [ ] **Step 2: Configure Nuxt**

Write `nuxt.config.ts`:

```ts
import { isKantoElement } from 'kanto/vue';

export default defineNuxtConfig({
  compatibilityDate: '2026-09-16',
  // Kanto elements need a DOM at definition time. Under SSR they render
  // unstyled-but-present until the bundle lands; disabling SSR removes that
  // flash entirely. Nitro still serves /server/api.
  ssr: false,
  devtools: { enabled: true },
  css: ['kanto/styles.css', '~/assets/css/fanka.css'],
  vue: {
    compilerOptions: { isCustomElement: isKantoElement },
  },
  typescript: { strict: true, typeCheck: false },
  alias: { '~core': fileURLToPath(new URL('./core', import.meta.url)) },
});
```

Add at the top of the file: `import { fileURLToPath } from 'node:url';`

- [ ] **Step 3: Register the elements on the client only**

Write `app/plugins/kanto.client.ts`:

```ts
// Importing this module defines every kt-* custom element. It is a .client
// plugin because customElements does not exist on the server.
export default defineNuxtPlugin(async () => {
  await import('kanto/vue');
});
```

- [ ] **Step 4: Add the two application tokens Kanto does not carry**

Write `app/assets/css/fanka.css`. These are the only non-Kanto design values in
the codebase, and they exist because Kanto's token layer has no opinion on
Chinese typefaces:

```css
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;600&family=Noto+Sans+TC:wght@400;500&display=swap');

:root {
  --fk-font-hanzi-serif: 'Noto Serif TC', 'Songti TC', serif;
  --fk-font-hanzi-sans: 'Noto Sans TC', 'PingFang TC', sans-serif;
  --fk-font-hanzi: var(--fk-font-hanzi-serif);
}

:root[data-hanzi-font='sans'] {
  --fk-font-hanzi: var(--fk-font-hanzi-sans);
}

html,
body,
#__nuxt {
  margin: 0;
  padding: 0;
  min-height: 100%;
  background: var(--surface-page);
  color: var(--text-body);
  font: var(--font-normal-regular);
}

* {
  box-sizing: border-box;
}
```

- [ ] **Step 5: Configure Vitest**

Write `vitest.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: { '~core': fileURLToPath(new URL('./core', import.meta.url)) },
  },
});
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest",
"build:app": "nuxt generate"
```

- [ ] **Step 6: Write the failing test**

Write `test/setup/kanto.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isKantoElement } from 'kanto/vue';

describe('Kanto wiring', () => {
  it('recognises kt- tags as custom elements', () => {
    expect(isKantoElement('kt-button')).toBe(true);
    expect(isKantoElement('kt-card')).toBe(true);
  });

  it('does not claim ordinary tags', () => {
    expect(isKantoElement('div')).toBe(false);
    expect(isKantoElement('button')).toBe(false);
  });

  it('defines the elements when the vue entry is imported', async () => {
    await import('kanto/vue');
    expect(customElements.get('kt-button')).toBeTypeOf('function');
    expect(customElements.get('kt-card')).toBeTypeOf('function');
  });
});
```

- [ ] **Step 7: Run the test**

Run: `npm test -- test/setup/kanto.test.ts`
Expected: PASS. If `isKantoElement` is not exported, the `file:../kanto`
install did not resolve the `./vue` export — check that `../kanto/dist/vue/`
exists, and run `npm run build` inside `../kanto` if it does not.

- [ ] **Step 8: Write the repo's rules file**

Write `CLAUDE.md`:

```markdown
# Fanka

Spaced-repetition app for Traditional Chinese. Generic deck/scheduler core,
Chinese behaviour isolated in `core/chinese`.

Design spec: `docs/superpowers/specs/2026-09-16-fanka-design.md`

## Rules

- **Commits are authored by Arnaud Michel alone.** Never add a
  `Co-Authored-By` trailer or any AI attribution, to commits or PR bodies.
- **All copy is English**, sentence case, terse, no emoji in product UI.
- **Never hard-code a colour, size, duration or radius.** Use Kanto tokens, and
  prefer semantic aliases (`--surface-card`) over ramp steps.
- **Kanto data goes in as properties, not attributes**, for anything that is not
  a string or a boolean. Events are `kt-`-prefixed; the payload is in `detail`.
- `core/srs` and `core/chinese` are pure: no Vue, Nuxt, Dexie or Capacitor
  imports. They are tested first.
- Pages never touch Dexie or a scheduler directly — always through a composable.
- Traditional characters only in content. Never simplified.

## Commands

    npm run dev        # local
    npm test           # vitest
    npm run build      # Vercel target
    npm run build:app  # static bundle for Capacitor
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Set up the Nuxt project with Kanto wired in

SSR is off deliberately: Kanto ships custom elements that need a DOM at
definition time, and under SSR they render unstyled until the bundle
lands. Nitro still serves the API routes, so the Vercel target is intact.

The only design values declared outside Kanto are the two Chinese
typeface tokens, which its token layer has no opinion on."
git log -1 --format='%(trailers)'   # must print nothing
```

---

### Task 2: Pinyin — numbered and diacritic forms

**Files:**
- Create: `core/chinese/pinyin.ts`
- Test: `test/chinese/pinyin.test.ts`

**Interfaces:**
- Consumes: nothing. This module is pure and imports nothing.
- Produces:
  - `interface PinyinSyllable { text: string; tone: Tone }`
  - `type Tone = 1 | 2 | 3 | 4 | 5`
  - `parsePinyin(input: string): PinyinSyllable[]` — accepts either numbered
    (`xue2 xi2`) or diacritic (`xué xí`) input, returns diacritic `text`.
  - `toNumbered(syllables: PinyinSyllable[]): string`
  - `toDiacritic(syllable: string, tone: Tone): string`

Why this is worth testing first: it is the one place where a silent bug
corrupts data permanently. A mis-parsed tone is stored, synced, and never
noticed until the learner has memorised the wrong thing.

- [ ] **Step 1: Write the failing test**

Write `test/chinese/pinyin.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parsePinyin, toDiacritic, toNumbered } from '~core/chinese/pinyin';

describe('toDiacritic', () => {
  it('marks a single vowel', () => {
    expect(toDiacritic('ma', 1)).toBe('mā');
    expect(toDiacritic('ma', 3)).toBe('mǎ');
  });

  it('leaves the neutral tone unmarked', () => {
    expect(toDiacritic('ma', 5)).toBe('ma');
  });

  it('prefers a over every other vowel', () => {
    expect(toDiacritic('hao', 3)).toBe('hǎo');
    expect(toDiacritic('xiao', 4)).toBe('xiào');
  });

  it('prefers e when there is no a', () => {
    expect(toDiacritic('xue', 2)).toBe('xué');
    expect(toDiacritic('bei', 3)).toBe('běi');
  });

  it('marks the o in ou', () => {
    expect(toDiacritic('dou', 1)).toBe('dōu');
  });

  it('marks the last vowel otherwise', () => {
    expect(toDiacritic('shui', 3)).toBe('shuǐ');
    expect(toDiacritic('niu', 2)).toBe('niú');
  });

  it('handles u-umlaut written as v or u:', () => {
    expect(toDiacritic('lv', 4)).toBe('lǜ');
    expect(toDiacritic('nu:', 3)).toBe('nǚ');
  });
});

describe('parsePinyin', () => {
  it('parses numbered input', () => {
    expect(parsePinyin('xue2 xi2')).toEqual([
      { text: 'xué', tone: 2 },
      { text: 'xí', tone: 2 },
    ]);
  });

  it('treats a missing number as the neutral tone', () => {
    expect(parsePinyin('pian2 yi')).toEqual([
      { text: 'pián', tone: 2 },
      { text: 'yi', tone: 5 },
    ]);
  });

  it('parses diacritic input and reports its tones', () => {
    expect(parsePinyin('xué xí')).toEqual([
      { text: 'xué', tone: 2 },
      { text: 'xí', tone: 2 },
    ]);
  });

  it('collapses arbitrary whitespace', () => {
    expect(parsePinyin('  wo3   men  ')).toEqual([
      { text: 'wǒ', tone: 3 },
      { text: 'men', tone: 5 },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parsePinyin('   ')).toEqual([]);
  });
});

describe('round trip', () => {
  it('survives numbered to diacritic and back', () => {
    const cases = ['xue2 xi2', 'hao3', 'dou1', 'shui3', 'lv4', 'ma5', 'er2'];
    for (const input of cases) {
      const parsed = parsePinyin(input);
      expect(parsePinyin(toNumbered(parsed))).toEqual(parsed);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/chinese/pinyin.test.ts`
Expected: FAIL — `Failed to resolve import "~core/chinese/pinyin"`.

- [ ] **Step 3: Write the implementation**

Write `core/chinese/pinyin.ts`:

```ts
/**
 * Pinyin in two forms: numbered (`xue2`), which is what CSV exports and
 * keyboards produce, and diacritic (`xué`), which is what a learner reads.
 * Everything stored in Fanka is diacritic plus an explicit tone number, so
 * display never has to re-derive a tone and can colour it directly.
 */

export type Tone = 1 | 2 | 3 | 4 | 5;

export interface PinyinSyllable {
  text: string;
  tone: Tone;
}

const MARKS: Record<string, string> = {
  a: 'aāáǎà',
  e: 'eēéěè',
  i: 'iīíǐì',
  o: 'oōóǒò',
  u: 'uūúǔù',
  ü: 'üǖǘǚǜ',
};

/** Reverse lookup: a marked vowel back to its plain letter and its tone. */
const UNMARK = new Map<string, { plain: string; tone: Tone }>();
for (const [plain, row] of Object.entries(MARKS)) {
  for (let tone = 1; tone <= 4; tone += 1) {
    UNMARK.set(row[tone]!, { plain, tone: tone as Tone });
  }
}

function normaliseUmlaut(syllable: string): string {
  return syllable.replace(/u:/g, 'ü').replace(/v/g, 'ü');
}

/**
 * Where the mark goes, by the standard rule: an `a` or `e` always takes it;
 * in `ou` the `o` takes it; otherwise it falls on the last vowel.
 */
function markIndex(syllable: string): number {
  const a = syllable.indexOf('a');
  if (a >= 0) return a;
  const e = syllable.indexOf('e');
  if (e >= 0) return e;
  const ou = syllable.indexOf('ou');
  if (ou >= 0) return ou;
  for (let i = syllable.length - 1; i >= 0; i -= 1) {
    if (MARKS[syllable[i]!]) return i;
  }
  return -1;
}

export function toDiacritic(syllable: string, tone: Tone): string {
  const base = normaliseUmlaut(syllable.toLowerCase());
  if (tone === 5) return base;
  const at = markIndex(base);
  if (at < 0) return base;
  const row = MARKS[base[at]!]!;
  return base.slice(0, at) + row[tone] + base.slice(at + 1);
}

/** Strips any mark, returning the plain syllable and the tone it carried. */
function fromDiacritic(syllable: string): PinyinSyllable {
  let tone: Tone = 5;
  let plain = '';
  for (const ch of syllable) {
    const hit = UNMARK.get(ch);
    if (hit) {
      tone = hit.tone;
      plain += hit.plain;
    } else {
      plain += ch;
    }
  }
  return { text: toDiacritic(plain, tone), tone };
}

export function parsePinyin(input: string): PinyinSyllable[] {
  return input
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => {
      const numbered = /^(.*?)([1-5])$/.exec(token);
      if (numbered) {
        const tone = Number(numbered[2]) as Tone;
        return { text: toDiacritic(numbered[1]!, tone), tone };
      }
      return fromDiacritic(normaliseUmlaut(token.toLowerCase()));
    });
}

export function toNumbered(syllables: PinyinSyllable[]): string {
  return syllables
    .map(({ text, tone }) => {
      const { text: plain } = fromDiacritic(text);
      let bare = '';
      for (const ch of plain) {
        const hit = UNMARK.get(ch);
        bare += hit ? hit.plain : ch;
      }
      return `${bare}${tone}`;
    })
    .join(' ');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- test/chinese/pinyin.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add core/chinese/pinyin.ts test/chinese/pinyin.test.ts
git commit -m "Add pinyin parsing between numbered and diacritic forms

Stored pinyin is diacritic text plus an explicit tone number, so the UI
can colour a syllable without re-deriving its tone on every render, and
an import that arrives numbered is normalised once at the boundary.

Tested first because a mis-parsed tone is stored, synced and never
noticed until the learner has memorised the wrong thing."
```

---

### Task 3: Tones and zhuyin

**Files:**
- Create: `core/chinese/tones.ts`, `core/chinese/zhuyin.ts`
- Test: `test/chinese/tones.test.ts`, `test/chinese/zhuyin.test.ts`

**Interfaces:**
- Consumes: `Tone`, `PinyinSyllable` from `~core/chinese/pinyin`.
- Produces:
  - `toneColorToken(tone: Tone): string` — a `var(--…)` string.
  - `TONE_COLOR_TOKENS: Record<Tone, string>`
  - `toZhuyin(syllables: PinyinSyllable[]): string`

- [ ] **Step 1: Write the failing tone test**

Write `test/chinese/tones.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TONE_COLOR_TOKENS, toneColorToken } from '~core/chinese/tones';

describe('toneColorToken', () => {
  it('maps each tone to the semantic token the design specifies', () => {
    expect(toneColorToken(1)).toBe('var(--color-info-base)');
    expect(toneColorToken(2)).toBe('var(--color-success-base)');
    expect(toneColorToken(3)).toBe('var(--color-warning-base)');
    expect(toneColorToken(4)).toBe('var(--color-danger-base)');
    expect(toneColorToken(5)).toBe('var(--color-text-400)');
  });

  it('only ever returns Kanto tokens, never literal colours', () => {
    for (const value of Object.values(TONE_COLOR_TOKENS)) {
      expect(value).toMatch(/^var\(--[a-z0-9-]+\)$/);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- test/chinese/tones.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement tones**

Write `core/chinese/tones.ts`:

```ts
import type { Tone } from './pinyin';

/**
 * Tones borrow the semantic palette rather than introducing a sixth scale.
 * Rising is success, falling is danger, and the neutral tone recedes to muted
 * text — which also means the mapping survives a theme change for free.
 */
export const TONE_COLOR_TOKENS: Record<Tone, string> = {
  1: 'var(--color-info-base)',
  2: 'var(--color-success-base)',
  3: 'var(--color-warning-base)',
  4: 'var(--color-danger-base)',
  5: 'var(--color-text-400)',
};

export function toneColorToken(tone: Tone): string {
  return TONE_COLOR_TOKENS[tone] ?? TONE_COLOR_TOKENS[5];
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- test/chinese/tones.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing zhuyin test**

Write `test/chinese/zhuyin.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parsePinyin } from '~core/chinese/pinyin';
import { toZhuyin } from '~core/chinese/zhuyin';

describe('toZhuyin', () => {
  it('converts a two-syllable word', () => {
    expect(toZhuyin(parsePinyin('xue2 xi2'))).toBe('ㄒㄩㄝˊ ㄒㄧˊ');
  });

  it('leaves the first tone unmarked', () => {
    expect(toZhuyin(parsePinyin('can1 ting1'))).toBe('ㄘㄢ ㄊㄧㄥ');
  });

  it('marks the neutral tone with a leading dot', () => {
    expect(toZhuyin(parsePinyin('ma5'))).toBe('˙ㄇㄚ');
  });

  it('handles a zero-initial syllable', () => {
    expect(toZhuyin(parsePinyin('wo3'))).toBe('ㄨㄛˇ');
  });

  it('returns an empty string for no syllables', () => {
    expect(toZhuyin([])).toBe('');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -- test/chinese/zhuyin.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement zhuyin**

Write `core/chinese/zhuyin.ts`:

```ts
import { type PinyinSyllable, type Tone } from './pinyin';

/**
 * Zhuyin is optional in Fanka, but a deck imported from a pinyin source has
 * none, and a learner in Taiwan expects it. Converting is cheaper than asking
 * every import to carry it.
 */

const INITIALS: Array<[string, string]> = [
  ['zh', 'ㄓ'], ['ch', 'ㄔ'], ['sh', 'ㄕ'],
  ['b', 'ㄅ'], ['p', 'ㄆ'], ['m', 'ㄇ'], ['f', 'ㄈ'],
  ['d', 'ㄉ'], ['t', 'ㄊ'], ['n', 'ㄋ'], ['l', 'ㄌ'],
  ['g', 'ㄍ'], ['k', 'ㄎ'], ['h', 'ㄏ'],
  ['j', 'ㄐ'], ['q', 'ㄑ'], ['x', 'ㄒ'],
  ['r', 'ㄖ'], ['z', 'ㄗ'], ['c', 'ㄘ'], ['s', 'ㄙ'],
];

const FINALS: Array<[string, string]> = [
  ['iang', 'ㄧㄤ'], ['iong', 'ㄩㄥ'], ['uang', 'ㄨㄤ'], ['ueng', 'ㄨㄥ'],
  ['ang', 'ㄤ'], ['eng', 'ㄥ'], ['ian', 'ㄧㄢ'], ['iao', 'ㄧㄠ'],
  ['ing', 'ㄧㄥ'], ['ong', 'ㄨㄥ'], ['uai', 'ㄨㄞ'], ['uan', 'ㄨㄢ'],
  ['üan', 'ㄩㄢ'], ['üe', 'ㄩㄝ'], ['ün', 'ㄩㄣ'],
  ['ai', 'ㄞ'], ['ei', 'ㄟ'], ['ao', 'ㄠ'], ['ou', 'ㄡ'],
  ['an', 'ㄢ'], ['en', 'ㄣ'], ['er', 'ㄦ'],
  ['ia', 'ㄧㄚ'], ['ie', 'ㄧㄝ'], ['iu', 'ㄧㄡ'], ['in', 'ㄧㄣ'],
  ['ua', 'ㄨㄚ'], ['uo', 'ㄨㄛ'], ['ui', 'ㄨㄟ'], ['un', 'ㄨㄣ'],
  ['a', 'ㄚ'], ['o', 'ㄛ'], ['e', 'ㄜ'], ['i', 'ㄧ'], ['u', 'ㄨ'], ['ü', 'ㄩ'],
];

const TONE_MARKS: Record<Tone, string> = { 1: '', 2: 'ˊ', 3: 'ˇ', 4: 'ˋ', 5: '' };

/** Orthographic spellings that hide their real final. */
const REWRITES: Array<[RegExp, string]> = [
  [/^yi/, 'i'], [/^wu/, 'u'], [/^yu/, 'ü'],
  [/^y/, 'i'], [/^w/, 'u'],
  [/^([jqx])u/, '$1ü'],
];

function stripTone(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u0304\u030C]/g, '')
    .normalize('NFC');
}

function syllableToZhuyin(syllable: PinyinSyllable): string {
  let bare = stripTone(syllable.text).toLowerCase();
  for (const [pattern, replacement] of REWRITES) {
    bare = bare.replace(pattern, replacement);
  }

  // The three retroflex-plus-empty-rime syllables have no separate final.
  if (['zhi', 'chi', 'shi', 'ri', 'zi', 'ci', 'si'].includes(bare)) {
    bare = bare.slice(0, -1);
  }

  let out = '';
  for (const [pinyin, bopomofo] of INITIALS) {
    if (bare.startsWith(pinyin)) {
      out += bopomofo;
      bare = bare.slice(pinyin.length);
      break;
    }
  }
  for (const [pinyin, bopomofo] of FINALS) {
    if (bare === pinyin) {
      out += bopomofo;
      bare = '';
      break;
    }
  }

  const mark = TONE_MARKS[syllable.tone];
  return syllable.tone === 5 ? `˙${out}` : `${out}${mark}`;
}

export function toZhuyin(syllables: PinyinSyllable[]): string {
  return syllables.map(syllableToZhuyin).join(' ');
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npm test -- test/chinese/zhuyin.test.ts`
Expected: PASS, 5 tests. If a case fails, the mapping table is wrong — fix the
table, not the test.

- [ ] **Step 9: Commit**

```bash
git add core/chinese test/chinese
git commit -m "Map tones to semantic tokens and convert pinyin to zhuyin

Tones borrow the semantic palette instead of introducing a sixth colour
scale, so the mapping survives a theme change without a second table.

Zhuyin is derived rather than required at import: a deck exported from a
pinyin source has none, and a learner in Taiwan expects it."
```

---

### Task 4: The scheduler interface and FSRS

**Files:**
- Create: `core/srs/types.ts`, `core/srs/scheduler.ts`, `core/srs/fsrs.ts`
- Test: `test/srs/fsrs.test.ts`

**Interfaces:**
- Consumes: `ts-fsrs`.
- Produces:
  - `type Grade = 1 | 2 | 3 | 4` (Again, Hard, Good, Easy)
  - `type ItemState = 'new' | 'learning' | 'review' | 'relearning'`
  - `interface SrsState` — the persisted scheduling fields (below).
  - `interface SchedulerSettings { desiredRetention: number; maxInterval: number }`
  - `interface Scheduler { preview(state, now, settings): Record<Grade, SrsState>; apply(state, grade, now, settings): SrsState }`
  - `newSrsState(now: number): SrsState`
  - `createFsrsScheduler(): Scheduler`

- [ ] **Step 1: Write the types**

Write `core/srs/types.ts`:

```ts
/** Again, Hard, Good, Easy — the four buttons, and ts-fsrs' Rating values. */
export type Grade = 1 | 2 | 3 | 4;

export type ItemState = 'new' | 'learning' | 'review' | 'relearning';

/**
 * Everything the scheduler needs to decide the next interval, and nothing
 * else. Deliberately free of ids and card content so the scheduler stays a
 * pure function of scheduling state.
 *
 * `learningSteps` is round-tripped for ts-fsrs. Dropping it silently breaks
 * short-term scheduling the moment a session is resumed from storage.
 */
export interface SrsState {
  state: ItemState;
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  learningSteps: number;
  lastReview: number | null;
}

export interface SchedulerSettings {
  desiredRetention: number;
  maxInterval: number;
}

export interface Scheduler {
  /** All four outcomes, so a button can show what pressing it will do. */
  preview(state: SrsState, now: number, settings: SchedulerSettings): Record<Grade, SrsState>;
  apply(state: SrsState, grade: Grade, now: number, settings: SchedulerSettings): SrsState;
}

export const GRADES: Grade[] = [1, 2, 3, 4];
```

- [ ] **Step 2: Write the failing test**

Write `test/srs/fsrs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createFsrsScheduler } from '~core/srs/fsrs';
import { newSrsState } from '~core/srs/scheduler';
import { GRADES, type SchedulerSettings } from '~core/srs/types';

const NOW = Date.parse('2026-09-16T08:00:00Z');
const settings: SchedulerSettings = { desiredRetention: 0.9, maxInterval: 365 };
const scheduler = createFsrsScheduler();

describe('FSRS scheduler', () => {
  it('starts a card in the new state, due now', () => {
    const fresh = newSrsState(NOW);
    expect(fresh.state).toBe('new');
    expect(fresh.due).toBe(NOW);
    expect(fresh.reps).toBe(0);
  });

  it('previews all four grades', () => {
    const preview = scheduler.preview(newSrsState(NOW), NOW, settings);
    expect(Object.keys(preview).map(Number).sort()).toEqual([1, 2, 3, 4]);
  });

  it('orders the intervals: Again <= Hard <= Good <= Easy', () => {
    const state = { ...newSrsState(NOW), state: 'review' as const, stability: 12, difficulty: 5, reps: 9, due: NOW };
    const preview = scheduler.preview(state, NOW, settings);
    const dues = GRADES.map((g) => preview[g]!.due);
    expect(dues[0]).toBeLessThanOrEqual(dues[1]!);
    expect(dues[1]).toBeLessThanOrEqual(dues[2]!);
    expect(dues[2]).toBeLessThanOrEqual(dues[3]!);
  });

  it('applies exactly what it previewed — the button never lies', () => {
    const state = { ...newSrsState(NOW), state: 'review' as const, stability: 12, difficulty: 5, reps: 9 };
    const preview = scheduler.preview(state, NOW, settings);
    for (const grade of GRADES) {
      expect(scheduler.apply(state, grade, NOW, settings)).toEqual(preview[grade]);
    }
  });

  it('counts a lapse only on Again', () => {
    const state = { ...newSrsState(NOW), state: 'review' as const, stability: 12, difficulty: 5, reps: 9 };
    expect(scheduler.apply(state, 1, NOW, settings).lapses).toBe(1);
    expect(scheduler.apply(state, 3, NOW, settings).lapses).toBe(0);
  });

  it('increments reps on every grade', () => {
    const state = newSrsState(NOW);
    for (const grade of GRADES) {
      expect(scheduler.apply(state, grade, NOW, settings).reps).toBe(1);
    }
  });

  it('never schedules beyond the maximum interval', () => {
    const state = { ...newSrsState(NOW), state: 'review' as const, stability: 5000, difficulty: 1, reps: 90 };
    const capped = scheduler.apply(state, 4, NOW, { desiredRetention: 0.9, maxInterval: 30 });
    const days = (capped.due - NOW) / 86_400_000;
    expect(days).toBeLessThanOrEqual(30.001);
  });

  it('schedules sooner when a higher retention is demanded', () => {
    const state = { ...newSrsState(NOW), state: 'review' as const, stability: 20, difficulty: 5, reps: 10 };
    const relaxed = scheduler.apply(state, 3, NOW, { desiredRetention: 0.8, maxInterval: 365 });
    const strict = scheduler.apply(state, 3, NOW, { desiredRetention: 0.95, maxInterval: 365 });
    expect(strict.due).toBeLessThan(relaxed.due);
  });

  it('is deterministic — two identical calls agree', () => {
    const state = { ...newSrsState(NOW), state: 'review' as const, stability: 12, difficulty: 5, reps: 9 };
    expect(scheduler.apply(state, 3, NOW, settings)).toEqual(scheduler.apply(state, 3, NOW, settings));
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- test/srs/fsrs.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Write the shared helper**

Write `core/srs/scheduler.ts`:

```ts
import type { SrsState } from './types';

export function newSrsState(now: number): SrsState {
  return {
    state: 'new',
    due: now,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    learningSteps: 0,
    lastReview: null,
  };
}

export function isDue(state: SrsState, now: number): boolean {
  return state.due <= now;
}
```

- [ ] **Step 5: Implement the FSRS scheduler**

Write `core/srs/fsrs.ts`:

```ts
import { type Card, type FSRS, State, createEmptyCard, fsrs, generatorParameters } from 'ts-fsrs';

import type { Grade, ItemState, Scheduler, SchedulerSettings, SrsState } from './types';

/**
 * FSRS-6 via ts-fsrs, behind Fanka's own SrsState so that nothing outside this
 * file knows the library's snake_case shape or its Date-typed fields.
 *
 * Fuzz is disabled on purpose. It randomises the interval on each call, which
 * would make the preview on a grade button differ from what pressing it does.
 * A button that lies about its own consequence is worse than a marginally
 * less-spread review load.
 */

const STATE_TO_FSRS: Record<ItemState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const STATE_FROM_FSRS: Record<State, ItemState> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

function toCard(state: SrsState): Card {
  const empty = createEmptyCard(new Date(state.due));
  return {
    ...empty,
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    reps: state.reps,
    lapses: state.lapses,
    learning_steps: state.learningSteps,
    state: STATE_TO_FSRS[state.state],
    last_review: state.lastReview === null ? undefined : new Date(state.lastReview),
  };
}

function fromCard(card: Card): SrsState {
  return {
    state: STATE_FROM_FSRS[card.state],
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    learningSteps: card.learning_steps,
    lastReview: card.last_review ? card.last_review.getTime() : null,
  };
}

/**
 * ts-fsrs instances are cheap but not free, and the settings change rarely, so
 * one instance is kept per distinct settings pair.
 */
function instanceFor(settings: SchedulerSettings, cache: Map<string, FSRS>): FSRS {
  const key = `${settings.desiredRetention}:${settings.maxInterval}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const made = fsrs(
    generatorParameters({
      request_retention: settings.desiredRetention,
      maximum_interval: settings.maxInterval,
      enable_fuzz: false,
    }),
  );
  cache.set(key, made);
  return made;
}

export function createFsrsScheduler(): Scheduler {
  const cache = new Map<string, FSRS>();

  function preview(state: SrsState, now: number, settings: SchedulerSettings): Record<Grade, SrsState> {
    const outcomes = instanceFor(settings, cache).repeat(toCard(state), new Date(now));
    return {
      1: fromCard(outcomes[1].card),
      2: fromCard(outcomes[2].card),
      3: fromCard(outcomes[3].card),
      4: fromCard(outcomes[4].card),
    };
  }

  return {
    preview,
    // apply reads the same object preview does, so the two cannot drift.
    apply: (state, grade, now, settings) => preview(state, now, settings)[grade],
  };
}
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npm test -- test/srs/fsrs.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 7: Commit**

```bash
git add core/srs test/srs
git commit -m "Add the scheduler interface and an FSRS-6 implementation

SrsState keeps ts-fsrs' snake_case shape and Date fields out of the rest
of the codebase, and carries learning_steps, without which short-term
scheduling breaks as soon as a session is resumed from storage.

apply() reads the object preview() returns rather than recomputing, so
the interval on a grade button and the interval it produces cannot
drift. That is also why fuzz is off: a randomised interval would make
the button lie about its own consequence."
```

---

### Task 5: The SM-2 scheduler

**Files:**
- Create: `core/srs/sm2.ts`
- Test: `test/srs/sm2.test.ts`

**Interfaces:**
- Consumes: `Scheduler`, `SrsState`, `Grade` from `~core/srs/types`; `newSrsState` from `~core/srs/scheduler`.
- Produces: `createSm2Scheduler(): Scheduler`. `SrsState.difficulty` carries the
  SM-2 ease factor, so the two algorithms share one persisted shape.

- [ ] **Step 1: Write the failing test**

Write `test/srs/sm2.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newSrsState } from '~core/srs/scheduler';
import { createSm2Scheduler } from '~core/srs/sm2';
import { GRADES, type SchedulerSettings } from '~core/srs/types';

const NOW = Date.parse('2026-09-16T08:00:00Z');
const DAY = 86_400_000;
const settings: SchedulerSettings = { desiredRetention: 0.9, maxInterval: 365 };
const scheduler = createSm2Scheduler();

const reviewing = (over: Partial<ReturnType<typeof newSrsState>> = {}) => ({
  ...newSrsState(NOW),
  state: 'review' as const,
  difficulty: 2.5,
  scheduledDays: 10,
  reps: 5,
  ...over,
});

describe('SM-2 scheduler', () => {
  it('gives a new card one day on Good', () => {
    const next = scheduler.apply(newSrsState(NOW), 3, NOW, settings);
    expect(next.scheduledDays).toBe(1);
    expect(next.state).toBe('learning');
  });

  it('gives the second Good six days', () => {
    const second = { ...newSrsState(NOW), state: 'learning' as const, reps: 1, scheduledDays: 1, difficulty: 2.5 };
    expect(scheduler.apply(second, 3, NOW, settings).scheduledDays).toBe(6);
  });

  it('multiplies by the ease factor from the third review on', () => {
    const next = scheduler.apply(reviewing(), 3, NOW, settings);
    expect(next.scheduledDays).toBe(25); // round(10 * 2.5)
  });

  it('resets the interval and counts a lapse on Again', () => {
    const next = scheduler.apply(reviewing(), 1, NOW, settings);
    expect(next.scheduledDays).toBe(0);
    expect(next.lapses).toBe(1);
    expect(next.state).toBe('relearning');
  });

  it('lowers the ease on Hard and raises it on Easy', () => {
    expect(scheduler.apply(reviewing(), 2, NOW, settings).difficulty).toBeLessThan(2.5);
    expect(scheduler.apply(reviewing(), 4, NOW, settings).difficulty).toBeGreaterThan(2.5);
  });

  it('never lets the ease fall below 1.3', () => {
    let state = reviewing({ difficulty: 1.3 });
    for (let i = 0; i < 10; i += 1) state = scheduler.apply(state, 1, NOW, settings);
    expect(state.difficulty).toBeGreaterThanOrEqual(1.3);
  });

  it('respects the maximum interval', () => {
    const next = scheduler.apply(reviewing({ scheduledDays: 300 }), 4, NOW, { desiredRetention: 0.9, maxInterval: 60 });
    expect(next.scheduledDays).toBeLessThanOrEqual(60);
  });

  it('applies exactly what it previewed', () => {
    const state = reviewing();
    const preview = scheduler.preview(state, NOW, settings);
    for (const grade of GRADES) {
      expect(scheduler.apply(state, grade, NOW, settings)).toEqual(preview[grade]);
    }
  });

  it('sets due from the interval it computed', () => {
    const next = scheduler.apply(reviewing(), 3, NOW, settings);
    expect(next.due).toBe(NOW + next.scheduledDays * DAY);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- test/srs/sm2.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement SM-2**

Write `core/srs/sm2.ts`:

```ts
import type { Grade, Scheduler, SchedulerSettings, SrsState } from './types';

/**
 * SM-2, offered because the settings screen presents it as a real choice and a
 * learner migrating from Anki recognises its intervals.
 *
 * The ease factor lives in SrsState.difficulty. Reusing the field rather than
 * adding an algorithm-specific one keeps a single persisted shape, so switching
 * algorithms never needs a migration.
 */

const DAY = 86_400_000;
const MIN_EASE = 1.3;
const RELEARN_MINUTES = 10;

/** SM-2's q scale is 0-5; Fanka's four buttons map onto its upper half. */
const QUALITY: Record<Grade, number> = { 1: 2, 2: 3, 3: 4, 4: 5 };

function nextEase(ease: number, grade: Grade): number {
  const q = QUALITY[grade];
  const adjusted = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  return Math.max(MIN_EASE, Number(adjusted.toFixed(4)));
}

function step(state: SrsState, grade: Grade, now: number, settings: SchedulerSettings): SrsState {
  const ease = nextEase(state.difficulty || 2.5, grade);
  const common = {
    ...state,
    difficulty: ease,
    reps: state.reps + 1,
    elapsedDays: state.lastReview === null ? 0 : Math.round((now - state.lastReview) / DAY),
    lastReview: now,
  };

  if (grade === 1) {
    return {
      ...common,
      state: 'relearning',
      lapses: state.lapses + 1,
      scheduledDays: 0,
      stability: 0,
      due: now + RELEARN_MINUTES * 60_000,
    };
  }

  let days: number;
  if (state.reps === 0) days = 1;
  else if (state.reps === 1) days = 6;
  else days = Math.round(state.scheduledDays * ease);

  days = Math.min(days, settings.maxInterval);

  return {
    ...common,
    state: state.reps >= 1 ? 'review' : 'learning',
    scheduledDays: days,
    stability: days,
    due: now + days * DAY,
  };
}

export function createSm2Scheduler(): Scheduler {
  function preview(state: SrsState, now: number, settings: SchedulerSettings): Record<Grade, SrsState> {
    return {
      1: step(state, 1, now, settings),
      2: step(state, 2, now, settings),
      3: step(state, 3, now, settings),
      4: step(state, 4, now, settings),
    };
  }

  return { preview, apply: (state, grade, now, settings) => preview(state, now, settings)[grade] };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- test/srs/sm2.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Add the selector and commit**

Write `core/srs/index.ts`:

```ts
import { createFsrsScheduler } from './fsrs';
import { createSm2Scheduler } from './sm2';
import type { Scheduler } from './types';

export type Algorithm = 'FSRS' | 'SM-2';

const schedulers: Record<Algorithm, Scheduler> = {
  FSRS: createFsrsScheduler(),
  'SM-2': createSm2Scheduler(),
};

export function schedulerFor(algorithm: Algorithm): Scheduler {
  return schedulers[algorithm];
}

export * from './scheduler';
export * from './types';
```

```bash
git add core/srs test/srs
git commit -m "Add an SM-2 scheduler behind the same interface

The settings screen presents SM-2 as a real choice, so it is a real
implementation rather than FSRS with different constants.

Its ease factor reuses SrsState.difficulty instead of adding an
algorithm-specific field, which keeps one persisted shape and means
switching algorithm never requires a migration."
```

---

### Task 6: The database

**Files:**
- Create: `core/db/schema.ts`, `core/db/db.ts`, `core/db/repositories.ts`
- Test: `test/db/repositories.test.ts`

**Interfaces:**
- Consumes: `SrsState`, `Grade` from `~core/srs`; `PinyinSyllable` from `~core/chinese/pinyin`.
- Produces:
  - `interface Deck`, `interface Card`, `interface Item`, `interface Review`, `interface OutboxEntry`
  - `type Direction = 'recognition' | 'production'`
  - `db: FankaDatabase` (Dexie instance)
  - `decks`, `cards`, `items`, `reviews` repository objects, each with the
    methods used below.
  - `itemId(cardId: string, dir: Direction): string`

- [ ] **Step 1: Write the schema**

Write `core/db/schema.ts`:

```ts
import type { PinyinSyllable } from '~core/chinese/pinyin';
import type { Grade, SrsState } from '~core/srs';

export type Direction = 'recognition' | 'production';
export type PartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb' | 'phrase';

export interface Deck {
  id: string;
  name: string;
  description: string;
  colorToken: string;
  tag: string;
  translationLang: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** The content. Holds no scheduling state — that is what Item is for. */
export interface Card {
  id: string;
  deckId: string;
  hanzi: string;
  pinyin: PinyinSyllable[];
  zhuyin: string;
  translation: string;
  pos: PartOfSpeech;
  example: string;
  examplePinyin: string;
  exampleTranslation: string;
  tags: string[];
  note: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/**
 * One scheduling state per direction. Recognising 學習 and being able to write
 * it from its meaning are different skills that a learner acquires at
 * different rates, so they are scheduled apart.
 */
export interface Item extends SrsState {
  id: string;
  cardId: string;
  dir: Direction;
  suspended: boolean;
  updatedAt: number;
}

/**
 * Append-only. Never updated, never deleted except by an explicit undo. It is
 * the only source for true retention, the activity heatmap and per-tone
 * accuracy, none of which can be derived from Item, which holds only the
 * present.
 */
export interface Review {
  id: string;
  itemId: string;
  grade: Grade;
  reviewedAt: number;
  durationMs: number;
  before: SrsState;
}

export interface OutboxEntry {
  id: string;
  entity: 'deck' | 'card' | 'item' | 'review';
  entityId: string;
  op: 'put' | 'delete';
  at: number;
}

export function itemId(cardId: string, dir: Direction): string {
  return `${cardId}:${dir}`;
}
```

- [ ] **Step 2: Write the failing test**

Write `test/db/repositories.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { cards, decks, items, reviews } from '~core/db/repositories';
import { itemId } from '~core/db/schema';
import { newSrsState } from '~core/srs';

const NOW = Date.parse('2026-09-16T08:00:00Z');
const DAY = 86_400_000;

const aDeck = (over = {}) => ({
  id: 'd1', name: 'HSK 1', description: '', colorToken: 'var(--chart-series-1)',
  tag: 'HSK', translationLang: 'en', createdAt: NOW, updatedAt: NOW, deletedAt: null, ...over,
});

const aCard = (over = {}) => ({
  id: 'c1', deckId: 'd1', hanzi: '學習', pinyin: [{ text: 'xué', tone: 2 as const }],
  zhuyin: '', translation: 'to study', pos: 'verb' as const, example: '', examplePinyin: '',
  exampleTranslation: '', tags: [], note: '', createdAt: NOW, updatedAt: NOW, deletedAt: null, ...over,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('decks', () => {
  it('stores and reads a deck back', async () => {
    await decks.put(aDeck());
    expect(await decks.get('d1')).toMatchObject({ name: 'HSK 1' });
  });

  it('hides soft-deleted decks from listAll', async () => {
    await decks.put(aDeck());
    await decks.put(aDeck({ id: 'd2', deletedAt: NOW }));
    expect((await decks.listAll()).map((d) => d.id)).toEqual(['d1']);
  });
});

describe('cards', () => {
  it('creates one item per requested direction', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition', 'production'], NOW);
    const made = await items.forCard('c1');
    expect(made.map((i) => i.dir).sort()).toEqual(['production', 'recognition']);
    expect(made.every((i) => i.state === 'new')).toBe(true);
  });

  it('writes an outbox entry in the same transaction', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    const pending = await db.outbox.toArray();
    expect(pending.some((e) => e.entity === 'card' && e.entityId === 'c1')).toBe(true);
  });
});

describe('items', () => {
  it('returns only items that are due, not suspended, and not new', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    const id = itemId('c1', 'recognition');
    await items.put({ ...(await items.get(id))!, state: 'review', due: NOW - DAY });
    await cards.create(aCard({ id: 'c2' }), ['recognition'], NOW);
    const later = itemId('c2', 'recognition');
    await items.put({ ...(await items.get(later))!, state: 'review', due: NOW + DAY });

    const due = await items.due(NOW);
    expect(due.map((i) => i.id)).toEqual([id]);
  });

  it('excludes suspended items from due', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    const id = itemId('c1', 'recognition');
    await items.put({ ...(await items.get(id))!, state: 'review', due: NOW - DAY, suspended: true });
    expect(await items.due(NOW)).toEqual([]);
  });

  it('returns new items separately, oldest card first', async () => {
    await decks.put(aDeck());
    await cards.create(aCard({ id: 'c2', createdAt: NOW + 10 }), ['recognition'], NOW);
    await cards.create(aCard({ id: 'c1', createdAt: NOW }), ['recognition'], NOW);
    const fresh = await items.fresh(10);
    expect(fresh.map((i) => i.cardId)).toEqual(['c1', 'c2']);
  });
});

describe('reviews', () => {
  it('records a review and updates the item in one transaction', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    const id = itemId('c1', 'recognition');
    const before = (await items.get(id))!;
    const after = { ...before, state: 'learning' as const, due: NOW + 600_000, reps: 1 };

    await reviews.record({ item: after, before: newSrsState(NOW), grade: 3, reviewedAt: NOW, durationMs: 4200 });

    expect((await items.get(id))!.reps).toBe(1);
    expect(await db.reviews.count()).toBe(1);
  });

  it('undoes a review exactly, restoring the previous state', async () => {
    await decks.put(aDeck());
    await cards.create(aCard(), ['recognition'], NOW);
    const id = itemId('c1', 'recognition');
    const before = (await items.get(id))!;
    const after = { ...before, state: 'learning' as const, due: NOW + 600_000, reps: 1, stability: 2.3 };

    const reviewId = await reviews.record({ item: after, before, grade: 3, reviewedAt: NOW, durationMs: 1000 });
    await reviews.undo(reviewId);

    expect(await items.get(id)).toEqual(before);
    expect(await db.reviews.count()).toBe(0);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- test/db/repositories.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Write the Dexie instance**

Write `core/db/db.ts`:

```ts
import Dexie, { type Table } from 'dexie';

import type { Card, Deck, Item, OutboxEntry, Review } from './schema';

export interface SettingsRow {
  key: string;
  value: unknown;
}

export interface StrokeRow {
  char: string;
  data: unknown;
  fetchedAt: number;
}

export class FankaDatabase extends Dexie {
  decks!: Table<Deck, string>;
  cards!: Table<Card, string>;
  items!: Table<Item, string>;
  reviews!: Table<Review, string>;
  strokes!: Table<StrokeRow, string>;
  settings!: Table<SettingsRow, string>;
  outbox!: Table<OutboxEntry, string>;

  constructor() {
    super('fanka');
    // items.due is indexed because the due query runs on every screen.
    this.version(1).stores({
      decks: 'id, updatedAt, deletedAt',
      cards: 'id, deckId, updatedAt, deletedAt, *tags',
      items: 'id, cardId, dir, due, state, suspended, updatedAt',
      reviews: 'id, itemId, reviewedAt',
      strokes: 'char',
      settings: 'key',
      outbox: 'id, entity, entityId, at',
    });
  }
}

export const db = new FankaDatabase();
```

- [ ] **Step 5: Write the repositories**

Write `core/db/repositories.ts`:

```ts
import { db } from './db';
import { type Card, type Deck, type Direction, type Item, type OutboxEntry, type Review, itemId } from './schema';
import { type Grade, type SrsState, newSrsState } from '~core/srs';

function uid(): string {
  return crypto.randomUUID();
}

function outboxEntry(entity: OutboxEntry['entity'], entityId: string, op: OutboxEntry['op'], at: number): OutboxEntry {
  return { id: uid(), entity, entityId, op, at };
}

export const decks = {
  get: (id: string) => db.decks.get(id),

  async put(deck: Deck): Promise<void> {
    // The outbox entry is written inside the same transaction as the change,
    // so a crash between the two is not possible and no mutation is lost.
    await db.transaction('rw', db.decks, db.outbox, async () => {
      await db.decks.put(deck);
      await db.outbox.put(outboxEntry('deck', deck.id, 'put', deck.updatedAt));
    });
  },

  async listAll(): Promise<Deck[]> {
    const all = await db.decks.toArray();
    return all.filter((d) => d.deletedAt === null).sort((a, b) => a.name.localeCompare(b.name));
  },
};

export const cards = {
  get: (id: string) => db.cards.get(id),

  async create(card: Card, directions: Direction[], now: number): Promise<void> {
    await db.transaction('rw', db.cards, db.items, db.outbox, async () => {
      await db.cards.put(card);
      await db.outbox.put(outboxEntry('card', card.id, 'put', now));
      for (const dir of directions) {
        const item: Item = {
          ...newSrsState(now),
          id: itemId(card.id, dir),
          cardId: card.id,
          dir,
          suspended: false,
          updatedAt: now,
        };
        await db.items.put(item);
        await db.outbox.put(outboxEntry('item', item.id, 'put', now));
      }
    });
  },

  async forDeck(deckId: string): Promise<Card[]> {
    const all = await db.cards.where('deckId').equals(deckId).toArray();
    return all.filter((c) => c.deletedAt === null);
  },
};

export const items = {
  get: (id: string) => db.items.get(id),

  async put(item: Item): Promise<void> {
    await db.transaction('rw', db.items, db.outbox, async () => {
      await db.items.put(item);
      await db.outbox.put(outboxEntry('item', item.id, 'put', item.updatedAt));
    });
  },

  forCard: (cardId: string) => db.items.where('cardId').equals(cardId).toArray(),

  /** Due, already introduced, not suspended — soonest first. */
  async due(now: number): Promise<Item[]> {
    const candidates = await db.items.where('due').belowOrEqual(now).toArray();
    return candidates
      .filter((i) => !i.suspended && i.state !== 'new')
      .sort((a, b) => a.due - b.due);
  },

  /** Never-seen items, oldest card first, so a deck is learned in its order. */
  async fresh(limit: number): Promise<Item[]> {
    const fresh = (await db.items.where('state').equals('new').toArray()).filter((i) => !i.suspended);
    const byCard = new Map((await db.cards.bulkGet(fresh.map((i) => i.cardId))).filter(Boolean).map((c) => [c!.id, c!]));
    return fresh
      .sort((a, b) => (byCard.get(a.cardId)?.createdAt ?? 0) - (byCard.get(b.cardId)?.createdAt ?? 0))
      .slice(0, limit);
  },
};

export interface RecordedReview {
  item: Item;
  before: SrsState;
  grade: Grade;
  reviewedAt: number;
  durationMs: number;
}

export const reviews = {
  async record({ item, before, grade, reviewedAt, durationMs }: RecordedReview): Promise<string> {
    const review: Review = { id: uid(), itemId: item.id, grade, reviewedAt, durationMs, before };
    await db.transaction('rw', db.items, db.reviews, db.outbox, async () => {
      await db.items.put({ ...item, updatedAt: reviewedAt });
      await db.reviews.put(review);
      await db.outbox.put(outboxEntry('item', item.id, 'put', reviewedAt));
      await db.outbox.put(outboxEntry('review', review.id, 'put', reviewedAt));
    });
    return review.id;
  },

  /**
   * Undo is exact: the previous scheduling state was captured in the review
   * row, so restoring it is a copy rather than a recalculation.
   */
  async undo(reviewId: string): Promise<void> {
    await db.transaction('rw', db.items, db.reviews, db.outbox, async () => {
      const review = await db.reviews.get(reviewId);
      if (!review) return;
      const item = await db.items.get(review.itemId);
      if (item) {
        await db.items.put({ ...item, ...review.before, updatedAt: review.before.lastReview ?? item.updatedAt });
        await db.outbox.put(outboxEntry('item', item.id, 'put', Date.now()));
      }
      await db.reviews.delete(reviewId);
      await db.outbox.put(outboxEntry('review', reviewId, 'delete', Date.now()));
    });
  },

  forItem: (itemIdValue: string) => db.reviews.where('itemId').equals(itemIdValue).sortBy('reviewedAt'),
};
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npm test -- test/db/repositories.test.ts`
Expected: PASS, 9 tests. If `crypto.randomUUID` is undefined under happy-dom,
add `import { webcrypto } from 'node:crypto'` to a setup file and assign
`globalThis.crypto = webcrypto as Crypto`.

- [ ] **Step 7: Commit**

```bash
git add core/db test/db
git commit -m "Add the Dexie schema and repositories

Every mutation writes its outbox entry inside the same transaction as
the change, so a crash between the two cannot lose a mutation. Sync in a
later phase drains that outbox rather than diffing the database.

Reviews are append-only and carry the scheduling state that preceded
them, which makes undo a copy rather than a recalculation, and lets a
divergent item be repaired by replaying its log."
```

---

### Task 7: Settings and the theme

**Files:**
- Create: `core/db/settings.ts`, `app/composables/useSettings.ts`
- Test: `test/db/settings.test.ts`

**Interfaces:**
- Consumes: `db` from `~core/db/db`.
- Produces:
  - `interface Settings` (all fields from the spec §3.3, with `learningSteps`-free scheduling fields)
  - `DEFAULT_SETTINGS: Settings`
  - `loadSettings(): Promise<Settings>`, `saveSettings(patch: Partial<Settings>): Promise<Settings>`
  - `useSettings()` — a Vue composable exposing `settings`, `update(patch)`, `ready`.

- [ ] **Step 1: Write the failing test**

Write `test/db/settings.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '~core/db/settings';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('settings', () => {
  it('returns the defaults when nothing is stored', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('persists a patch and leaves the rest alone', async () => {
    const saved = await saveSettings({ newPerDay: 30 });
    expect(saved.newPerDay).toBe(30);
    expect(saved.algorithm).toBe(DEFAULT_SETTINGS.algorithm);
    expect((await loadSettings()).newPerDay).toBe(30);
  });

  it('fills in fields added by a later version', async () => {
    await db.settings.put({ key: 'settings', value: { newPerDay: 7 } });
    const loaded = await loadSettings();
    expect(loaded.newPerDay).toBe(7);
    expect(loaded.desiredRetention).toBe(DEFAULT_SETTINGS.desiredRetention);
  });

  it('defaults to FSRS at 90% retention', () => {
    expect(DEFAULT_SETTINGS.algorithm).toBe('FSRS');
    expect(DEFAULT_SETTINGS.desiredRetention).toBe(0.9);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- test/db/settings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement settings**

Write `core/db/settings.ts`:

```ts
import { db } from './db';
import type { Algorithm } from '~core/srs';

export interface Settings {
  algorithm: Algorithm;
  desiredRetention: number;
  newPerDay: number;
  maxInterval: number;
  showZhuyin: boolean;
  toneColors: boolean;
  hidePinyinUntilRevealed: boolean;
  autoplayStrokes: boolean;
  audio: boolean;
  hanziFont: 'serif' | 'sans';
  theme: 'dark' | 'light' | 'auto';
  reminders: { enabled: boolean; hour: number; minute: number };
  offlineStrokeCache: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  algorithm: 'FSRS',
  desiredRetention: 0.9,
  newPerDay: 15,
  maxInterval: 365,
  showZhuyin: false,
  toneColors: true,
  hidePinyinUntilRevealed: false,
  autoplayStrokes: true,
  audio: true,
  hanziFont: 'serif',
  theme: 'dark',
  reminders: { enabled: true, hour: 19, minute: 0 },
  offlineStrokeCache: true,
};

const KEY = 'settings';

/**
 * Merged over the defaults on every read, so a release that adds a setting
 * does not need a migration and an older stored record stays valid.
 */
export async function loadSettings(): Promise<Settings> {
  const row = await db.settings.get(KEY);
  const stored = (row?.value ?? {}) as Partial<Settings>;
  return { ...DEFAULT_SETTINGS, ...stored, reminders: { ...DEFAULT_SETTINGS.reminders, ...stored.reminders } };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const merged = { ...(await loadSettings()), ...patch };
  await db.settings.put({ key: KEY, value: merged });
  return merged;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- test/db/settings.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the composable**

Write `app/composables/useSettings.ts`:

```ts
import { DEFAULT_SETTINGS, type Settings, loadSettings, saveSettings } from '~core/db/settings';

const settings = ref<Settings>({ ...DEFAULT_SETTINGS });
const ready = ref(false);

/**
 * One shared reactive record for the whole app. Loaded once; every screen that
 * needs a setting reads this rather than touching Dexie.
 */
export function useSettings() {
  if (!ready.value && import.meta.client) {
    void loadSettings().then((loaded) => {
      settings.value = loaded;
      ready.value = true;
      applyTheme(loaded);
    });
  }

  async function update(patch: Partial<Settings>): Promise<void> {
    settings.value = await saveSettings(patch);
    applyTheme(settings.value);
  }

  return { settings: readonly(settings), ready: readonly(ready), update };
}

/**
 * Kanto drives both themes from one attribute, and the Chinese typeface from
 * an application token, so switching either is an attribute write and no CSS.
 */
function applyTheme(value: Settings): void {
  const root = document.documentElement;
  root.dataset.theme = value.theme;
  root.dataset.hanziFont = value.hanziFont;
}
```

- [ ] **Step 6: Commit**

```bash
git add core/db/settings.ts app/composables/useSettings.ts test/db/settings.test.ts
git commit -m "Add settings storage and the theme composable

Stored settings are merged over the defaults on every read, so adding a
setting in a later release needs no migration and an older record stays
valid.

Theme and Chinese typeface are both attributes on the root element:
Kanto drives its light theme from data-theme, and the hanzi font from an
application token, so switching either writes an attribute and no CSS."
```

---

### Task 8: Seeded decks

**Files:**
- Create: `core/seed/seed.ts`, `core/seed/data/hsk1.json`
- Test: `test/seed/seed.test.ts`

**Interfaces:**
- Consumes: `decks`, `cards` repositories; `parsePinyin`, `toZhuyin`.
- Produces:
  - `interface SeedDeck { id, name, description, colorToken, tag, cards: SeedCard[] }`
  - `interface SeedCard { hanzi, pinyin, translation, pos, example, examplePinyin, exampleTranslation, tags }`
  - `seedIfNeeded(now: number): Promise<{ seeded: boolean; deckCount: number }>`
  - `SEED_VERSION: number`

- [ ] **Step 1: Write the failing test**

Write `test/seed/seed.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { cards, decks } from '~core/db/repositories';
import { SEED_VERSION, seedIfNeeded } from '~core/seed/seed';

const NOW = Date.parse('2026-09-16T08:00:00Z');

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('seedIfNeeded', () => {
  it('creates decks and cards on a fresh database', async () => {
    const result = await seedIfNeeded(NOW);
    expect(result.seeded).toBe(true);
    expect(result.deckCount).toBeGreaterThan(0);
    expect(await db.cards.count()).toBeGreaterThan(0);
  });

  it('creates two items per seeded card', async () => {
    await seedIfNeeded(NOW);
    expect(await db.items.count()).toBe((await db.cards.count()) * 2);
  });

  it('is idempotent — running twice changes nothing', async () => {
    await seedIfNeeded(NOW);
    const before = await db.cards.count();
    const second = await seedIfNeeded(NOW);
    expect(second.seeded).toBe(false);
    expect(await db.cards.count()).toBe(before);
  });

  it('records the version it seeded', async () => {
    await seedIfNeeded(NOW);
    expect((await db.settings.get('seedVersion'))?.value).toBe(SEED_VERSION);
  });

  it('gives every seeded card parsed pinyin and derived zhuyin', async () => {
    await seedIfNeeded(NOW);
    for (const card of await db.cards.toArray()) {
      expect(card.pinyin.length).toBeGreaterThan(0);
      expect(card.pinyin.every((s) => s.tone >= 1 && s.tone <= 5)).toBe(true);
      expect(card.zhuyin.length).toBeGreaterThan(0);
    }
  });

  it('seeds traditional characters only', async () => {
    await seedIfNeeded(NOW);
    const simplifiedOnly = /[习学问题时间开电话认识欢迎帮忙压这个买两点课程给号码]/;
    for (const card of await db.cards.toArray()) {
      expect(card.hanzi).not.toMatch(simplifiedOnly);
    }
  });

  it('does not overwrite a card the learner has edited', async () => {
    await seedIfNeeded(NOW);
    const [first] = await db.cards.toArray();
    await db.cards.put({ ...first!, translation: 'my own wording', updatedAt: NOW + 1000 });
    await seedIfNeeded(NOW + 2000);
    expect((await db.cards.get(first!.id))!.translation).toBe('my own wording');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- test/seed/seed.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the seed data**

Write `core/seed/data/hsk1.json`. Every entry uses **traditional** characters,
numbered pinyin (parsed at load), and an English translation. Twenty entries to
start; the deck is extended in Phase 2 when the import pipeline can validate a
larger batch:

```json
{
  "id": "hsk1-traditional",
  "name": "HSK 1 — traditional",
  "description": "The first 150 words, written in traditional characters.",
  "colorToken": "var(--chart-series-1)",
  "tag": "HSK",
  "cards": [
    { "hanzi": "學習", "pinyin": "xue2 xi2", "translation": "to study, to learn", "pos": "verb", "example": "我每天學習中文。", "examplePinyin": "wo3 mei3 tian1 xue2 xi2 zhong1 wen2", "exampleTranslation": "I study Chinese every day.", "tags": ["HSK1"] },
    { "hanzi": "時間", "pinyin": "shi2 jian1", "translation": "time", "pos": "noun", "example": "我們沒有時間了。", "examplePinyin": "wo3 men5 mei2 you3 shi2 jian1 le5", "exampleTranslation": "We are out of time.", "tags": ["HSK1"] },
    { "hanzi": "問題", "pinyin": "wen4 ti2", "translation": "question, problem", "pos": "noun", "example": "我有一個問題。", "examplePinyin": "wo3 you3 yi2 ge5 wen4 ti2", "exampleTranslation": "I have a question.", "tags": ["HSK1"] },
    { "hanzi": "開始", "pinyin": "kai1 shi3", "translation": "to begin, start", "pos": "verb", "example": "課程下午兩點開始。", "examplePinyin": "ke4 cheng2 xia4 wu3 liang3 dian3 kai1 shi3", "exampleTranslation": "The class starts at two in the afternoon.", "tags": ["HSK1"] },
    { "hanzi": "電話", "pinyin": "dian4 hua4", "translation": "telephone", "pos": "noun", "example": "請給我你的電話號碼。", "examplePinyin": "qing3 gei3 wo3 ni3 de5 dian4 hua4 hao4 ma3", "exampleTranslation": "Please give me your phone number.", "tags": ["HSK1"] },
    { "hanzi": "認識", "pinyin": "ren4 shi5", "translation": "to know (a person)", "pos": "verb", "example": "很高興認識你。", "examplePinyin": "hen3 gao1 xing4 ren4 shi5 ni3", "exampleTranslation": "Pleased to meet you.", "tags": ["HSK1"] },
    { "hanzi": "歡迎", "pinyin": "huan1 ying2", "translation": "to welcome", "pos": "verb", "example": "歡迎來到台北。", "examplePinyin": "huan1 ying2 lai2 dao4 tai2 bei3", "exampleTranslation": "Welcome to Taipei.", "tags": ["HSK1"] },
    { "hanzi": "幫忙", "pinyin": "bang1 mang2", "translation": "to help out", "pos": "verb", "example": "你可以幫忙嗎？", "examplePinyin": "ni3 ke3 yi3 bang1 mang2 ma5", "exampleTranslation": "Can you help?", "tags": ["HSK1"] },
    { "hanzi": "餐廳", "pinyin": "can1 ting1", "translation": "restaurant", "pos": "noun", "example": "這家餐廳的麵很好吃。", "examplePinyin": "zhe4 jia1 can1 ting1 de5 mian4 hen3 hao3 chi1", "exampleTranslation": "The noodles at this restaurant are delicious.", "tags": ["HSK1"] },
    { "hanzi": "便宜", "pinyin": "pian2 yi5", "translation": "cheap, inexpensive", "pos": "adjective", "example": "這個水果很便宜。", "examplePinyin": "zhe4 ge5 shui3 guo3 hen3 pian2 yi5", "exampleTranslation": "This fruit is very cheap.", "tags": ["HSK1"] },
    { "hanzi": "麵包", "pinyin": "mian4 bao1", "translation": "bread", "pos": "noun", "example": "我買了兩個麵包。", "examplePinyin": "wo3 mai3 le5 liang3 ge5 mian4 bao1", "exampleTranslation": "I bought two loaves of bread.", "tags": ["HSK1"] },
    { "hanzi": "壓力", "pinyin": "ya1 li4", "translation": "pressure, stress", "pos": "noun", "example": "工作壓力太大了。", "examplePinyin": "gong1 zuo4 ya1 li4 tai4 da4 le5", "exampleTranslation": "The pressure at work is too much.", "tags": ["HSK1"] },
    { "hanzi": "謝謝", "pinyin": "xie4 xie5", "translation": "thank you", "pos": "phrase", "example": "謝謝你的幫忙。", "examplePinyin": "xie4 xie5 ni3 de5 bang1 mang2", "exampleTranslation": "Thank you for your help.", "tags": ["HSK1"] },
    { "hanzi": "對不起", "pinyin": "dui4 bu5 qi3", "translation": "sorry, excuse me", "pos": "phrase", "example": "對不起，我遲到了。", "examplePinyin": "dui4 bu5 qi3 wo3 chi2 dao4 le5", "exampleTranslation": "Sorry, I am late.", "tags": ["HSK1"] },
    { "hanzi": "朋友", "pinyin": "peng2 you5", "translation": "friend", "pos": "noun", "example": "他是我的好朋友。", "examplePinyin": "ta1 shi4 wo3 de5 hao3 peng2 you5", "exampleTranslation": "He is a good friend of mine.", "tags": ["HSK1"] },
    { "hanzi": "老師", "pinyin": "lao3 shi1", "translation": "teacher", "pos": "noun", "example": "老師很有耐心。", "examplePinyin": "lao3 shi1 hen3 you3 nai4 xin1", "exampleTranslation": "The teacher is very patient.", "tags": ["HSK1"] },
    { "hanzi": "學生", "pinyin": "xue2 sheng1", "translation": "student", "pos": "noun", "example": "我是台灣大學的學生。", "examplePinyin": "wo3 shi4 tai2 wan1 da4 xue2 de5 xue2 sheng1", "exampleTranslation": "I am a student at National Taiwan University.", "tags": ["HSK1"] },
    { "hanzi": "喜歡", "pinyin": "xi3 huan1", "translation": "to like", "pos": "verb", "example": "我喜歡喝茶。", "examplePinyin": "wo3 xi3 huan1 he1 cha2", "exampleTranslation": "I like drinking tea.", "tags": ["HSK1"] },
    { "hanzi": "覺得", "pinyin": "jue2 de5", "translation": "to feel, to think", "pos": "verb", "example": "我覺得這本書很有意思。", "examplePinyin": "wo3 jue2 de5 zhe4 ben3 shu1 hen3 you3 yi4 si5", "exampleTranslation": "I think this book is interesting.", "tags": ["HSK1"] },
    { "hanzi": "當然", "pinyin": "dang1 ran2", "translation": "of course", "pos": "adverb", "example": "當然可以。", "examplePinyin": "dang1 ran2 ke3 yi3", "exampleTranslation": "Of course you can.", "tags": ["HSK1"] }
  ]
}
```

- [ ] **Step 4: Implement the seeder**

Write `core/seed/seed.ts`:

```ts
import hsk1 from './data/hsk1.json';
import { parsePinyin } from '~core/chinese/pinyin';
import { toZhuyin } from '~core/chinese/zhuyin';
import { db } from '~core/db/db';
import { cards, decks } from '~core/db/repositories';
import type { Card, Deck, PartOfSpeech } from '~core/db/schema';

/** Bump when decks are added. Existing cards are never rewritten. */
export const SEED_VERSION = 1;

interface SeedCard {
  hanzi: string;
  pinyin: string;
  translation: string;
  pos: PartOfSpeech;
  example: string;
  examplePinyin: string;
  exampleTranslation: string;
  tags: string[];
}

interface SeedDeck {
  id: string;
  name: string;
  description: string;
  colorToken: string;
  tag: string;
  cards: SeedCard[];
}

const SEEDS: SeedDeck[] = [hsk1 as SeedDeck];

/**
 * Ids are derived from the deck and the characters rather than random, so a
 * second run recognises a card it already created and leaves the learner's
 * edits to it alone.
 */
function seedCardId(deckId: string, hanzi: string): string {
  return `${deckId}:${hanzi}`;
}

export async function seedIfNeeded(now: number): Promise<{ seeded: boolean; deckCount: number }> {
  const recorded = (await db.settings.get('seedVersion'))?.value;
  if (recorded === SEED_VERSION) return { seeded: false, deckCount: SEEDS.length };

  for (const seed of SEEDS) {
    const deck: Deck = {
      id: seed.id,
      name: seed.name,
      description: seed.description,
      colorToken: seed.colorToken,
      tag: seed.tag,
      translationLang: 'en',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    if (!(await decks.get(deck.id))) await decks.put(deck);

    for (const entry of seed.cards) {
      const id = seedCardId(seed.id, entry.hanzi);
      if (await cards.get(id)) continue;

      const pinyin = parsePinyin(entry.pinyin);
      const card: Card = {
        id,
        deckId: seed.id,
        hanzi: entry.hanzi,
        pinyin,
        zhuyin: toZhuyin(pinyin),
        translation: entry.translation,
        pos: entry.pos,
        example: entry.example,
        examplePinyin: parsePinyin(entry.examplePinyin).map((s) => s.text).join(' '),
        exampleTranslation: entry.exampleTranslation,
        tags: entry.tags,
        note: '',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await cards.create(card, ['recognition', 'production'], now);
    }
  }

  await db.settings.put({ key: 'seedVersion', value: SEED_VERSION });
  return { seeded: true, deckCount: SEEDS.length };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm test -- test/seed/seed.test.ts`
Expected: PASS, 7 tests. Add `"resolveJsonModule": true` to `tsconfig.json`
compilerOptions if the JSON import is rejected.

- [ ] **Step 6: Commit**

```bash
git add core/seed test/seed
git commit -m "Seed the first traditional HSK 1 deck

Card ids are derived from the deck and the characters rather than
generated, so a later release that adds decks recognises what it already
created and never overwrites a card the learner has reworded.

A guard test asserts no simplified character reaches the database — the
whole point of the app is the traditional forms."
```

---

### Task 9: Building the session queue

**Files:**
- Create: `core/srs/queue.ts`
- Test: `test/srs/queue.test.ts`

**Interfaces:**
- Consumes: `Item`, `Direction` from `~core/db/schema`.
- Produces: `buildQueue(input: QueueInput): Item[]`, where
  `interface QueueInput { due: Item[]; fresh: Item[]; newPerDay: number; introducedToday: number }`

- [ ] **Step 1: Write the failing test**

Write `test/srs/queue.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Item } from '~core/db/schema';
import { buildQueue } from '~core/srs/queue';
import { newSrsState } from '~core/srs';

const NOW = Date.parse('2026-09-16T08:00:00Z');

const item = (id: string, over: Partial<Item> = {}): Item => ({
  ...newSrsState(NOW),
  id,
  cardId: id.split(':')[0]!,
  dir: 'recognition',
  suspended: false,
  updatedAt: NOW,
  ...over,
});

describe('buildQueue', () => {
  it('returns nothing when there is nothing to do', () => {
    expect(buildQueue({ due: [], fresh: [], newPerDay: 15, introducedToday: 0 })).toEqual([]);
  });

  it('includes every due item', () => {
    const due = [item('a:recognition'), item('b:recognition')];
    expect(buildQueue({ due, fresh: [], newPerDay: 0, introducedToday: 0 })).toHaveLength(2);
  });

  it('caps new items at the daily allowance', () => {
    const fresh = Array.from({ length: 10 }, (_, i) => item(`n${i}:recognition`, { state: 'new' }));
    const queue = buildQueue({ due: [], fresh, newPerDay: 3, introducedToday: 0 });
    expect(queue).toHaveLength(3);
  });

  it('subtracts what was already introduced today', () => {
    const fresh = Array.from({ length: 10 }, (_, i) => item(`n${i}:recognition`, { state: 'new' }));
    expect(buildQueue({ due: [], fresh, newPerDay: 5, introducedToday: 4 })).toHaveLength(1);
  });

  it('introduces nothing once the allowance is spent', () => {
    const fresh = [item('n0:recognition', { state: 'new' })];
    expect(buildQueue({ due: [], fresh, newPerDay: 5, introducedToday: 5 })).toEqual([]);
  });

  it('never places the two directions of one card next to each other', () => {
    const due = [
      item('a:recognition', { cardId: 'a', dir: 'recognition' }),
      item('a:production', { cardId: 'a', dir: 'production' }),
      item('b:recognition', { cardId: 'b', dir: 'recognition' }),
      item('b:production', { cardId: 'b', dir: 'production' }),
    ];
    const queue = buildQueue({ due, fresh: [], newPerDay: 0, introducedToday: 0 });
    for (let i = 1; i < queue.length; i += 1) {
      expect(queue[i]!.cardId).not.toBe(queue[i - 1]!.cardId);
    }
  });

  it('spreads new items through the session rather than front-loading them', () => {
    const due = Array.from({ length: 8 }, (_, i) => item(`d${i}:recognition`, { state: 'review' }));
    const fresh = Array.from({ length: 2 }, (_, i) => item(`n${i}:recognition`, { state: 'new' }));
    const queue = buildQueue({ due, fresh, newPerDay: 2, introducedToday: 0 });
    const positions = queue.map((q, i) => (q.state === 'new' ? i : -1)).filter((i) => i >= 0);
    expect(positions).toHaveLength(2);
    expect(positions[0]).toBeGreaterThan(0);
    expect(positions[1]! - positions[0]!).toBeGreaterThan(1);
  });

  it('keeps every item exactly once', () => {
    const due = Array.from({ length: 5 }, (_, i) => item(`d${i}:recognition`, { state: 'review' }));
    const fresh = Array.from({ length: 3 }, (_, i) => item(`n${i}:recognition`, { state: 'new' }));
    const queue = buildQueue({ due, fresh, newPerDay: 3, introducedToday: 0 });
    expect(new Set(queue.map((q) => q.id)).size).toBe(8);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- test/srs/queue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the queue**

Write `core/srs/queue.ts`:

```ts
import type { Item } from '~core/db/schema';

export interface QueueInput {
  due: Item[];
  fresh: Item[];
  newPerDay: number;
  introducedToday: number;
}

/**
 * Two rules shape the order, and both are about the learner rather than the
 * algorithm:
 *
 * New cards are spread through the session instead of stacked at the front,
 * because a wall of unknown characters is where people quit.
 *
 * The two directions of one card are never adjacent, because answering
 * "學習 → to study" and then immediately "to study → 學習" tests recall of the
 * previous screen, not of the word.
 */
export function buildQueue({ due, fresh, newPerDay, introducedToday }: QueueInput): Item[] {
  const allowance = Math.max(0, newPerDay - introducedToday);
  const introducing = fresh.slice(0, allowance);
  const reviewing = [...due];

  if (introducing.length === 0) return separateDirections(reviewing);
  if (reviewing.length === 0) return separateDirections(introducing);

  const spacing = (reviewing.length + introducing.length) / introducing.length;
  const merged: Item[] = [];
  let nextNewAt = Math.max(1, Math.floor(spacing / 2));
  let introduced = 0;

  for (const item of reviewing) {
    if (introduced < introducing.length && merged.length >= nextNewAt) {
      merged.push(introducing[introduced]!);
      introduced += 1;
      nextNewAt = merged.length + Math.max(1, Math.round(spacing));
    }
    merged.push(item);
  }
  merged.push(...introducing.slice(introduced));

  return separateDirections(merged);
}

/**
 * A single pass that pushes an item one place later when it shares a card with
 * its predecessor. One pass is enough: a card has at most two items.
 */
function separateDirections(queue: Item[]): Item[] {
  const out = [...queue];
  for (let i = 1; i < out.length; i += 1) {
    if (out[i]!.cardId !== out[i - 1]!.cardId) continue;
    const swapWith = out.findIndex((candidate, j) => j > i && candidate.cardId !== out[i - 1]!.cardId);
    if (swapWith > i) [out[i], out[swapWith]] = [out[swapWith]!, out[i]!];
  }
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- test/srs/queue.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add core/srs/queue.ts test/srs/queue.test.ts
git commit -m "Build the session queue

Two rules, both about the learner rather than the algorithm: new cards
are spread through the session instead of stacked at the front, because
a wall of unknown characters is where people quit; and the two
directions of one card are never adjacent, because answering a word and
then immediately its reverse tests recall of the previous screen."
```

---

### Task 10: The app shell

**Files:**
- Create: `app/layouts/default.vue`, `app/components/AppSidebar.vue`, `app/components/AppBottomNav.vue`, `app/composables/useNavigation.ts`
- Modify: `app/app.vue`
- Test: manual, plus the Playwright smoke in Task 14.

**Interfaces:**
- Consumes: `useSettings` from `app/composables/useSettings`.
- Produces: `useNavigation(): { main: NavEntry[]; library: NavEntry[]; bar: NavEntry[] }`
  where `interface NavEntry { to: string; label: string; icon: string; badge?: string }`.

- [ ] **Step 1: Write the navigation composable**

Write `app/composables/useNavigation.ts`:

```ts
export interface NavEntry {
  to: string;
  label: string;
  icon: string;
  badge?: string;
}

/**
 * The routes for phase 1. Entries whose page arrives in a later phase are
 * added when that phase lands, so the sidebar never offers a dead link.
 */
export function useNavigation(dueTotal: Ref<number>) {
  const main = computed<NavEntry[]>(() => [
    { to: '/', label: 'Today', icon: 'house', badge: dueTotal.value > 0 ? String(dueTotal.value) : undefined },
    { to: '/review', label: 'Review', icon: 'play' },
  ]);

  const library = computed<NavEntry[]>(() => [{ to: '/settings', label: 'Settings', icon: 'settings' }]);

  const bar = computed<NavEntry[]>(() => [
    { to: '/', label: 'Home', icon: 'house' },
    { to: '/review', label: 'Review', icon: 'play' },
    { to: '/settings', label: 'Settings', icon: 'settings' },
  ]);

  return { main, library, bar };
}
```

- [ ] **Step 2: Write the sidebar**

Write `app/components/AppSidebar.vue`:

```vue
<script setup lang="ts">
import type { NavEntry } from '~/composables/useNavigation';

defineProps<{ main: NavEntry[]; library: NavEntry[]; dueTotal: number }>();
const route = useRoute();
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <span class="mark">繁</span>
      <span class="wordmark">
        <span class="name">FANKA</span>
        <span class="tagline">Traditional Chinese</span>
      </span>
    </div>

    <kt-button variant="primary" size="medium" icon="play" full-width @click="navigateTo('/review')">
      Today's session · {{ dueTotal }}
    </kt-button>

    <nav>
      <p class="overline">Learn</p>
      <NuxtLink v-for="entry in main" :key="entry.to" :to="entry.to" class="entry" :class="{ active: route.path === entry.to }">
        <kt-icon :name="entry.icon" size="16" />
        <span class="label">{{ entry.label }}</span>
        <span v-if="entry.badge" class="badge">{{ entry.badge }}</span>
      </NuxtLink>

      <p class="overline">Collection</p>
      <NuxtLink v-for="entry in library" :key="entry.to" :to="entry.to" class="entry" :class="{ active: route.path === entry.to }">
        <kt-icon :name="entry.icon" size="16" />
        <span class="label">{{ entry.label }}</span>
      </NuxtLink>
    </nav>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 252px;
  flex: 0 0 252px;
  border-right: var(--border-width) solid var(--border-subtle);
  background: var(--color-dark-8);
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 20px 16px;
  position: sticky;
  top: 0;
  height: 100vh;
}

.brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px; }

.mark {
  width: 32px;
  height: 32px;
  border-radius: var(--border-radius);
  background: var(--color-primary-base);
  display: grid;
  place-items: center;
  font-family: var(--fk-font-hanzi-serif);
  font-size: 19px;
  color: var(--color-white);
}

.wordmark { display: flex; flex-direction: column; }
.name { font: var(--font-title-h6); letter-spacing: 4px; color: var(--color-white); }
.tagline { font: var(--font-normal-small); color: var(--text-muted); }

nav { display: flex; flex-direction: column; gap: 2px; }

.overline {
  margin: 16px 8px 4px;
  font: var(--font-title-overline);
  letter-spacing: var(--letter-spacing-overline);
  text-transform: uppercase;
  color: var(--text-muted);
}

.overline:first-child { margin-top: 8px; }

.entry {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 8px;
  border-radius: var(--border-radius);
  text-decoration: none;
  font: var(--font-normal-medium);
  color: var(--text-muted);
  background: transparent;
}

.entry:hover { background: var(--surface-hover); color: var(--color-white); }
.entry.active { background: var(--color-primary-soft); color: var(--color-white); }
.label { flex: 1; }
.badge { font: var(--font-normal-small); font-family: var(--font-family-code); color: var(--color-primary-base); }
</style>
```

- [ ] **Step 3: Write the bottom navigation**

Write `app/components/AppBottomNav.vue`:

```vue
<script setup lang="ts">
import type { NavEntry } from '~/composables/useNavigation';

defineProps<{ entries: NavEntry[] }>();
const route = useRoute();
</script>

<template>
  <nav class="bar">
    <NuxtLink v-for="entry in entries" :key="entry.to" :to="entry.to" class="tab" :class="{ active: route.path === entry.to }">
      <kt-icon :name="entry.icon" size="18" />
      <span>{{ entry.label }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
.bar {
  position: fixed;
  inset: auto 0 0 0;
  z-index: var(--z-dropdown);
  display: flex;
  gap: 2px;
  padding: 8px 8px 10px;
  border-top: var(--border-width) solid var(--border-subtle);
  background: var(--color-dark-8);
}

.tab {
  flex: 1;
  /* 52px keeps the target inside the thumb zone on a phone. */
  min-height: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: var(--border-radius);
  text-decoration: none;
  font: var(--font-normal-small);
  color: var(--text-muted);
}

.tab.active { background: var(--color-primary-soft); color: var(--color-white); }
</style>
```

- [ ] **Step 4: Write the layout**

Write `app/layouts/default.vue`:

```vue
<script setup lang="ts">
import { useDueCounts } from '~/composables/useDueCounts';
import { useNavigation } from '~/composables/useNavigation';

const { total } = useDueCounts();
const { main, library, bar } = useNavigation(total);

// The mockup's breakpoint. Above it the sidebar; below it the bottom bar.
const wide = ref(true);
function measure() {
  wide.value = window.innerWidth >= 900;
}
onMounted(() => {
  measure();
  window.addEventListener('resize', measure);
});
onUnmounted(() => window.removeEventListener('resize', measure));
</script>

<template>
  <div class="shell">
    <AppSidebar v-if="wide" :main="main" :library="library" :due-total="total" />
    <main class="main">
      <div class="page">
        <slot />
      </div>
      <AppBottomNav v-if="!wide" :entries="bar" />
    </main>
  </div>
</template>

<style scoped>
.shell { display: flex; min-height: 100vh; background: var(--surface-page); color: var(--text-body); }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.page { flex: 1; min-width: 0; padding: 24px; padding-bottom: 96px; max-width: 1240px; width: 100%; margin: 0 auto; }
</style>
```

- [ ] **Step 5: Reduce app.vue to the router**

Write `app/app.vue`:

```vue
<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
```

- [ ] **Step 6: Commit**

```bash
git add app/layouts app/components app/composables/useNavigation.ts app/app.vue
git commit -m "Add the app shell: sidebar above 900px, bottom bar below

The navigation lists only routes that exist in this phase, so the
sidebar never offers a dead link; later phases add their entries when
their pages land.

Bottom-bar targets are 52px tall to stay inside the thumb zone on a
phone, which is where a review session is actually done."
```

---

### Task 11: The review session composable

**Files:**
- Create: `app/composables/useReviewSession.ts`, `app/composables/useDueCounts.ts`, `core/srs/format.ts`
- Test: `test/srs/format.test.ts`, `test/session/useReviewSession.test.ts`

**Interfaces:**
- Consumes: repositories, `schedulerFor`, `buildQueue`, `loadSettings`.
- Produces:
  - `formatInterval(ms: number): string` — "10 min", "1 d", "2.4 mo", "1.2 y"
  - `useReviewSession()` returning `{ start, grade, undo, reveal, current, card, revealed, previews, position, total, elapsed, ended, log, restore }`

- [ ] **Step 1: Write the failing formatter test**

Write `test/srs/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatInterval } from '~core/srs/format';

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe('formatInterval', () => {
  it('shows minutes below an hour', () => {
    expect(formatInterval(10 * MIN)).toBe('10 min');
  });

  it('never shows less than one minute', () => {
    expect(formatInterval(5_000)).toBe('1 min');
  });

  it('shows hours below a day', () => {
    expect(formatInterval(5 * HOUR)).toBe('5 h');
  });

  it('shows whole days below a month', () => {
    expect(formatInterval(12 * DAY)).toBe('12 d');
  });

  it('shows months below a year', () => {
    expect(formatInterval(90 * DAY)).toBe('3.0 mo');
  });

  it('shows years beyond that', () => {
    expect(formatInterval(420 * DAY)).toBe('1.2 y');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- test/srs/format.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the formatter**

Write `core/srs/format.ts`:

```ts
const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * The string on a grade button. It is deliberately coarse: the learner is
 * choosing between "soon" and "much later", and a precise "11.8 days" would
 * imply a precision the algorithm does not have.
 */
export function formatInterval(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))} min`;
  if (ms < DAY) return `${Math.round(ms / HOUR)} h`;
  const days = ms / DAY;
  if (days < 31) return `${Math.round(days)} d`;
  if (days < 365) return `${(days / 30.4).toFixed(1)} mo`;
  return `${(days / 365).toFixed(1)} y`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- test/srs/format.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the due-counts composable**

Write `app/composables/useDueCounts.ts`:

```ts
import { db } from '~core/db/db';
import { items } from '~core/db/repositories';
import { loadSettings } from '~core/db/settings';

const total = ref(0);
const byState = ref({ fresh: 0, learning: 0, review: 0 });

/** Shared across the shell and the Today page so both read one number. */
export function useDueCounts() {
  async function refresh(now = Date.now()): Promise<void> {
    const settings = await loadSettings();
    const due = await items.due(now);
    const introducedToday = await introducedSince(startOfDay(now));
    const fresh = await items.fresh(Math.max(0, settings.newPerDay - introducedToday));

    byState.value = {
      fresh: fresh.length,
      learning: due.filter((i) => i.state === 'learning' || i.state === 'relearning').length,
      review: due.filter((i) => i.state === 'review').length,
    };
    total.value = due.length + fresh.length;
  }

  if (import.meta.client) void refresh();

  return { total: readonly(total), byState: readonly(byState), refresh };
}

export function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** New cards introduced today, counted from the log rather than tracked. */
export async function introducedSince(since: number): Promise<number> {
  const recent = await db.reviews.where('reviewedAt').aboveOrEqual(since).toArray();
  return new Set(recent.filter((r) => r.before.state === 'new').map((r) => r.itemId)).size;
}
```

- [ ] **Step 6: Write the failing session test**

Write `test/session/useReviewSession.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { seedIfNeeded } from '~core/seed/seed';
import { useReviewSession } from '~/composables/useReviewSession';

const NOW = Date.parse('2026-09-16T08:00:00Z');

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedIfNeeded(NOW);
});

describe('useReviewSession', () => {
  it('starts with a card and nothing revealed', async () => {
    const session = useReviewSession();
    await session.start();
    expect(session.current.value).not.toBeNull();
    expect(session.revealed.value).toBe(false);
    expect(session.total.value).toBeGreaterThan(0);
  });

  it('previews all four intervals before a grade is chosen', async () => {
    const session = useReviewSession();
    await session.start();
    expect(Object.keys(session.previews.value).map(Number).sort()).toEqual([1, 2, 3, 4]);
  });

  it('advances to the next item after a grade', async () => {
    const session = useReviewSession();
    await session.start();
    const first = session.current.value!.id;
    session.reveal();
    await session.grade(3);
    expect(session.current.value?.id).not.toBe(first);
    expect(session.revealed.value).toBe(false);
  });

  it('writes a review row for every grade', async () => {
    const session = useReviewSession();
    await session.start();
    session.reveal();
    await session.grade(3);
    expect(await db.reviews.count()).toBe(1);
  });

  it('undo restores the previous item and its state exactly', async () => {
    const session = useReviewSession();
    await session.start();
    const first = session.current.value!;
    const before = (await db.items.get(first.id))!;
    session.reveal();
    await session.grade(3);
    await session.undo();
    expect(session.current.value!.id).toBe(first.id);
    expect(await db.items.get(first.id)).toEqual(before);
    expect(await db.reviews.count()).toBe(0);
  });

  it('ends when the queue is exhausted', async () => {
    const session = useReviewSession();
    await session.start();
    const total = session.total.value;
    for (let i = 0; i < total; i += 1) {
      session.reveal();
      await session.grade(3);
    }
    expect(session.ended.value).toBe(true);
  });

  it('resumes a session that was interrupted', async () => {
    const first = useReviewSession();
    await first.start();
    first.reveal();
    await first.grade(3);
    const positionBefore = first.position.value;

    const resumed = useReviewSession();
    await resumed.restore();
    expect(resumed.position.value).toBe(positionBefore);
    expect(resumed.ended.value).toBe(false);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm test -- test/session/useReviewSession.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement the session**

Write `app/composables/useReviewSession.ts`:

```ts
import { db } from '~core/db/db';
import { cards, items, reviews } from '~core/db/repositories';
import type { Card, Item } from '~core/db/schema';
import { loadSettings } from '~core/db/settings';
import { type Grade, type SrsState, schedulerFor } from '~core/srs';
import { buildQueue } from '~core/srs/queue';
import { introducedSince, startOfDay } from '~/composables/useDueCounts';

interface LogEntry {
  reviewId: string;
  itemId: string;
  grade: Grade;
}

interface PersistedSession {
  queueIds: string[];
  index: number;
  startedAt: number;
  log: LogEntry[];
}

const SESSION_KEY = 'session';

/**
 * A session is a queue plus a cursor, both persisted after every grade.
 * Persisting rather than holding it in memory is what lets a phone be locked
 * mid-session, or a tab be reloaded, without losing the learner's place — the
 * single most annoying thing a review app can do.
 */
export function useReviewSession() {
  const queue = ref<Item[]>([]);
  const index = ref(0);
  const revealed = ref(false);
  const startedAt = ref(Date.now());
  const shownAt = ref(Date.now());
  const log = ref<LogEntry[]>([]);
  const card = ref<Card | null>(null);
  const previews = ref<Record<Grade, SrsState>>({} as Record<Grade, SrsState>);

  const current = computed<Item | null>(() => queue.value[index.value] ?? null);
  const total = computed(() => queue.value.length);
  const position = computed(() => Math.min(index.value + 1, queue.value.length));
  const ended = computed(() => queue.value.length > 0 && index.value >= queue.value.length);
  const elapsed = computed(() => Date.now() - startedAt.value);

  async function refreshCurrent(): Promise<void> {
    const item = current.value;
    if (!item) {
      card.value = null;
      previews.value = {} as Record<Grade, SrsState>;
      return;
    }
    card.value = (await cards.get(item.cardId)) ?? null;
    const settings = await loadSettings();
    previews.value = schedulerFor(settings.algorithm).preview(item, Date.now(), {
      desiredRetention: settings.desiredRetention,
      maxInterval: settings.maxInterval,
    });
    revealed.value = false;
    shownAt.value = Date.now();
  }

  async function persist(): Promise<void> {
    const value: PersistedSession = {
      queueIds: queue.value.map((i) => i.id),
      index: index.value,
      startedAt: startedAt.value,
      log: log.value,
    };
    await db.settings.put({ key: SESSION_KEY, value });
  }

  async function start(now = Date.now()): Promise<void> {
    const settings = await loadSettings();
    const due = await items.due(now);
    const introducedToday = await introducedSince(startOfDay(now));
    const fresh = await items.fresh(Math.max(0, settings.newPerDay - introducedToday));

    queue.value = buildQueue({ due, fresh, newPerDay: settings.newPerDay, introducedToday });
    index.value = 0;
    log.value = [];
    startedAt.value = now;
    await refreshCurrent();
    await persist();
  }

  /** Rebuilds the queue from stored ids, dropping anything since deleted. */
  async function restore(): Promise<boolean> {
    const row = await db.settings.get(SESSION_KEY);
    const stored = row?.value as PersistedSession | undefined;
    if (!stored || stored.queueIds.length === 0) return false;

    const found = await db.items.bulkGet(stored.queueIds);
    queue.value = found.filter((i): i is Item => Boolean(i));
    index.value = Math.min(stored.index, queue.value.length);
    startedAt.value = stored.startedAt;
    log.value = stored.log;
    await refreshCurrent();
    return true;
  }

  function reveal(): void {
    revealed.value = true;
  }

  async function grade(value: Grade): Promise<void> {
    const item = current.value;
    if (!item) return;

    const settings = await loadSettings();
    const now = Date.now();
    const next = schedulerFor(settings.algorithm).apply(item, value, now, {
      desiredRetention: settings.desiredRetention,
      maxInterval: settings.maxInterval,
    });

    const reviewId = await reviews.record({
      item: { ...item, ...next, updatedAt: now },
      before: { ...item },
      grade: value,
      reviewedAt: now,
      durationMs: now - shownAt.value,
    });

    log.value = [...log.value, { reviewId, itemId: item.id, grade: value }];
    index.value += 1;
    await refreshCurrent();
    await persist();
  }

  async function undo(): Promise<void> {
    const last = log.value.at(-1);
    if (!last) return;
    await reviews.undo(last.reviewId);
    log.value = log.value.slice(0, -1);
    index.value = Math.max(0, index.value - 1);
    const restored = await items.get(last.itemId);
    if (restored) queue.value[index.value] = restored;
    await refreshCurrent();
    revealed.value = true;
    await persist();
  }

  return { queue, current, card, previews, revealed, index, position, total, ended, elapsed, log, start, restore, reveal, grade, undo };
}
```

- [ ] **Step 9: Run it to verify it passes**

Run: `npm test -- test/session/useReviewSession.test.ts`
Expected: PASS, 7 tests. Vue's auto-imported `ref`/`computed` are not available
under plain Vitest — add `imports: { dirs: [] }` is not enough, so add to
`vitest.config.ts`: `plugins: [AutoImport({ imports: ['vue'] })]` using
`unplugin-auto-import/vite`, installed with
`npm i -D unplugin-auto-import`, and alias `~` to the project root.

- [ ] **Step 10: Commit**

```bash
git add app/composables core/srs/format.ts test/srs/format.test.ts test/session
git commit -m "Add the review session, persisted after every grade

The queue and cursor are written to storage on each answer rather than
held in memory, so locking a phone or reloading a tab mid-session does
not lose the learner's place.

Undo pops the log and restores the item from the review row, so it is
exact rather than a recalculation, and the card returns already revealed
because the learner was looking at its answer."
```

---

### Task 12: The review page

**Files:**
- Create: `app/pages/review.vue`, `app/components/ReviewCard.vue`, `app/components/GradeButtons.vue`, `app/components/PinyinText.vue`
- Test: covered by Task 14's Playwright smoke.

**Interfaces:**
- Consumes: `useReviewSession`, `useSettings`, `formatInterval`, `toneColorToken`.
- Produces: the `/review` route.

- [ ] **Step 1: Write the pinyin display component**

Write `app/components/PinyinText.vue`:

```vue
<script setup lang="ts">
import type { PinyinSyllable } from '~core/chinese/pinyin';
import { toneColorToken } from '~core/chinese/tones';

const props = defineProps<{ syllables: PinyinSyllable[]; colored?: boolean; size?: string }>();

const color = (syllable: PinyinSyllable) =>
  props.colored === false ? 'var(--color-white)' : toneColorToken(syllable.tone);
</script>

<template>
  <span class="pinyin" :style="{ fontSize: size }">
    <span v-for="(syllable, i) in syllables" :key="i" :style="{ color: color(syllable) }">{{ syllable.text }}</span>
  </span>
</template>

<style scoped>
.pinyin { display: inline-flex; gap: 8px; font-family: var(--font-family-code); }
</style>
```

- [ ] **Step 2: Write the grade buttons**

Write `app/components/GradeButtons.vue`:

```vue
<script setup lang="ts">
import type { SrsState } from '~core/srs';
import { formatInterval } from '~core/srs/format';
import type { Grade } from '~core/srs/types';

const props = defineProps<{ previews: Record<Grade, SrsState> }>();
const emit = defineEmits<{ grade: [Grade] }>();

/**
 * Tone follows meaning: Again is danger, Easy is info. The interval sits on
 * the button so the learner sees the consequence before committing to it.
 */
const buttons: Array<{ grade: Grade; label: string; tone: string }> = [
  { grade: 1, label: 'Again', tone: 'danger' },
  { grade: 2, label: 'Hard', tone: 'warning' },
  { grade: 3, label: 'Good', tone: 'success' },
  { grade: 4, label: 'Easy', tone: 'info' },
];

const interval = (grade: Grade) => {
  const preview = props.previews[grade];
  return preview ? formatInterval(Math.max(0, preview.due - Date.now())) : '—';
};
</script>

<template>
  <div class="grades">
    <button v-for="button in buttons" :key="button.grade" :class="['grade', button.tone]" @click="emit('grade', button.grade)">
      <span class="label">{{ button.label }}</span>
      <span class="interval">{{ interval(button.grade) }}</span>
    </button>
  </div>
  <p class="hints">
    <kt-kbd>1</kt-kbd><kt-kbd>2</kt-kbd><kt-kbd>3</kt-kbd><kt-kbd>4</kt-kbd> to grade
    <kt-kbd>U</kt-kbd> undo
    <kt-kbd>?</kt-kbd> shortcuts
  </p>
</template>

<style scoped>
.grades { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 8px; }

.grade {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  justify-content: center;
  /* 56px keeps every grade inside the thumb zone on a phone. */
  min-height: 56px;
  padding: 12px 8px;
  border-radius: var(--border-radius);
  border: var(--border-width) solid;
  font: var(--font-normal-medium);
}

.grade.danger { border-color: var(--color-danger-base); background: var(--color-danger-soft); color: var(--color-danger-base); }
.grade.danger:hover { background: var(--color-danger-hover); }
.grade.warning { border-color: var(--color-warning-base); background: var(--color-warning-soft); color: var(--color-warning-base); }
.grade.warning:hover { background: var(--color-warning-hover); }
.grade.success { border-color: var(--color-success-base); background: var(--color-success-soft); color: var(--color-success-base); }
.grade.success:hover { background: var(--color-success-hover); }
.grade.info { border-color: var(--color-info-base); background: var(--color-info-soft); color: var(--color-info-base); }
.grade.info:hover { background: var(--color-info-hover); }

.interval { font-family: var(--font-family-code); font-size: 12px; }

.hints {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  margin: 0;
  font: var(--font-normal-small);
  color: var(--text-muted);
}
</style>
```

- [ ] **Step 3: Write the card**

Write `app/components/ReviewCard.vue`:

```vue
<script setup lang="ts">
import type { Card, Item } from '~core/db/schema';
import type { Settings } from '~core/db/settings';

defineProps<{ card: Card; item: Item; revealed: boolean; settings: Settings }>();
</script>

<template>
  <kt-card>
    <div slot="header" class="meta">
      <kt-badge variant="tag" :tone="item.dir === 'recognition' ? 'primary' : 'info'" size="small"
        :label="item.dir === 'recognition' ? 'Recognition · 字 → meaning' : 'Production · meaning → 字'" />
      <span class="state">{{ item.state }}</span>
    </div>

    <div class="face">
      <div v-if="item.dir === 'recognition'" class="hanzi">{{ card.hanzi }}</div>
      <div v-else class="prompt">
        <p class="overline">Write the character</p>
        <p class="meaning">{{ card.translation }}</p>
        <PinyinText v-if="!settings.hidePinyinUntilRevealed" :syllables="card.pinyin" :colored="settings.toneColors" size="22px" />
      </div>

      <div v-if="revealed" class="answer">
        <div v-if="item.dir === 'production'" class="hanzi answer-hanzi">{{ card.hanzi }}</div>
        <PinyinText :syllables="card.pinyin" :colored="settings.toneColors" size="28px" />
        <span v-if="settings.showZhuyin" class="zhuyin">{{ card.zhuyin }}</span>
        <p class="meaning">{{ card.translation }}</p>
        <div class="tags">
          <kt-badge v-for="tag in card.tags" :key="tag" variant="tag" tone="neutral" size="small" :label="tag" />
        </div>
        <div v-if="card.example" class="example">
          <p class="overline">Example</p>
          <p class="example-hanzi">{{ card.example }}</p>
          <p class="example-pinyin">{{ card.examplePinyin }}</p>
          <p class="example-translation">{{ card.exampleTranslation }}</p>
        </div>
        <p v-if="card.note" class="note">Mnemonic · {{ card.note }}</p>
      </div>
    </div>
  </kt-card>
</template>

<style scoped>
.meta { display: flex; align-items: center; gap: 8px; }
.state { margin-left: auto; font: var(--font-normal-small); font-family: var(--font-family-code); color: var(--text-muted); }

.face {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 48px 24px;
  min-height: 320px;
  text-align: center;
}

.hanzi {
  font-family: var(--fk-font-hanzi);
  font-size: clamp(88px, 16vw, 168px);
  line-height: 1.05;
  letter-spacing: 6px;
  color: var(--color-white);
}

.answer-hanzi { font-size: clamp(64px, 11vw, 110px); }
.prompt { display: flex; flex-direction: column; gap: 14px; align-items: center; }

.overline {
  margin: 0;
  font: var(--font-title-overline);
  letter-spacing: var(--letter-spacing-overline);
  text-transform: uppercase;
  color: var(--text-muted);
}

.meaning { margin: 0; font: var(--font-title-h4); color: var(--color-white); max-width: 560px; }

.answer {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  width: 100%;
  border-top: var(--border-width) solid var(--border-subtle);
  padding-top: 24px;
}

.zhuyin { font-family: var(--fk-font-hanzi-sans); font-size: 18px; color: var(--text-muted); letter-spacing: 2px; }
.tags { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }

.example {
  width: 100%;
  max-width: 620px;
  border: var(--border-width) solid var(--border-subtle);
  border-radius: var(--border-radius);
  padding: 16px;
  text-align: left;
  background: var(--surface-field);
}

.example p { margin: 0 0 8px; }
.example-hanzi { font-family: var(--fk-font-hanzi); font-size: 26px; line-height: 1.5; color: var(--color-white); }
.example-pinyin { font-family: var(--font-family-code); font-size: 13px; color: var(--text-muted); }
.example-translation { font: var(--font-normal-regular); color: var(--text-body); }
.note { margin: 0; width: 100%; max-width: 620px; text-align: left; font: var(--font-normal-small); color: var(--text-muted); }
</style>
```

- [ ] **Step 4: Write the page**

Write `app/pages/review.vue`:

```vue
<script setup lang="ts">
import { useDueCounts } from '~/composables/useDueCounts';
import { useReviewSession } from '~/composables/useReviewSession';
import { useSettings } from '~/composables/useSettings';

const session = useReviewSession();
const { settings } = useSettings();
const { refresh } = useDueCounts();

onMounted(async () => {
  // Resume rather than restart: the learner may have locked their phone.
  if (!(await session.restore())) await session.start();
  window.addEventListener('keydown', onKey);
});
onUnmounted(() => window.removeEventListener('keydown', onKey));

async function grade(value: 1 | 2 | 3 | 4) {
  await session.grade(value);
  await refresh();
}

function onKey(event: KeyboardEvent) {
  const tag = (event.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  if (event.code === 'Space' || event.key === 'Enter') {
    event.preventDefault();
    session.revealed.value ? void grade(3) : session.reveal();
  } else if (session.revealed.value && ['1', '2', '3', '4'].includes(event.key)) {
    event.preventDefault();
    void grade(Number(event.key) as 1 | 2 | 3 | 4);
  } else if (event.key.toLowerCase() === 'u') {
    void session.undo();
  }
}

const progress = computed(() => (session.total.value === 0 ? 0 : (session.index.value / session.total.value) * 100));
</script>

<template>
  <div class="review">
    <header class="bar">
      <div class="progress">
        <div class="counts">
          <span>Session</span>
          <span class="mono">{{ session.position.value }} / {{ session.total.value }}</span>
        </div>
        <kt-progress-bar :value="progress" />
      </div>
      <kt-button variant="secondary-no-bg" size="small" icon="undo-2" label="Undo" @click="session.undo()" />
      <kt-button variant="secondary-no-bg" size="small" icon="x" label="Leave session" @click="navigateTo('/')" />
    </header>

    <kt-card v-if="session.ended.value" class="done">
      <div class="done-body">
        <span class="seal">完</span>
        <h2>Session complete</h2>
        <p>{{ session.log.value.length }} cards graded.</p>
        <kt-button variant="primary" size="medium" icon="house" @click="navigateTo('/')">Back to today</kt-button>
      </div>
    </kt-card>

    <kt-empty-state
      v-else-if="session.total.value === 0"
      icon="check"
      heading="Nothing due"
      description="Everything scheduled for today is done. Come back tomorrow, or add cards."
    />

    <template v-else-if="session.card.value && session.current.value">
      <ReviewCard
        :card="session.card.value"
        :item="session.current.value"
        :revealed="session.revealed.value"
        :settings="settings"
      />
      <kt-button v-if="!session.revealed.value" variant="primary" size="large" full-width @click="session.reveal()">
        Show answer
      </kt-button>
      <GradeButtons v-else :previews="session.previews.value" @grade="grade" />
    </template>

    <kt-skeleton v-else height="320px" />
  </div>
</template>

<style scoped>
.review { display: flex; flex-direction: column; gap: 20px; }
.bar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.progress { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 6px; }
.counts { display: flex; justify-content: space-between; font: var(--font-normal-small); color: var(--text-muted); }
.mono { font-family: var(--font-family-code); }
.done-body { display: flex; flex-direction: column; align-items: center; gap: 24px; text-align: center; }
.seal { font-family: var(--fk-font-hanzi-serif); font-size: 56px; color: var(--color-primary-base); }
.done-body h2 { margin: 0; font: var(--font-title-h1); color: var(--color-white); }
.done-body p { margin: 0; color: var(--text-muted); }
</style>
```

- [ ] **Step 5: Verify by hand**

Run: `npm run dev`, open `/review`.
Expected: a seeded card appears, Space reveals it, `1`–`4` grade it and the
next card appears, `U` steps back with the answer showing, and the progress bar
advances. Reload mid-session: the same position is restored.

- [ ] **Step 6: Commit**

```bash
git add app/pages/review.vue app/components
git commit -m "Add the review page

The interval sits on each grade button, so the learner sees what
pressing it will do before committing. Grades are 56px tall to stay in
the thumb zone on a phone, and the same actions are on the keyboard for
desktop, which is where a long session is actually done.

The page resumes rather than restarts on mount, because arriving here
after locking a phone should not cost the session."
```

---

### Task 13: The Today page

**Files:**
- Create: `app/pages/index.vue`
- Modify: `app/plugins/seed.client.ts` (create)
- Test: covered by Task 14.

**Interfaces:**
- Consumes: `useDueCounts`, `seedIfNeeded`, `decks`, `items`.
- Produces: the `/` route.

- [ ] **Step 1: Seed on first run**

Write `app/plugins/seed.client.ts`:

```ts
import { seedIfNeeded } from '~core/seed/seed';

/**
 * Runs before the first paint on the client. Seeding is idempotent, so this
 * costs one settings read on every subsequent launch.
 */
export default defineNuxtPlugin(async () => {
  await seedIfNeeded(Date.now());
});
```

- [ ] **Step 2: Write the page**

Write `app/pages/index.vue`:

```vue
<script setup lang="ts">
import { decks as deckRepo } from '~core/db/repositories';
import type { Deck } from '~core/db/schema';
import { useDueCounts } from '~/composables/useDueCounts';

const { total, byState, refresh } = useDueCounts();
const decks = ref<Deck[]>([]);

onMounted(async () => {
  await refresh();
  decks.value = await deckRepo.listAll();
});

/** Roughly eight seconds a card, which is what a steady session averages. */
const minutes = computed(() => Math.max(1, Math.round((total.value * 8) / 60)));
</script>

<template>
  <div class="today">
    <header class="head">
      <p class="overline">Dashboard</p>
      <h1>Today</h1>
    </header>

    <kt-card>
      <div class="summary">
        <div class="counts">
          <kt-stat label="New" :value="String(byState.fresh)" size="small" />
          <kt-stat label="Learning" :value="String(byState.learning)" size="small" />
          <kt-stat label="To review" :value="String(byState.review)" size="small" />
        </div>
        <p class="eta">{{ total }} cards due · about {{ minutes }} min</p>
        <kt-button variant="primary" size="large" icon="play" full-width :disabled="total === 0" @click="navigateTo('/review')">
          Start session
        </kt-button>
      </div>
    </kt-card>

    <kt-empty-state
      v-if="decks.length === 0"
      icon="layers"
      heading="No decks yet"
      description="Seeded decks load on first launch. If none appeared, reload the page."
    />

    <kt-card v-else>
      <h6 slot="header">Decks</h6>
      <ul class="decks">
        <li v-for="deck in decks" :key="deck.id">
          <span class="swatch" :style="{ background: deck.colorToken }" />
          <span class="name">{{ deck.name }}</span>
          <kt-badge variant="category" tone="neutral" size="small" :label="deck.tag" />
        </li>
      </ul>
    </kt-card>
  </div>
</template>

<style scoped>
.today { display: flex; flex-direction: column; gap: 24px; }
.head { display: flex; flex-direction: column; gap: 2px; }
.overline { margin: 0; font: var(--font-title-overline); letter-spacing: var(--letter-spacing-overline); text-transform: uppercase; color: var(--text-muted); }
.head h1 { margin: 0; font: var(--font-title-h4); color: var(--color-white); }
.summary { display: flex; flex-direction: column; gap: 16px; }
.counts { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
.eta { margin: 0; font: var(--font-normal-small); color: var(--text-muted); }
.decks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.decks li { display: flex; align-items: center; gap: 10px; padding: 12px; border: var(--border-width) solid var(--border-subtle); border-radius: var(--border-radius); }
.swatch { width: 4px; height: 26px; border-radius: var(--radius-full); }
.name { flex: 1; min-width: 0; font: var(--font-normal-medium); color: var(--text-body); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
```

- [ ] **Step 3: Verify by hand**

Run: `npm run dev`, open `/`.
Expected: the seeded deck is listed, the counts are non-zero on a fresh
profile, and "Start session" navigates to a card.

- [ ] **Step 4: Commit**

```bash
git add app/pages/index.vue app/plugins/seed.client.ts
git commit -m "Add the Today page and seed on first launch

One primary button on the screen, and it starts the session, because
that is the only thing this page exists to make easy.

Seeding runs from a client plugin and is idempotent, so a returning
launch costs one settings read."
```

---

### Task 14: The smoke test

**Files:**
- Create: `playwright.config.ts`, `e2e/review.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: the running dev server.
- Produces: `npm run test:e2e`.

- [ ] **Step 1: Install and configure Playwright**

```bash
npm i -D @playwright/test
npx playwright install chromium
```

Write `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

Add to `package.json` scripts: `"test:e2e": "playwright test"`.

- [ ] **Step 2: Write the test**

Write `e2e/review.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('a learner can complete and resume a review', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  await page.getByText('Start session').click();
  await expect(page).toHaveURL(/\/review/);

  const position = page.locator('.mono');
  await expect(position).toContainText('1 /');

  await page.getByText('Show answer').click();
  await expect(page.getByText('Good')).toBeVisible();

  await page.getByText('Good').click();
  await expect(position).toContainText('2 /');

  // The session survives a reload — the point of persisting it.
  await page.reload();
  await expect(position).toContainText('2 /');

  // Undo steps back and shows the answer again.
  await page.keyboard.press('u');
  await expect(position).toContainText('1 /');
});

test('the keyboard drives the whole loop', async ({ page }) => {
  await page.goto('/review');
  const position = page.locator('.mono');
  await expect(position).toContainText('1 /');

  await page.keyboard.press('Space');
  await page.keyboard.press('3');
  await expect(position).toContainText('2 /');
});
```

- [ ] **Step 3: Run it**

Run: `npm run test:e2e`
Expected: both tests PASS. A failure here means the loop is broken for a real
user even if every unit test passes — fix the app, not the test.

- [ ] **Step 4: Run everything**

```bash
npm test
npm run test:e2e
npm run build:app
```
Expected: all unit tests pass, both e2e tests pass, and the static build
succeeds. Record the actual output; do not claim success without it.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e package.json
git commit -m "Add an end-to-end smoke test of the review loop

It covers what the unit tests cannot: that starting a session, revealing,
grading, reloading and undoing work together in a browser. A failure here
means the app is broken for a real learner even when every unit test is
green."
```

---

## Self-Review

**Spec coverage.** §1 language → Global Constraints and Task 8's English seed
data. §2.1 two targets → Task 1 (`build`, `build:app`). §2.2 modules → Tasks
2-9. §3 data model → Task 6, including the `learningSteps` amendment.
§3.3 settings → Task 7. §4 scheduling and its invariant → Tasks 4, 5, and the
"applies exactly what it previewed" test in both. §4.1 queue → Task 9.
§5 Chinese layer → Tasks 2, 3; stroke data is Phase 1 of `core/chinese` only
in its pure parts, and the stroke fetch is deferred to Phase 3 with the Writing
screen, where it is first rendered. §6 Kanto → Tasks 10-13 use `kt-button`,
`kt-icon`, `kt-card`, `kt-badge`, `kt-stat`, `kt-progress-bar`, `kt-kbd`,
`kt-empty-state`, `kt-skeleton`; the remaining elements arrive with the screens
that need them in Phases 2-3. §7 screens → Today and Review here, the rest in
Phases 2-3 per the phase map. §8 interaction → Tasks 11-13. §9 offline/native →
Phase 4. §10 sync → Phase 5, but its foundation, the outbox, is written in Task
6 so no mutation made in Phases 1-4 is lost. §11 seed → Task 8. §12 testing →
every task, plus Task 14. §13 delivery → Phase 5.

**Gaps found and closed.** The spec's §5 stroke-data caching had no Phase 1
task and no later home; it is now explicitly assigned to Phase 3 above rather
than left implied. The spec's `Item` lacked `learningSteps`; the spec was
amended before this plan was written, and Task 4's types carry it.

**Placeholder scan.** No "TBD", "add error handling" or "similar to Task N".
Every code step contains the code. The one instruction that defers is the phase
map, which is a stated boundary rather than a hole.

**Type consistency.** `SrsState` is defined in Task 4 and consumed unchanged by
Tasks 5, 6, 11. `Item extends SrsState` in Task 6, which is why
`{ ...item, ...next }` in Task 11 type-checks. `Grade` is `1|2|3|4` everywhere
and matches ts-fsrs' `Rating`. `itemId(cardId, dir)` is defined in Task 6 and
used in its own tests only. `formatInterval` is defined in Task 11 and used in
Task 12. `NavEntry` is defined in Task 10 and used by both nav components.
`useDueCounts` exports `startOfDay` and `introducedSince`, which Task 11
imports — declared in Task 11's Interfaces block.
