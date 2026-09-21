# Fanka Phase 2 — Kanto-first foundation and the collection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild phase 1's hand-made interface on real Kanto components, then add the collection — decks, deck detail, browse, add/edit, and CSV or pasted-text import.

**Architecture:** Pure cores first and test-first (`core/chinese`, `core/import`), repositories over Dexie next, composables over those, pages that only render Kanto elements. An integrity test makes "use Kanto, don't recreate it" a failing test rather than a convention.

**Tech Stack:** Nuxt 4 (`ssr: false`), Vue 3.5, TypeScript, Kanto 1.0.1 from `file:../kanto`, Lit (for `kt-table`'s `renderCell`), Dexie 4, Vitest with happy-dom and fake-indexeddb, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-21-fanka-phase-2-design.md` (and its parent, `docs/superpowers/specs/2026-09-16-fanka-design.md`)

## How to read this plan

Phase 1 taught a hard lesson: plan code written without reading the real code was wrong more than twenty-five times, and passed its own tests while being wrong. So:

- **Pure modules** (`core/chinese`, `core/import`, repository methods) carry complete code and complete tests. Treat them as a strong draft and verify them.
- **UI tasks** carry the exact Kanto bindings, verified against Kanto's source on 2026-09-21, and the behaviour to deliver. They do not carry whole `.vue` files, because the real files moved a lot during phase 1. **Read the current file before editing it.**
- Every Kanto attribute you use must be checked against `../kanto/src/components/**/kt-*.ts` and its `.md`. A wrong attribute fails silently.

## Global Constraints

- **All copy is English**, sentence case, terse, no emoji in product UI.
- **Commits are authored by Arnaud Michel alone.** Never add a `Co-Authored-By` trailer or any AI attribution, in commits or PR bodies. After each commit, `git log -1 --format='%(trailers)'` must print nothing.
- **Kanto first.** Before building any interface element, check Kanto's 42 components. Anything interactive or structural that is not a Kanto element needs an entry, with its reason, in `test/integrity/native-elements.allowlist.ts`.
- **Pages never import `~core/db`.** Always through a composable. Enforced by the integrity test.
- **Never hard-code a colour, size, duration or radius** where a Kanto token exists. Use a token only when its name describes the thing being styled *and* its value matches; otherwise a literal.
- **`--text-body`, never `--color-white`,** for text on a themed surface. `--color-white` is invisible in light theme.
- **Focus moves when a control becomes enabled, not when it mounts.** Reuse `app/composables/useFocusWhenEnabled.ts`.
- **Traditional characters only** in content.
- **Every new or rewritten test must be proven able to fail:** apply the mutation it guards, capture the failure, restore, verify the file is byte-identical.
- **Minor review findings do not get fix rounds.** Append them to `docs/deferred-minors.md` (where, what, why minor). Critical and Important are fixed immediately.
- `npm test`, `npm run typecheck`, `npm run test:e2e` and `npm run build:app` must pass at the end of every task that touches their scope.

---

### Task 1: The Kanto-first integrity guard

**Files:**
- Create: `test/integrity/kanto-first.test.ts`
- Create: `test/integrity/native-elements.allowlist.ts`
- Create: `docs/deferred-minors.md`
- Modify: `CLAUDE.md`
- Modify: `package.json` (add `lit` as a direct dependency)

**Interfaces:**
- Produces: `ALLOWLIST: AllowlistEntry[]` where `interface AllowlistEntry { file: string; tag: string; reason: string; removeIn?: string }`. Tasks 2 and 3 delete entries as they replace hand-built markup.

- [ ] **Step 1: Add `lit` as a direct dependency**

`kt-table`'s `renderCell` returns anything Lit can render, and Kanto's own docs use `html`. Fanka must not lean on Kanto's transitive copy.

```bash
npm install lit@^3.3.3
```

Match the major version Kanto itself depends on (`../kanto/package.json` lists `lit: ^3.3.3`), so there is one Lit in the bundle.

- [ ] **Step 2: Write the allowlist, seeded with phase 1's current hand-built elements**

`test/integrity/native-elements.allowlist.ts`:

```ts
export interface AllowlistEntry {
  /** Path relative to the repo root. */
  file: string;
  /** The native tag, without angle brackets. */
  tag: string;
  /** Why a Kanto element cannot do this job. */
  reason: string;
  /** The task that removes it, if it is only temporary. */
  removeIn?: string;
}

/**
 * Every native interactive or structural element in app/ that is not a Kanto
 * element must be listed here with a reason. The integrity test fails on any
 * element not listed, and on any entry that no longer matches, so the list
 * cannot rot.
 */
export const ALLOWLIST: AllowlistEntry[] = [
  { file: 'app/components/AppSidebar.vue', tag: 'nav', reason: 'Hand-built sidebar from phase 1.', removeIn: 'Task 2' },
  { file: 'app/components/AppBottomNav.vue', tag: 'nav', reason: 'Hand-built bottom bar from phase 1.', removeIn: 'Task 2' },
  { file: 'app/components/GradeButtons.vue', tag: 'button', reason: 'Hand-built grade buttons from phase 1.', removeIn: 'Task 3' },
  { file: 'app/pages/index.vue', tag: 'ul', reason: 'Hand-built deck list from phase 1.', removeIn: 'Task 3' },
];
```

Before trusting this list, run the scan in Step 3 and add any match it reports that is missing here — the list above is what the controller found by grep, and the test is the authority.

- [ ] **Step 3: Write the integrity test**

`test/integrity/kanto-first.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALLOWLIST } from './native-elements.allowlist';

const ROOT = join(__dirname, '..', '..');
const APP = join(ROOT, 'app');

/**
 * Native elements that Kanto has a component for, or that make a structure
 * Kanto owns. `a` is included because navigation goes through NuxtLink or a
 * Kanto navigation element; a raw anchor is almost always a recreation.
 */
const WATCHED = ['button', 'a', 'nav', 'table', 'input', 'select', 'textarea', 'dialog', 'ul', 'ol'];

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return vueFiles(path);
    return path.endsWith('.vue') ? [path] : [];
  });
}

/** The <template> block only — comments and scripts can mention tags freely. */
function template(source: string): string {
  const match = /<template>([\s\S]*)<\/template>/.exec(source);
  return (match?.[1] ?? '').replace(/<!--[\s\S]*?-->/g, '');
}

function nativeTags(source: string): string[] {
  const found: string[] = [];
  for (const tag of WATCHED) {
    const pattern = new RegExp(`<${tag}(\\s|>|/)`, 'g');
    if (pattern.test(template(source))) found.push(tag);
  }
  return found;
}

const files = vueFiles(APP).map((path) => ({ path: relative(ROOT, path), source: readFileSync(path, 'utf8') }));

describe('Kanto first', () => {
  it('uses no native interactive or structural element without a listed reason', () => {
    const offending = files.flatMap(({ path, source }) =>
      nativeTags(source)
        .filter((tag) => !ALLOWLIST.some((e) => e.file === path && e.tag === tag))
        .map((tag) => `${path}: <${tag}>`),
    );
    expect(offending).toEqual([]);
  });

  it('has no allowlist entry that no longer matches anything', () => {
    const stale = ALLOWLIST.filter((entry) => {
      const file = files.find((f) => f.path === entry.file);
      return !file || !nativeTags(file.source).includes(entry.tag);
    }).map((e) => `${e.file}: <${e.tag}>`);
    expect(stale).toEqual([]);
  });

  it('keeps pages away from the database layer', () => {
    const pages = files.filter((f) => f.path.startsWith('app/pages/'));
    const leaking = pages.filter((f) => /from\s+['"]~core\/db/.test(f.source)).map((f) => f.path);
    expect(leaking).toEqual([]);
  });
});
```

- [ ] **Step 4: Prove each assertion can fail**

Three mutations, each run then reverted, with the failure output captured:
1. Delete the `GradeButtons.vue` entry from the allowlist — the first test must fail naming `<button>`.
2. Add an entry for a file that does not exist — the second test must fail.
3. Add `import { db } from '~core/db/db';` to `app/pages/index.vue` — the third test must fail.

Then run `npm test -- test/integrity` and confirm it passes on the real tree.

- [ ] **Step 5: Create the deferred-minors list**

`docs/deferred-minors.md`, seeded with phase 1's carried minors from `.superpowers/sdd/2026-09-16-fanka-phase-1-foundation/progress.md` (lines marked `minor (deferred)`, `carried`, and the final review's "carry" verdicts). Format:

