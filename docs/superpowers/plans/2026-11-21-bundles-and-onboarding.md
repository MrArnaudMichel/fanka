# Bundles and onboarding (phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The learner chooses Mainland or Taiwan at a first-launch onboarding; the app shows only that bundle's decks, in its script, fonts and voice; Speaking is gone.

**Architecture:** A bundle is a setting (`Settings.bundle`) and a deck property (`Deck.bundle`). One module-level scope in `core/db` holds the active bundle; the repositories' existing deck-visibility check consults it, so every screen filters without per-page changes. A global route middleware sends a learner who has not onboarded to `/welcome`.

**Tech Stack:** Nuxt 4 (SPA), Vue 3, Dexie 4, Kanto web components, Supabase, Vitest + fake-indexeddb, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-21-mainland-taiwan-curriculum-design.md` (phase 1 of 3)

## Global Constraints

- `core/srs`, `core/chinese` and `core/curriculum` are pure: no Vue, Nuxt, Dexie or Capacitor imports.
- Pages reach data only through composables.
- Kanto first; a native interactive or structural element in `app/` needs an entry in `test/integrity/native-elements.allowlist.ts`.
- All copy English, sentence case, terse, no emoji. Colours, sizes, durations, radii are Kanto tokens.
- Bundle values: exactly `'mainland' | 'taiwan'`. Mainland = simplified, pinyin, `zh-CN`. Taiwan = traditional, zhuyin and pinyin, `zh-TW`.
- Content rule (replaces "Traditional characters only"): "Content is in its bundle's script: traditional for Taiwan, simplified for Mainland. Never mixed."
- Existing decks, cards, reviews and attempts are never deleted or hidden from a Taiwan learner.
- Commits are authored by Arnaud Michel alone; no AI trailer.

## Review Focus

- A deck synced from the server by an older app version (no `bundle`) → reads as `taiwan`, stays visible to a Taiwan learner. Test in Task 2.
- A learner switches bundle with a review session open in another tab → the next due query reflects the new bundle; nothing is written to the hidden decks. Test in Task 4 (repository level).
- A device with no Chinese voice for the bundle's region (e.g. only `zh-TW` on a Mainland learner's phone) → falls back to any Chinese voice rather than going silent. Test in Task 5.
- Restoring a backup made before this change (decks without `bundle`) → decks come back as `taiwan`. Test in Task 2.
- Legal pages (`/privacy`, `/delete-account`, `/licences`) opened from the Play listing before onboarding → shown, not redirected. Test in Task 8.

---

### Task 1: Script guard in both directions

**Files:**
- Modify: `scripts/build-simplified-set.mjs` → also writes `core/chinese/data/traditional-only.json`
- Modify: `core/chinese/script.ts`, `core/import/validate.ts`, `core/import/rows.ts`, `core/seed/seed.ts`, `app/composables/useCardEditor.ts`
- Test: `test/chinese/script.test.ts`, `test/import/validate.test.ts`

**Interfaces:**
- Produces: `type Bundle = 'mainland' | 'taiwan'` exported from `core/chinese/script.ts`; `traditionalCharactersIn(text: string): string[]`; `wrongScriptCharactersIn(text: string, bundle: Bundle): string[]`; `validateCard(draft: CardDraft, existingHanzi: ReadonlySet<string>, bundle: Bundle): Validated`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/chinese/script.test.ts
describe('traditionalCharactersIn', () => {
  it('finds characters that exist only in traditional form', () => {
    expect(traditionalCharactersIn('學習時間')).toEqual(['學', '習', '時', '間']);
  });
  it('ignores characters shared by both scripts', () => {
    expect(traditionalCharactersIn('中文人大')).toEqual([]);
  });
});
describe('wrongScriptCharactersIn', () => {
  it('flags simplified for Taiwan and traditional for Mainland', () => {
    expect(wrongScriptCharactersIn('学習', 'taiwan')).toEqual(['学']);
    expect(wrongScriptCharactersIn('学習', 'mainland')).toEqual(['習']);
  });
});
// test/import/validate.test.ts
it('rejects traditional characters in a Mainland deck', () => {
  const result = validateCard(draft({ hanzi: '學習' }), NO_EXISTING, 'mainland');
  expect(result.issues).toContainEqual(expect.objectContaining({ field: 'hanzi', severity: 'error', message: 'Traditional characters: 學, 習' }));
});
```

Existing `validateCard` tests pass `'taiwan'` as the third argument; their expectations are unchanged.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/chinese/script.test.ts test/import/validate.test.ts`
Expected: FAIL, `traditionalCharactersIn` is not exported.

- [ ] **Step 3: Generate the traditional-only set**

In `scripts/build-simplified-set.mjs`, add: a character is traditional-only when it is a key in `TSCharacters.txt` whose targets do not include it, and it is not a key in `STCharacters.txt`. Write `core/chinese/data/traditional-only.json` in the same shape as `simplified-only.json`. Run `npm run build:chinese-data`.

- [ ] **Step 4: Implement the functions and thread `bundle` through `validateCard`**

`validateCard`'s message is `Simplified characters: …` for Taiwan and `Traditional characters: …` for Mainland. Callers pass: `rows.ts` and `useCardEditor.ts` the target deck's `bundle`; `seed.ts` `'taiwan'`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/chinese test/import test/seed`
Expected: PASS.

- [ ] **Step 6: Commit** — `Guard content against the other script, for either bundle`

### Task 2: Decks belong to a bundle

**Files:**
- Modify: `core/db/schema.ts` (`Deck.bundle`), `core/db/db.ts` (version 5), `core/db/repositories.ts` (`decks.create` input), `core/db/backup.ts`, `core/sync/supabase.ts`, `core/seed/seed.ts`, `core/seed/radicals.ts`
- Create: `supabase/migrations/0004_deck_bundle.sql`
- Test: `test/db/migration-v5.test.ts`, `test/sync/supabase.test.ts`, `test/db/backup.test.ts`

**Interfaces:**
- Consumes: `Bundle` (Task 1).
- Produces: `Deck.bundle: Bundle`; `decks.create(input: { name; description; colorToken; tag; bundle: Bundle }, now)`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/db/migration-v5.test.ts — open a version-4 database with two decks, then the app's db
it('gives every existing deck the Taiwan bundle', async () => {
  expect((await db.decks.toArray()).map((d) => d.bundle)).toEqual(['taiwan', 'taiwan']);
});
// test/sync/supabase.test.ts
it('reads a deck row without bundle as Taiwan', () => {
  expect(deckFromRow({ ...row, bundle: undefined }).bundle).toBe('taiwan');
});
it('writes the deck bundle', () => {
  expect(deckToRow({ ...deck, bundle: 'mainland' }, 'u').bundle).toBe('mainland');
});
// test/db/backup.test.ts
it('restores a backup made before bundles with Taiwan decks', async () => { /* plan from a v1 backup without bundle → decks.bundle === 'taiwan' */ });
```

Export `deckFromRow`/`deckToRow` from `core/sync/supabase.ts` if they are not.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/db/migration-v5.test.ts test/sync/supabase.test.ts test/db/backup.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Dexie `version(5)`: no new index; `upgrade` sets `bundle: 'taiwan'` on every deck without one. It does not write outbox entries (the server column defaults to `taiwan`).
- `0004_deck_bundle.sql`: `alter table public.decks add column bundle text not null default 'taiwan' check (bundle in ('mainland','taiwan'));`
- `deckFromRow`: `bundle: row.bundle ?? 'taiwan'`; `deckToRow` writes it.
- Backup restore defaults a missing `bundle` to `'taiwan'`.
- The seed deck and the radicals deck are created with `bundle: 'taiwan'`.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit** — `Give every deck a bundle, Taiwan for the existing ones`

### Task 3: Bundle, onboarding and reading settings

**Files:**
- Modify: `core/db/settings.ts`, `app/components/ReviewCard.vue`, `app/components/WritingCard.vue`, `app/pages/settings/display.vue`
- Test: `test/db/settings.test.ts`

**Interfaces:**
- Produces: `Settings.bundle: Bundle | null` (default `null`), `Settings.onboardedAt: number | null` (default `null`), `Settings.dailyLessons: 1 | 2 | 3` (default `1`), `Settings.reading: 'zhuyin' | 'pinyin' | 'both'` (default `'both'`); `showZhuyin` removed. `showsZhuyin(s: Pick<Settings, 'bundle' | 'reading'>): boolean`, `showsPinyin(s: Pick<Settings, 'bundle' | 'reading'>): boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
it('maps the old showZhuyin onto reading once', async () => {
  await db.settings.put({ key: 'settings', value: { showZhuyin: true } });
  expect((await loadSettings()).reading).toBe('both');
  await db.settings.put({ key: 'settings', value: { showZhuyin: false } });
  expect((await loadSettings()).reading).toBe('pinyin');
});
it('drops an unknown bundle back to null', async () => {
  await db.settings.put({ key: 'settings', value: { bundle: 'hongkong' } });
  expect((await loadSettings()).bundle).toBeNull();
});
it('shows pinyin only for Mainland, whatever reading says', () => {
  expect(showsZhuyin({ bundle: 'mainland', reading: 'zhuyin' })).toBe(false);
  expect(showsPinyin({ bundle: 'mainland', reading: 'zhuyin' })).toBe(true);
  expect(showsZhuyin({ bundle: 'taiwan', reading: 'both' })).toBe(true);
  expect(showsPinyin({ bundle: 'taiwan', reading: 'zhuyin' })).toBe(false);
});
```

- [ ] **Step 2: Run, see them fail** — `npx vitest run test/db/settings.test.ts`

- [ ] **Step 3: Implement**, then replace `showZhuyin` in `ReviewCard.vue` and `WritingCard.vue` with `showsZhuyin`/`showsPinyin`, and in Display settings replace the zhuyin toggle with a "Reading" choice (Zhuyin / Pinyin / Both, Kanto segmented control or radio group), shown only when the bundle is Taiwan.

- [ ] **Step 4: Run** — `npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit** — `Add bundle, onboarding and reading settings`