```markdown
# Deferred minors

Minor findings whose fix would cost a review round for little gain. Arnaud
works through this list at the end of a phase. Critical and Important
findings are never parked here.

| Where | What | Why it is minor | From |
| --- | --- | --- | --- |
| `app/components/AppSidebar.vue` | Disabled label "Today's session — nothing due right now" omits the visible "· 0" (WCAG 2.5.3) | Disabled, so it cannot be voice-activated | Phase 1 final review |
```

List every phase 1 item the final review classed as "carry to phase 2" or "carry to phase 3". Leave out what it said to drop, and what this plan already fixes (Tasks 4, 5, 6 and 7 close several of them).

- [ ] **Step 6: Add the rule to CLAUDE.md**

Under **Rules**:

```markdown
- **Kanto first.** Before building any interface element, check Kanto's 42
  components (`../kanto/src/components`). A native interactive or structural
  element in `app/` needs an entry with its reason in
  `test/integrity/native-elements.allowlist.ts`; the integrity test fails
  otherwise. A hand-built copy of a Kanto component receives none of the
  design system's later fixes.
- **Minor findings go to `docs/deferred-minors.md`**, not into a fix round.
```

- [ ] **Step 7: Commit**

```bash
git add test/integrity docs/deferred-minors.md CLAUDE.md package.json package-lock.json
git commit -m "Add an integrity test that makes Kanto-first a failing test

Phase 1 used 9 of Kanto's 42 elements and hand-built the rest. A copy of a
design-system component gets none of the system's later fixes, so any
native interactive element in app/ now needs a listed reason, and the test
also fails when a listed entry goes stale or a page imports the database."
```

---

### Task 2: The shell on kt-sub-menu-navigation and kt-header

**Files:**
- Modify: `app/layouts/default.vue`
- Rewrite: `app/components/AppSidebar.vue`
- Delete: `app/components/AppBottomNav.vue`
- Rewrite: `app/composables/useNavigation.ts`
- Modify: `test/integrity/native-elements.allowlist.ts` (delete the two Task 2 entries)
- Modify: `e2e/review.spec.ts` only if a selector depended on the old nav

**Interfaces:**
- Produces: `useNavigation(dueTotal: Readonly<Ref<number>>): { sections: ComputedRef<KtNavSection[]> }` where `KtNavSection`/`KtNavItem` are Kanto's shapes (import the types from `kanto` if exported; otherwise declare them locally, matching the doc exactly).

**Kanto bindings (verified):**
- `kt-sub-menu-navigation`: `sections` (property, `KtNavSection[]`), `active-href` (string), `flush` (boolean), `label` (string). Emits `kt-navigate` with `{ item }`, **cancelable** — call `event.preventDefault()` and `navigateTo(item.href)`, or the browser performs a full navigation.
- `kt-header`: `sticky`, `label`. Slots `brand`, default, `actions`, `menu`, `bottom`. Method `closeMenu()`. Collapses below `--kt-header-breakpoint` (900px) — it owns that breakpoint, so the layout's `window.innerWidth` listener goes away.
- `kt-toast-container`: one instance in the shell; pages raise toasts through `toaster` from `kanto`.

- [ ] **Step 1: Read** `app/layouts/default.vue`, `app/components/AppSidebar.vue`, `app/composables/useNavigation.ts` and Kanto's `kt-sub-menu-navigation.ts` and `kt-header.ts`.