### Task 4: Show only the active bundle

**Files:**
- Create: `core/db/bundle-scope.ts`
- Modify: `core/db/repositories.ts` (`cardVisible`, `decks.listAll`, `stats.snapshot`), `core/db/study-decks.ts`, `app/composables/useSettings.ts` (`applyTheme`), `app/assets/css/fanka.css`, `app/composables/useNavigation.ts`
- Test: `test/db/bundle-scope.test.ts`

**Interfaces:**
- Consumes: `Deck.bundle` (Task 2), `Settings.bundle` (Task 3).
- Produces: `setActiveBundle(b: Bundle | null): void`, `activeBundle(): Bundle | null`, `deckInScope(deck: Pick<Deck, 'deletedAt' | 'bundle'>): boolean` (not deleted, and bundle equals the active one; with no active bundle, every live deck). `<html data-bundle="mainland|taiwan">`.

- [ ] **Step 1: Write the failing tests** (fake-indexeddb, a Taiwan deck and a Mainland deck each with one due card)

```ts
it('lists, schedules and counts only the active bundle', async () => {
  setActiveBundle('mainland');
  expect((await decks.listAll()).map((d) => d.bundle)).toEqual(['mainland']);
  expect((await items.due(NOW)).every((i) => i.cardId === mainlandCard.id)).toBe(true);
  setActiveBundle('taiwan');
  expect((await decks.listAll()).map((d) => d.bundle)).toEqual(['taiwan']);
});
it('keeps statistics to the active bundle', async () => { /* an attempt in each deck → snapshot holds only the active one's */ });
it('picks up a switch on the next query, without a reload', async () => { /* query, switch, query again */ });
```

- [ ] **Step 2: Run, see them fail** — `npx vitest run test/db/bundle-scope.test.ts`

- [ ] **Step 3: Implement**

- `cardVisible` and `listAll` and `study-decks`' live filter use `deckInScope`. `stats.snapshot` drops attempts whose deck is out of scope.
- `useSettings`: `applyTheme` also calls `setActiveBundle(value.bundle)` and sets `root.dataset.bundle` (removed when null).
- `fanka.css`: load Noto Serif SC and Noto Sans SC next to the TC families; under `[data-bundle='mainland']`, `--fk-font-hanzi-serif` and `--fk-font-hanzi-sans` name the SC families first.
- `useNavigation`: the Radicals entry only when the bundle is Taiwan (its data is traditional). `useNavigation` reads the bundle through `useSettings()`.

- [ ] **Step 4: Run** — `npm test && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit** — `Show only the active bundle's decks, fonts and radicals`

### Task 5: Speech in the bundle's voice

**Files:**
- Modify: `app/composables/useSpeech.ts`
- Test: `test/composables/useSpeech.test.ts`

**Interfaces:**
- Produces: `pickChineseLanguage(languages: string[], bundle: Bundle | null): string | null`.

- [ ] **Step 1: Write the failing tests**

```ts
it('prefers zh-CN for Mainland and zh-TW for Taiwan', () => {
  const all = ['en-US', 'zh-TW', 'zh_CN', 'zh-HK'];
  expect(pickChineseLanguage(all, 'mainland')).toBe('zh_CN');
  expect(pickChineseLanguage(all, 'taiwan')).toBe('zh-TW');
});
it('falls back to any Chinese voice', () => {
  expect(pickChineseLanguage(['zh-TW'], 'mainland')).toBe('zh-TW');
  expect(pickChineseLanguage(['en-US'], 'taiwan')).toBeNull();
});
```

- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement.** `useSpeech` keeps the language list from `ready` and picks with `activeBundle()` at each `speak`, so a bundle switch needs no reload.
- [ ] **Step 4: Run** — `npx vitest run test/composables/useSpeech.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `Speak in the bundle's voice`

### Task 6: Remove Speaking

**Files:**
- Delete: `app/pages/speaking.vue`, `app/components/SpeakingQuestionCard.vue`, `core/speaking/`, `test/speaking/`
- Modify: `app/composables/useNavigation.ts` (entry), `app/plugins/kanto.client.ts` (the `Mic` icon if nothing else uses it)