- [ ] **Step 2: Rewrite `useNavigation`** to return Kanto sections. Phase 2 screens are added to the Collection section *by the task that creates each screen* — never before the page exists:

```ts
const sections = computed(() => [
  {
    title: 'Learn',
    items: [
      { label: 'Today', href: '/', icon: 'house', badge: dueTotal.value > 0 ? String(dueTotal.value) : undefined },
      { label: 'Review', href: '/review', icon: 'play' },
    ],
  },
]);
```

- [ ] **Step 3: Rebuild the shell.** Above 900px: an `<aside>` containing the brand, the session `kt-button` (unchanged: `variant="secondary"`, disabled with its reason as `label` when nothing is due), and `<kt-sub-menu-navigation flush :sections :active-href="route.path" @kt-navigate="onNavigate">`. Below 900px: `<kt-header sticky label="Fanka">` with the brand in `slot="brand"`, the session button in `slot="actions"`, and the same navigation in `slot="menu"`; call the header's `closeMenu()` after routing. Keep the `<aside>` hidden below 900px with a CSS media query at 900px — the same breakpoint `kt-header` uses.

The `<aside>` is a landmark, not a Kanto recreation: add it to the allowlist with the reason "Page landmark wrapping kt-sub-menu-navigation; Kanto has no sidebar container." The brand markup (繁 · FANKA) contains no watched tag.

- [ ] **Step 4: Add `<kt-toast-container>`** once, in the layout.

- [ ] **Step 5: Delete** `AppBottomNav.vue` and its two allowlist entries (sidebar `nav`, bottom bar `nav`). Run the integrity test: it must pass, which proves the hand-built nav is gone.

- [ ] **Step 6: Verify in a browser** at 1280×900 and 500×900: the sidebar shows both sections with the active route highlighted and `aria-current="page"` on it; clicking an entry routes without a full page reload (check `performance.navigation`/a persisted in-memory marker, not just the URL); below 900px the header's menu button reveals the navigation and it closes after choosing an entry; no console errors. Report what you observed. If you cannot drive a browser, say so and confine claims to code.

- [ ] **Step 7: Run** `npm test`, `npm run typecheck`, `npm run test:e2e`, and commit.

```bash
git commit -m "Build the shell on kt-sub-menu-navigation and kt-header

The sidebar and the bottom bar were hand-built in phase 1. Kanto's
navigation already handles the active state, aria-current and client-side
routing through a cancelable kt-navigate, and kt-header owns the 900px
collapse, so the layout's own resize listener goes too."
```

---

### Task 3: Page headers, grade buttons and the Today deck list on Kanto

**Files:**
- Modify: `app/pages/index.vue`, `app/pages/review.vue`, `app/components/GradeButtons.vue`
- Modify: `test/integrity/native-elements.allowlist.ts` (delete the Task 3 entries)

**Kanto bindings (verified):**
- `kt-page-header`: `eyebrow`, `heading`, `description`, `level` (`'page'` renders an `<h1>`); slot `actions`; parts `base`, `heading`.
- `kt-button`: variants `danger`, `warning`, `success`, `info`; `label` forwards to `aria-label` on the internal `<button>`; `disabled`; the default slot is the visible label.

- [ ] **Step 1: Page headers.** Replace `<header class="head">` in `index.vue` with `<kt-page-header eyebrow="Dashboard" heading="Today">`. In `review.vue`, keep the progress row but move the title and the Undo / Leave actions into `<kt-page-header eyebrow="Session" heading="Review">` with the two icon buttons in `slot="actions"`.

- [ ] **Step 2: Resolve the focus risk before relying on it.** `index.vue` moves focus to the page heading after a successful Retry (`focusHeadingIfUnclaimed`). `kt-page-header` renders its `<h1>` inside its shadow root. Read `kt-page-header.ts` and determine whether that `<h1>` can receive focus (it needs `tabindex="-1"` and a reachable reference). Then **observe it in a browser**: force the load failure, Retry, and report `document.activeElement` and `document.activeElement?.shadowRoot?.activeElement`. If the heading cannot take focus, move focus to the Start session `kt-button` through `useFocusWhenEnabled` instead, and say which you chose. Do not ship an unverified focus call — phase 1 shipped three silent no-ops of exactly this kind.

- [ ] **Step 3: Grade buttons.** Replace the four native `<button>`s with `kt-button`s: variant `danger` / `warning` / `success` / `info` for Again / Hard / Good / Easy, `size="large"`, `:disabled="busy"`, `:label="\`${label}, ${interval}\`"`, the visible label and interval in the default slot. Keep `useFocusWhenEnabled(() => gradeButtons.value[0], () => props.busy)` — it already works with `kt-button` (it awaits `updateComplete`). Delete the scoped `.grade*` CSS: the variants carry the colours now. Keep the 56px minimum touch height only if `kt-button size="large"` does not already meet it — check its height token.

- [ ] **Step 4: Today deck list.** Replace the `<ul class="decks">` with one compact `kt-card` per deck, or a `kt-table` with no paging — pick whichever Task 10's deck card will also use, so the two screens share one representation. Document the choice.

- [ ] **Step 5: Delete the Task 3 allowlist entries** and run the integrity test.

- [ ] **Step 6: Verify** the e2e suite still passes — it asserts grade-button names and focus. Update selectors only where the accessible name genuinely changed, and keep every assertion's meaning.

- [ ] **Step 7: Commit.**

```bash
git commit -m "Use kt-page-header and kt-button variants on Today and Review

kt-button already carries danger, warning, success and info, which are
exactly Again, Hard, Good and Easy; the hand-built grade buttons and their
colour CSS go. Both pages open with kt-page-header, which Kanto added
because hand-made page headers drifted from screen to screen."
```

---

### Task 4: Undo after a soft delete must not corrupt the queue

**Files:**
- Modify: `app/composables/useReviewSession.ts` (`undoCore`)
- Test: `test/session/useReviewSession.test.ts`

**Interfaces:**
- Consumes: `items.visible(ids: string[]): Promise<Item[]>` from `~core/db/repositories`.

**The bug (from the phase 1 final review, reproduced):** grade card 1, soft-delete that card, reload. `restore()` re-anchors the cursor to 0 with a one-entry log. `undoCore` then sets `index = max(0, 0 - 1) = 0` and writes the undone item into `queue[0]`, overwriting an unanswered card, which silently disappears from the session while `total` still counts it. Today `undoCore` only checks that the item *row exists* (`items.get`), which is always true — this app never deletes rows.

- [ ] **Step 1: Write the failing test** reproducing exactly that sequence with real seeded items: start a session, grade the first card, soft-delete its card (`deletedAt`), create a new session instance and `restore()` it, then `undo()`. Assert: the queue still contains every unanswered item it had before the undo, in the same order; `total` is unchanged; `index` is unchanged; the log is empty.

- [ ] **Step 2: Run it and confirm it fails** against the current `undoCore`.

- [ ] **Step 3: Fix `undoCore`.** Replace the row-existence check with a visibility check. When the item to restore is no longer visible, drop the log entry, persist, and return — touch neither the queue nor the cursor, and do not call `reviews.undo`: the learner cannot undo a grade on a card they have deleted, and the recorded review stands.

```ts
async function undoCore(): Promise<void> {
  const last = log.value.at(-1);
  if (!last) return;

  const [visible] = await items.visible([last.itemId]);
  if (!visible) {
    // The graded card was deleted or suspended since. Restoring it would
    // write an invisible item over whatever now sits at the cursor, so the
    // undo is dropped instead and the grade stands.
    log.value = log.value.slice(0, -1);
    await persist();
    return;
  }

  await reviews.undo(last.reviewId);
  log.value = log.value.slice(0, -1);
  index.value = Math.max(0, index.value - 1);
  queue.value[index.value] = (await items.get(last.itemId))!;
  await refreshCurrent();
  revealed.value = true;
  await persist();
  syncTimer();
}
```

- [ ] **Step 4: Run the test and the whole session suite**, confirm the existing undo tests still pass unchanged.

- [ ] **Step 5: Mutation check:** restore the old `items.get` existence check and confirm the new test fails; restore byte-identical.

- [ ] **Step 6: Commit.**

```bash
git commit -m "Drop an undo whose card was deleted instead of corrupting the queue

Undo only checked that the item row existed, which is always true here:
the app soft-deletes. Restoring a hidden item wrote it over the unanswered
card at the cursor, which then vanished from the session while the total
still counted it."
```

---

### Task 5: Review page — failed grade or undo, and focus after Retry

**Files:**
- Modify: `app/pages/review.vue`
- Modify: `e2e/review.spec.ts` (one focus assertion)

- [ ] **Step 1: Read** `app/pages/review.vue` and `useReviewSession`'s `grade`/`undo` return contracts.

- [ ] **Step 2: Handle a rejected `grade()` or `undo()`.** A failed grade happens inside one Dexie transaction, so nothing is written and the card stays. Catch the rejection, keep the card on screen, and raise `toaster.error('Couldn't save that answer', { description: 'Try again.' })` — check `toaster`'s real signature in `../kanto/src/components/feedback/kt-toast-container/toaster.ts` first. The realistic trigger is IndexedDB connection loss after the Android app is backgrounded, so this is not an edge case on the Capacitor build.

- [ ] **Step 3: Focus after a successful Retry.** The Retry button unmounts when the session loads, dropping focus to `<body>`. Move focus to the Show answer button through `useFocusWhenEnabled` — the same mechanism `ShowAnswerButton` already uses — only when focus is unclaimed.

- [ ] **Step 4: e2e.** Add to the existing failure-path test (or add one) an assertion that after Retry succeeds, the Show answer button is focused. Prove it fails with the focus call removed.

- [ ] **Step 5: Commit.**

---

### Task 6: `core/chinese` — traditional-only detection and the `n2` fix

**Files:**
- Create: `scripts/build-simplified-set.mjs`
- Create: `core/chinese/data/simplified-only.json` (generated, committed)
- Create: `core/chinese/script.ts`
- Modify: `core/chinese/zhuyin.ts`
- Test: `test/chinese/script.test.ts`, `test/chinese/zhuyin.test.ts`
- Modify: `test/seed/seed.test.ts` (use the runtime check instead of its 26-character regex)

**Interfaces:**
- Produces: `simplifiedCharactersIn(text: string): string[]` — the distinct characters of `text` that exist only in simplified form, in order of first appearance.

**Why a real dataset.** Phase 1's "no simplified characters" guard is a 26-character regex that lives only in a test. Promoted to runtime it would accept almost every simplified character in a real file. The authority for this mapping is OpenCC (Apache-2.0). The subtlety is that some characters are both: 后 is the simplified form of 後 and also the traditional word for "empress"; 干 and 里 are the same. A character is flagged **only if it is a simplified form and is never itself a traditional form.**

- [ ] **Step 1: Choose the source and confirm its licence.** Use OpenCC's `STCharacters.txt` (simplified → traditional) and `TSCharacters.txt` (traditional → simplified) from the OpenCC repository, or an npm package that vendors them unmodified (`opencc-data` or `opencc-js`). Confirm the licence is Apache-2.0 and record the source URL and commit or version in the generated file's header. Add it as a **devDependency** only — the app ships the generated JSON, not the dictionary.

- [ ] **Step 2: Write the generator** `scripts/build-simplified-set.mjs`: read both tables; a character `c` is simplified-only when `c` is a key in ST whose targets do not include `c`, **and** `c` is not a key in TS (i.e. it is not itself a traditional character). Write a sorted JSON array plus a header object `{ source, version, licence, generatedAt }`. Add `"build:chinese-data": "node scripts/build-simplified-set.mjs"` to `package.json`.