- [ ] **Step 1: Delete and unlink.** `grep -rn "speaking\|Speaking\|SPEAKING_LESSONS" app core test e2e` returns only unrelated uses (the `speaking` flag of `useSpeech`).
- [ ] **Step 2: Run** — `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 3: Commit** — `Remove the Speaking page`

### Task 7: Onboarding

**Files:**
- Create: `core/db/onboarding.ts`, `app/middleware/onboarding.global.ts`, `app/pages/welcome.vue`, `app/composables/useOnboarding.ts`
- Create: `e2e/fixtures/onboarded.ts`; modify every `e2e/*.spec.ts` to import `test` from it
- Create: `e2e/onboarding.spec.ts`
- Test: `test/db/onboarding.test.ts`

**Interfaces:**
- Consumes: settings (Task 3), reminder settings and permission (`useReminder`), sign-in (`useAuth`).
- Produces: `needsOnboarding(s: Pick<Settings, 'onboardedAt'>, path: string): boolean` (false for `/welcome`, `/privacy`, `/delete-account`, `/licences`); `suggestedBundle(): Promise<Bundle | null>` (`'taiwan'` when any deck has a card or any attempt exists, else `null`); `useOnboarding()` with `finish(choice: { bundle: Bundle; dailyLessons: 1 | 2 | 3 }): Promise<void>` saving both plus `onboardedAt` in one `update`.

- [ ] **Step 1: Write the failing tests**

```ts
it('sends a learner who has not onboarded to /welcome, except to legal pages', () => {
  expect(needsOnboarding({ onboardedAt: null }, '/')).toBe(true);
  expect(needsOnboarding({ onboardedAt: null }, '/privacy')).toBe(false);
  expect(needsOnboarding({ onboardedAt: 1 }, '/')).toBe(false);
});
it('suggests Taiwan to an install that already has study history', async () => { /* one card → 'taiwan'; empty → null */ });
```

- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement the middleware and page.** Steps, one per screen, Back and Continue (Kanto buttons), progress dots:
  1. "Learn Chinese, one card at a time." — Continue.
  2. "What do you want to learn?" — two choice cards: "Mainland Chinese" ("Simplified characters, pinyin, HSK") and "Taiwanese Mandarin" ("Traditional characters, zhuyin and pinyin, TBCL"). Preselected from `suggestedBundle()`.
  3. "How many lessons a day?" — 1, 2, 3. (The level step arrives with lessons in phase 3.)
  4. "Remind me" — reminder time, with the existing permission prompt; "Not now" skips.
  5. "Sync across devices" — the existing sign-in form; "Not now" skips.
  Finishing calls `finish` and goes to `/`.
- [ ] **Step 4: e2e.** `e2e/fixtures/onboarded.ts` extends Playwright's `test` with an auto fixture that opens `/welcome`, picks Taiwanese Mandarin, skips the rest. `e2e/onboarding.spec.ts`: a fresh browser lands on `/welcome`; picking Mainland Chinese and finishing leads to `/` with `data-bundle="mainland"`; `/privacy` opens without a redirect.
- [ ] **Step 5: Run** — `npm test && npm run typecheck && npm run test:e2e`. Expected: PASS.
- [ ] **Step 6: Commit** — `Ask what to learn at first launch`

### Task 8: Switching bundle, rules and docs

**Files:**
- Modify: `app/pages/settings/study.vue`, `CLAUDE.md`, and any app copy that still says the app is traditional-only
- Test: `e2e/settings.spec.ts`

- [ ] **Step 1: Write the failing e2e test** — in Settings › Study, choosing "Mainland Chinese" updates `data-bundle` and the Decks page no longer lists "HSK 1 — traditional"; switching back lists it again.
- [ ] **Step 2: Implement** a "What you learn" choice at the top of Study settings (same two options and copy as onboarding), with the hint "Each has its own decks and progress. Nothing is deleted."
- [ ] **Step 3:** Replace the `CLAUDE.md` rule "Traditional characters only in content. Never simplified." with the content rule from Global Constraints. Grep app copy for "traditional" and fix any line that now misdescribes the app.
- [ ] **Step 4: Run** — `npm test && npm run typecheck && npm run test:e2e`. Expected: PASS.
- [ ] **Step 5: Commit** — `Let the learner switch between Mainland and Taiwan`

## Deferred to later phases

- The 20-word `hsk1-traditional` seed stays, as a Taiwan deck, until phase 3 replaces it with lessons: removing it now would leave a new install empty, and the e2e suite builds on it.
- Switching to the bundle an account already studies on sign-in needs `lessonProgress` (phase 3).
- Radicals for Mainland need a simplified radical set (later; the entry is hidden for Mainland meanwhile).