- [ ] **Step 3: Write the failing tests** `test/chinese/script.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { simplifiedCharactersIn } from '~core/chinese/script';

describe('simplifiedCharactersIn', () => {
  it('finds simplified-only characters', () => {
    expect(simplifiedCharactersIn('学习')).toEqual(['学', '习']);
  });

  it('accepts traditional text', () => {
    expect(simplifiedCharactersIn('學習時間問題電話')).toEqual([]);
  });

  it('accepts characters shared by both scripts', () => {
    expect(simplifiedCharactersIn('迎忙程人大中')).toEqual([]);
  });

  it('accepts characters that are both a simplified form and a traditional word', () => {
    // 后 empress, 干 shield, 里 village: valid traditional characters.
    expect(simplifiedCharactersIn('皇后干里')).toEqual([]);
  });

  it('reports each character once, in order of first appearance', () => {
    expect(simplifiedCharactersIn('这个这个')).toEqual(['这', '个']);
  });

  it('ignores punctuation, Latin and digits', () => {
    expect(simplifiedCharactersIn('Hello, 123。')).toEqual([]);
  });

  it('checks the whole seed deck is clean', async () => {
    const deck = (await import('~core/seed/data/hsk1.json')).default;
    for (const card of deck.cards) {
      expect(simplifiedCharactersIn(card.hanzi + card.example)).toEqual([]);
    }
  });
});
```

If the dataset classifies 个 as shared (it is used in some traditional texts), adjust that single expectation to the dataset's verdict and note it — do not hand-edit the generated data.

- [ ] **Step 4: Implement** `core/chinese/script.ts`, importing the JSON into a `Set` once. Run the tests.

- [ ] **Step 5: The `n2` fix.** `toZhuyin(parsePinyin('n2'))` returns `"ㄋˊ"`: the syllabic nasal consumes its initial, leaves `bare` empty, and slips past the "unconverted remainder" guard. Add failing tests `expect(toZhuyin(parsePinyin('n2'))).toBe('')` and the same for `ng2` and `hm1`, then make a syllable that matched an initial but **no final** return `null`, unless it is one of the empty-rime syllables (`zhi chi shi ri zi ci si`) already handled. Keep every existing zhuyin test green.

- [ ] **Step 6: Replace the seed test's regex** with `simplifiedCharactersIn`, so the seed and the importer share one definition.

- [ ] **Step 7: Mutation checks** for the three categories above (flagged, shared, dual-role) and for `n2`. Commit.

---

### Task 7: `core/import` — the shared card validator

**Files:**
- Create: `core/import/validate.ts`
- Modify: `core/seed/seed.ts` (validate every seed entry at load)
- Test: `test/import/validate.test.ts`

**Interfaces:**
- Produces:

```ts
export type Severity = 'error' | 'warning';
export interface Issue { field: CardField; severity: Severity; message: string }
export type CardField = 'hanzi' | 'pinyin' | 'zhuyin' | 'translation' | 'example' | 'examplePinyin' | 'exampleTranslation' | 'tags';
export interface CardDraft {
  hanzi: string; pinyin: string; zhuyin?: string; translation: string;
  example?: string; examplePinyin?: string; exampleTranslation?: string; tags?: string[];
}
export interface Validated { draft: CardDraft; issues: Issue[]; ok: boolean }
export function validateCard(draft: CardDraft, existingHanzi: ReadonlySet<string>): Validated;
```

`ok` is true when there is no `error`. Warnings do not block import.

- [ ] **Step 1: Write the failing tests**, one per rule:
- empty `hanzi` → error on `hanzi`;
- a simplified character in `hanzi` → error naming the character; in `example` → error naming it;
- empty `translation` → error;
- `pinyin` that does not parse → error;
- syllable count ≠ Han character count in `hanzi` → **warning** (erhua and some loanwords legitimately differ);
- `hanzi` already in `existingHanzi` → error "Already in this deck";
- missing `zhuyin` → no issue (derived later);
- a valid card → `ok: true`, no issues;
- surrounding whitespace is trimmed before every check.

- [ ] **Step 2: Implement** `validateCard` using `simplifiedCharactersIn`, `parsePinyin`, and a Han-character count (`/\p{Script=Han}/u`).

- [ ] **Step 3: Validate the seed at load.** In `seedIfNeeded`, run every entry through `validateCard` before writing anything. On any error, throw an `Error` naming the deck, the entry `id` and the issues — seeding must never write half a deck. This closes phase 1's carried item: `hsk1.json` was force-cast and never checked at runtime.

- [ ] **Step 4: Mutation checks** — at least: remove the simplified check, remove the duplicate check, make the syllable mismatch an error — each must fail a test. Commit.

---

### Task 8: `core/import` — parsing and field mapping

**Files:**
- Create: `core/import/parse.ts`, `core/import/mapping.ts`
- Test: `test/import/parse.test.ts`, `test/import/mapping.test.ts`

**Interfaces:**
- Produces:

```ts
export type Delimiter = ',' | '\t' | ';';
export function parseDelimited(text: string, delimiter: Delimiter): string[][];
export function detectDelimiter(text: string): Delimiter;

export type Target = CardField | 'ignore';
export interface Mapping { columns: Target[]; hasHeader: boolean }
export function guessMapping(rows: string[][]): Mapping;
export function applyMapping(rows: string[][], mapping: Mapping): CardDraft[];
```

- [ ] **Step 1: Write the failing parser tests** (RFC 4180):
- plain rows; the last line with and without a trailing newline;
- a quoted field containing the delimiter; containing a newline; containing a doubled quote `""` → `"`;
- CRLF and LF line endings; a leading UTF-8 BOM stripped;
- empty fields preserved (`a,,c` → `['a','','c']`);
- blank lines skipped;
- TSV with a tab delimiter;
- an unterminated quote does not hang — it consumes to end of input.

- [ ] **Step 2: Implement `parseDelimited`** as a single-pass state machine over characters (in field / in quotes / after quote). No regex splitting — it cannot handle quoted newlines.

- [ ] **Step 3: `detectDelimiter`**: over the first five non-empty lines, pick the delimiter whose count per line is non-zero and most consistent; tab wins ties (pasted spreadsheets are tab-separated). Tests: a pasted spreadsheet block, a comma CSV, a semicolon CSV (European locales), a single column.

- [ ] **Step 4: Mapping tests and implementation.** `guessMapping` recognises headers case-insensitively (`hanzi`/`character`/`traditional`/`字` → hanzi; `pinyin` → pinyin; `zhuyin`/`bopomofo`/`注音` → zhuyin; `english`/`meaning`/`translation` → translation; `example`/`sentence` → example; `tags` → tags) and sets `hasHeader` when at least one header is recognised; with no header it guesses by content — the first column dominated by Han characters is hanzi, a column that parses as pinyin is pinyin, the remaining text column is translation. `applyMapping` skips the header row when `hasHeader`, splits `tags` on `;` or `,`, and ignores `ignore` columns.

- [ ] **Step 5: Mutation checks** on the quoted-newline, doubled-quote and BOM cases. Commit.

---

### Task 9: Repositories for the collection

**Files:**
- Modify: `core/db/repositories.ts`
- Test: `test/db/repositories.test.ts`

**Interfaces:**
- Produces (every write keeps its outbox entry in the same transaction):

```ts
decks.create(input: { name: string; description: string; colorToken: DeckColor; tag: string }, now: number): Promise<Deck>;
decks.update(id: string, patch: Partial<Pick<Deck, 'name' | 'description' | 'colorToken' | 'tag'>>, now: number): Promise<void>;
decks.softDelete(id: string, now: number): Promise<void>;
decks.summaries(now: number): Promise<DeckSummary[]>;
cards.update(id: string, patch: CardPatch, directions: Direction[], now: number): Promise<void>;
cards.softDelete(ids: string[], now: number): Promise<void>;
cards.move(ids: string[], deckId: string, now: number): Promise<void>;
cards.list(filter: CardFilter): Promise<CardRow[]>;
items.setSuspended(ids: string[], suspended: boolean, now: number): Promise<void>;
reviews.historyForCard(cardId: string): Promise<Review[]>;
```

with

```ts
export const DECK_COLORS = ['var(--chart-series-1)', 'var(--chart-series-2)', 'var(--chart-series-3)', 'var(--chart-series-4)', 'var(--chart-series-5)', 'var(--chart-series-6)', 'var(--chart-series-7)', 'var(--chart-series-8)'] as const;
export type DeckColor = (typeof DECK_COLORS)[number];
export interface DeckSummary { deck: Deck; total: number; due: number; fresh: number; mature: number; young: number }
export interface CardFilter { deckId?: string; state?: ItemState | 'suspended'; dir?: Direction; query?: string; now: number }
export interface CardRow { card: Card; deckName: string; items: Item[]; state: ItemState | 'suspended'; due: number | null }
```

- **Mature** means an item in `review` state with `scheduledDays > 21`; **young** is any other introduced item. A card's row `state` is its least-advanced visible item's state, or `suspended` when every item is suspended; `due` is its soonest item's due.
- `cards.update` recomputes `zhuyin` from the new pinyin when the patch changes pinyin and gives no zhuyin. **Directions:** a direction newly enabled gets a fresh item; a direction disabled is **suspended, never deleted** — its review history must survive.
- `decks.create`/`update` reject a `colorToken` outside `DECK_COLORS` — an imported file must not inject arbitrary CSS into a `style` binding.
- `cards.list` search matches `query` against hanzi, translation, and pinyin with and without tone marks (`xuexi` matches `xué xí`), case-insensitively.

- [ ] **Step 1: Write the failing tests for each method** under `fake-indexeddb`, including: soft-deleting a deck hides its cards from `due()`/`fresh()`/`visible()`; a moved card appears under the new deck's summary and not the old one; disabling a direction suspends its item and keeps its reviews; re-enabling it un-suspends the same item rather than creating a second one; `summaries` counts exclude soft-deleted cards; the outbox receives one entry per written row in the same transaction; `colorToken` outside the set throws.

- [ ] **Step 2: Implement**, reusing `byId`, `cardVisible` and `decksByIdFor` so visibility rules never diverge.

- [ ] **Step 3: Mutation checks** on: the direction-suspend-not-delete rule, the colour guard, the mature threshold, and soft-delete visibility. Commit.

---

### Task 10: The Decks screen

**Files:**
- Create: `app/pages/decks/index.vue`, `app/components/DeckCard.vue`, `app/components/DeckFormModal.vue`
- Modify: `app/composables/useDecks.ts`, `app/composables/useNavigation.ts` (add Decks), `app/plugins/kanto.client.ts` (register icons used)

**Interfaces:**
- `useDecks()` gains `summaries(): Promise<DeckSummary[]>`, `create(input)`, `update(id, patch)`, `remove(id)`.

**Kanto bindings (verified):**
- `kt-page-header` with the New deck `kt-button` in `slot="actions"` — the one primary on this screen.
- `kt-card` per deck (slots header/footer as documented in `kt-card.md`); `kt-badge` for the tag; `kt-meter` with `segments: KtMeterSegment[]` (`{ label, value, color }`) for mature / young / new, `show-legend`.
- `kt-dropdown` per deck: `options: KtOption[]` (`{ id, label }`), `slot="trigger"` holding an icon-only `kt-button` with a `label`; listens to `kt-select` `{ value, option }`.
- `kt-modal`: `open`, `heading`, slot default for the form, `slot="footer"` for actions, `kt-close` (cancelable).
- `kt-form` + `kt-label-input` + `kt-input` (`kt-input` event `{ value }`) + `kt-textarea` + `kt-select` (`options: KtOption[]`, `kt-change` `{ value, option }`) for name, description, colour and tag.
- `kt-confirm-dialog`: `open`, `heading`, `message`, `confirm-label`, `variant="danger"`; events `kt-confirm`, `kt-cancel`. It focuses Cancel itself.
- `toaster.success(...)` after create, update and delete.

- [ ] **Step 1: Read** each Kanto `.md` above, then build the page to those bindings.
- [ ] **Step 2: Colour choice** is a `kt-select` over `DECK_COLORS`, labelled by name ("Blue", "Orange"…); each option previews its colour. Never a free-text field.
- [ ] **Step 3: Delete** opens `kt-confirm-dialog` with the card count in the message ("Delete HSK 1 and its 20 cards? Their review history is kept."). Soft delete.
- [ ] **Step 4:** Today's deck list from Task 3 reuses `DeckCard` in a compact form, so the two screens share one component.
- [ ] **Step 5: Add Decks to the Collection nav section** in the same commit that adds the page.
- [ ] **Step 6: Verify in a browser** — create, rename, recolour, delete; empty state when no decks; light theme readable; no console errors. Report observations or state plainly that you could not drive a browser.
- [ ] **Step 7:** integrity test, typecheck, full suite. Commit.

---

### Task 11: Add and edit a card

**Files:**
- Create: `app/pages/cards/new.vue`, `app/pages/cards/[id].vue`, `app/components/CardForm.vue`, `app/components/TagInput.vue`
- Create: `app/composables/useCardEditor.ts`
- Modify: `app/composables/useNavigation.ts` (add Add)

**Interfaces:**
- `useCardEditor(id?: string)` returns `{ draft, directions, issues, preview, save(): Promise<boolean>, loading, notFound }` where `issues` comes from `validateCard` and `preview` is `{ pinyin: PinyinSyllable[]; zhuyin: string }`.

**Kanto bindings (verified):**
- `kt-form` with fields in the default slot and Save / Cancel in `slot="footer"`.
- `kt-label-input label="…" required` around each `kt-input` / `kt-textarea`; show a validator issue through the field's `error` attribute.
- `kt-select` for the deck and the part of speech.
- `kt-toggle` × 2 (`checked`, `label`, event `kt-change` `{ checked }`) for Recognition and Production. At least one must stay on: disable the last one on.
- **Tags:** Kanto has no multi-value tag input. `kt-input-menu` selects one value (`options`, `kt-change` `{ value, option }`, `kt-filter` `{ query }`), so `TagInput.vue` composes it: choosing or typing a tag adds it; chosen tags render as `kt-badge`s, each with an icon-only `kt-button` (`icon="x"`, `label="Remove tag …"`) to remove it. Existing tags across the collection are the options. No native element.
- `toaster.success('Card saved')` then return to where the learner came from.

- [ ] **Step 1: Test `useCardEditor`** under `fake-indexeddb`: loading an existing card fills the draft; saving a new card creates it with the chosen directions; saving an edit updates it and applies the direction rules from Task 9; a duplicate hanzi in the same deck blocks save with the validator's issue; an unknown id sets `notFound`.
- [ ] **Step 2: Build the form.** The live preview renders the typed pinyin through `PinyinText` with tone colours and shows the derived zhuyin, both from the pure `core/chinese` functions.
- [ ] **Step 3: Add "Add" to the Collection nav.**
- [ ] **Step 4: Verify in a browser**, including keyboard-only completion of the form and the `error` messages appearing on the right fields. Commit.

---

### Task 12: Browse

**Files:**
- Create: `app/pages/browse.vue`, `app/components/CardTable.vue`, `app/components/CardDetailPanel.vue`
- Create: `app/composables/useBrowse.ts`
- Modify: `app/composables/useNavigation.ts` (add Cards)

**Interfaces:**
- `useBrowse(scope?: { deckId: string })` returns `{ rows, filter, selected, loading, reload(), suspend(ids), unsuspend(ids), move(ids, deckId), remove(ids), history(cardId) }`. `CardTable` takes `scope` so Task 13 reuses it unchanged.

**Kanto bindings (verified):**
- Filters: `kt-input icon="search"` (debounce `kt-input` 200ms), `kt-select` for deck and state, `kt-segmented-control` (`options: { value, label }[]`, `kt-change` `{ value }`) for Both / Recognition / Production.
- `kt-table`: `columns: KtTableColumn[]` (`{ key, label, sortable, align, width }`), `data`, `selectable`, `selection-mode="multiple"`, `page-size="25"`, `render-cell` as a **property** (`renderCell = (row, column) => …` returning a Lit `html` template or `undefined`), `label`. Events: `kt-sort-change` `{ key, direction }`, `kt-selection-change` `{ selected, rows }`, `kt-row-click` `{ row, index }`.
- `renderCell`: hanzi in `var(--fk-font-hanzi)`; pinyin as tone-coloured spans using `toneColorToken`; state as a `kt-badge`; due as `formatInterval` of the remaining time or "Due".
- Bulk bar, visible when `selected.length > 0`: Suspend, Move (opens a `kt-modal` with a deck `kt-select`), Delete (`kt-confirm-dialog`). Use `kt-split-button` only if its documented behaviour fits; otherwise separate `kt-button`s.
- Row click opens `kt-side-panel` (`open`, `eyebrow="Card"`, `heading`, `kt-close`) holding the card's fields, a `kt-timeline` of its reviews (`kt-timeline-item` with `heading` = the grade, `time` = relative date, `variant` = danger / warning / success / info matching the grade), and Edit / Suspend / Delete actions.

- [ ] **Step 1: Test `useBrowse`**: filters combine (deck + state + direction + query); a bulk suspend updates rows; a bulk delete removes rows and they no longer surface in `items.due()`; `history` returns reviews oldest first; scoping to a deck ignores the deck filter.
- [ ] **Step 2: Build the page and panel.**
- [ ] **Step 3: Add "Cards" to the nav.**
- [ ] **Step 4: Verify in a browser:** sort, page, select across a page, bulk actions, the side panel's focus trap and Escape (Kanto's `<dialog>` handles both — confirm, do not reimplement), and light theme. Commit.

---

### Task 13: Deck detail

**Files:**
- Create: `app/pages/decks/[id].vue`

**Kanto bindings (verified):**
- `kt-breadcrumb` `items: [{ label: 'Decks', href: '/decks' }, { label: deck.name }]`; its `kt-navigate` is cancelable — route through the Nuxt router like the sidebar.
- `kt-page-header` with Review this deck as the one primary action.
- `kt-tabs` `tabs: [{ value: 'cards', label: 'Cards' }, { value: 'settings', label: 'Settings' }]`, `kt-change` `{ value }`; reflect the tab in the URL query so reload keeps it.
- Cards tab: `<CardTable :scope="{ deckId }">` from Task 12, unchanged.
- Settings tab: the same fields as `DeckFormModal`, inline, plus Delete through `kt-confirm-dialog`; after delete, route to `/decks`.
- An unknown or deleted deck id shows `kt-empty-state` with a way back to Decks.

- [ ] **Step 1:** Wire `DeckCard`'s Browse action (Task 10) to `/decks/:id`.
- [ ] **Step 2: Verify in a browser**, including reload on the Settings tab. Commit.

---

### Task 14: Import

**Files:**
- Create: `app/pages/import.vue`, `app/composables/useImport.ts`
- Modify: `app/composables/useNavigation.ts` (add Import)

**Interfaces:**
- `useImport()` returns `{ step: Ref<1 | 2 | 3>, source, rows, mapping, results: Ref<Validated[]>, counts, targetDeckId, load(text), setMapping(m), verify(), commit(): Promise<{ created: number; skipped: number }> }`.
- `commit` writes valid rows in batches of 200, each batch one Dexie transaction including its outbox entries; duplicates are skipped and counted, never overwritten.

**Kanto bindings (verified):**
- `kt-page-header` whose `description` carries "Step 2 of 3 — Field mapping", with a `kt-progress-bar` beneath — Kanto has no stepper, so none is built.
- Step 1: `kt-segmented-control` File / Pasted text; `kt-drag-drop` (`accept=".csv,.tsv,.txt"`, `multiple` false; read files through its `selectedFiles` getter after its change event — check the event name in `kt-drag-drop.md`) or `kt-textarea`; a `kt-select` for the destination deck, with a "New deck…" option opening `DeckFormModal` from Task 10.
- Step 2: for each detected column, its first two sample values and a `kt-select` of targets; a `kt-toggle` "First row is a header".
- Step 3: `kt-stat` × 3 (Valid, Warnings, Errors); a `kt-alert` summarising errors; a `kt-table` preview with a status column rendered as a `kt-badge` and the issue messages; Import is the one primary action and imports only valid rows.
- After commit: `toaster.success('Imported 42 cards', …)` naming skipped duplicates, and route to the destination deck.

- [ ] **Step 1: Test `useImport`** end to end with `fake-indexeddb`: a CSV with a header, a quoted multi-line field, one simplified row, one duplicate and one valid row → counts `{ valid: 1, warnings: 0, errors: 2 }`; commit creates exactly one card; running the same import again creates nothing.
- [ ] **Step 2: Build the page.**
- [ ] **Step 3: Add "Import" to the nav.**
- [ ] **Step 4: Verify in a browser** with a real CSV file dropped on the zone and with pasted spreadsheet cells. Commit.

---

### Task 15: End-to-end scenarios

**Files:**
- Create: `e2e/collection.spec.ts`
- Create: `e2e/fixtures/small.csv`

- [ ] **Scenario 1 — import:** import `e2e/fixtures/small.csv` (three cards, one simplified row) through the file zone; assert the verification counts, import, then find the two valid cards in Browse by searching their hanzi.
- [ ] **Scenario 2 — edit:** open a card in Browse, edit its translation, save, and confirm the table and the side panel show the new text.
- [ ] **Scenario 3 — delete a deck:** delete a deck from Decks; confirm Today's counts drop and a new review session never shows one of its cards.
- [ ] **Prove each scenario can fail** with one mutation apiece (skip the validator, drop the save, remove the deck visibility filter), restoring byte-identical.
- [ ] Keep the suite serialised (`workers: 1`) as phase 1 set it. Run the whole suite, typecheck and `build:app`. Commit.

---

## Self-Review

**Spec coverage.** §1 Kanto-first rule and enforcement → Task 1. §2 shell → Task 2; page headers, grade buttons, the heading-focus risk → Task 3; toasts → Task 2. §3 `/decks` → Task 10, `/decks/:id` → Task 13, `/browse` → Task 12, add/edit → Task 11, nav growth per screen → Tasks 10–14. §4 import → Tasks 7, 8, 14; shared validator and seed validation → Task 7; colour restriction → Task 9; `n2` → Task 6. §5 data layer → Task 9 and the composables in 10–14. §6 carried fixes → Tasks 4 and 5. §7 minors list → Task 1. §8 testing → every task plus Task 15.

**Clarification of the spec, not a deviation.** §4 says the simplified-character blocklist "moves to `core/chinese`". Reading the code showed that blocklist is a 26-character regex that exists only in a test; moving it would create a guard that misses almost every simplified character. Task 6 replaces it with an OpenCC-derived set and handles characters that are both simplified and traditional. The intent of §4 is unchanged.

**Type consistency.** `CardDraft`, `Validated` and `CardField` are defined in Task 7 and consumed by Tasks 8, 11 and 14. `DeckColor`/`DECK_COLORS`, `DeckSummary`, `CardFilter` and `CardRow` are defined in Task 9 and consumed by Tasks 10–14. `simplifiedCharactersIn` is defined in Task 6 and consumed by Tasks 7 and the seed test. `CardTable`'s `scope` prop is defined in Task 12 and reused unchanged by Task 13.
