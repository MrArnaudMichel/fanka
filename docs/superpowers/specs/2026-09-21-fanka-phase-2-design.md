# Fanka phase 2 — Kanto-first foundation and the collection

**Date:** 2026-09-21
**Status:** approved in conversation; the user waived a separate spec review
**Parent spec:** `docs/superpowers/specs/2026-09-16-fanka-design.md`

Phase 2 does two things, in this order. It first rebuilds phase 1's
hand-made interface on real Kanto components, then adds the collection:
decks, deck detail, browse, add/edit, and import.

## 1. The Kanto-first rule

Phase 1 used 9 of Kanto's 42 elements and hand-built the sidebar, the
mobile bottom bar, both page headers, the grade buttons and the deck list.
A hand-built copy of a design-system component receives none of the
system's updates — no accessibility fix, no token change, no new theme.

**Rule:** before building any interface element, check Kanto's 42
components. Anything interactive or structural that is not a Kanto element
must appear in `test/integrity/native-elements.allowlist.ts` with a written
reason.

**Enforcement:** `test/integrity/kanto-first.test.ts` scans
`app/**/*.vue` and fails when it finds a native `<button>`, `<a>` (other
than through `NuxtLink`), `<nav>`, `<table>`, `<input>`, `<select>`,
`<textarea>`, `<dialog>`, or a list used for navigation, unless the
allowlist covers it. It also fails when an allowlist entry no longer
matches anything, so the list cannot rot. The same test fails when a file
under `app/pages/` imports from `~core/db`.

## 2. Foundation (built first)

- **Shell, 900px and above:** `kt-sub-menu-navigation flush` in the
  sidebar, sections "Learn" and "Collection", `activeHref` from the route,
  `kt-navigate` cancelled and handed to the Nuxt router.
- **Shell, below 900px:** `kt-header sticky` — brand in `brand`, the
  session button in `actions`, the same `kt-sub-menu-navigation` in
  `menu`, `closeMenu()` after every navigation. The hand-built bottom bar
  is removed. (Kanto has no bottom tab bar; the user chose the header's
  collapsing menu over adding a component to Kanto.)
- **Brand mark** 繁 · FANKA stays plain markup: Kanto has no logo
  component and its own guideline says the mark is the word.
- **Page headers:** Today and Review use `kt-page-header`.
- **Grade buttons:** `kt-button` variants `danger`, `warning`, `success`,
  `info` for Again, Hard, Good, Easy, the interval inside the button.
- **Known risk:** `kt-page-header` renders its `<h1>` inside its shadow
  root, and phase 1 moves focus to the page heading after a successful
  Retry. Whether that heading remains focusable must be observed in a
  browser, not inferred.
- **Toasts:** one `kt-toast-container` in the shell.

## 3. Collection screens

| Route | Built from |
| --- | --- |
| `/decks` | `kt-page-header` (New deck action); one `kt-card` per deck with `kt-badge` tag, due and new counts, `kt-meter` composition (mature / young / new), Review and Browse actions; `kt-dropdown` per deck (edit, delete); `kt-modal` + `kt-form` to create and edit; `kt-confirm-dialog` to delete (soft, focus on Cancel) |
| `/decks/:id` | `kt-breadcrumb` › `kt-page-header` › `kt-tabs`: **Cards** (the browse table scoped to the deck) and **Settings** (rename, colour, delete). The Statistics tab moves to phase 3 with the statistics screen. |
| `/browse` | Filters: `kt-input` search, `kt-select` deck, `kt-select` state, `kt-segmented-control` direction. `kt-table` with sort, multiple selection, built-in paging (`pageSize`), `renderCell` for the hanzi font, tone-coloured pinyin and a state `kt-badge`. Bulk suspend, move, delete (`kt-confirm-dialog`). Row click opens a `kt-side-panel` with the card, its review history as a `kt-timeline`, and edit / suspend / delete. |
| `/cards/new`, `/cards/:id` | `kt-form`, `kt-label-input` around `kt-input` / `kt-textarea` / `kt-select`; tags through `kt-input-menu`; directions through two `kt-toggle`s. Live tone-coloured pinyin preview and derived zhuyin. A `kt-toast` on save. |

The sidebar's Collection section gains Decks, Cards, Add and Import only
as each screen lands. The phase 1 rule stands: no dead links.

## 4. Import

Sources in phase 2: **CSV/TSV file and pasted text.** Anki `.apkg` is
deferred; it needs SQLite compiled to WebAssembly and several Anki schema
versions.

- **Progress:** Kanto has no stepper. The step is shown in the
  `kt-page-header` description ("Step 2 of 3 — Field mapping") with a
  `kt-progress-bar` beneath it.
- **Step 1, source:** `kt-segmented-control` file / pasted; `kt-drag-drop`
  (`.csv`, `.tsv`, `.txt`) or `kt-textarea`; destination deck through
  `kt-select`, existing or new.
- **Step 2, mapping:** each detected column with two sample values and a
  `kt-select` onto a Fanka field (hanzi, pinyin, zhuyin, translation,
  example, example translation, tags, ignore); a `kt-toggle` for "first
  row is a header"; recognisable headers pre-fill the mapping.
- **Step 3, verification:** `kt-table` preview with a per-row status,
  `kt-stat` counts (valid / warning / error), a `kt-alert` explaining
  errors. Only valid rows are imported.

`core/import` is pure and built test-first:
- an RFC 4180 CSV parser: quoted fields, delimiters and newlines inside
  quotes, a BOM, CRLF; delimiter detection for pasted text;
- **one validator shared with the seed**, closing phase 1's carried item
  that `hsk1.json` is never validated at runtime. It checks hanzi present,
  no simplified character (the blocklist moves to `core/chinese`), pinyin
  parseable with one syllable per character, and no duplicate hanzi in the
  destination deck;
- duplicates are skipped and counted, never overwritten, so re-importing
  a file creates nothing twice;
- deck colours are restricted to Kanto's `--chart-series-N` set, so an
  imported value cannot inject arbitrary CSS into a `style` binding;
- writes are batched, each batch one Dexie transaction including its
  outbox entries.

**Phase 1 correction made urgent by import:** `toZhuyin(parsePinyin('n2'))`
returns the fragment `"ㄋˊ"`. It becomes `""`, like every other
unconvertible syllable.

## 5. Data layer

- Repositories gain: deck create, update, soft delete; card update and
  soft delete; item suspend; move a card to another deck. Every write keeps
  its outbox entry in the same transaction.
- Composables: `useDecks` extended, plus `useBrowse` (filters, sort,
  selection, bulk actions), `useCardEditor` and `useImport`. Pages never
  touch `core/db`, enforced by §1.

## 6. Carried phase 1 fixes, in blocking order

1. **Undo after a soft delete** — before any screen that deletes. Today
   `undo` can overwrite an unanswered card in the session queue. If the
   item to restore is no longer visible, undo removes the log entry and
   leaves the queue and cursor alone. The test reproduces the final
   review's exact scenario: grade, soft-delete, reload, undo.
2. **Grade and undo failures** on the review page are unhandled — the
   first error-handling item, because IndexedDB connection loss after
   backgrounding is the realistic trigger on Android.
3. **Focus after the review page's Retry**, using the existing
   `useFocusWhenEnabled`.

## 7. Minor findings

Minor review findings whose fix would cost a round for little gain are not
fixed during the phase. They go to `docs/deferred-minors.md`, tracked by
git, which the user works through at the end. Each entry: where, what, why
it is minor. Critical and Important findings are fixed immediately. The
file starts with phase 1's carried minors.

## 8. Testing

- Every new test is first broken on purpose to prove it can fail.
- Unit: `core/import` first; new repository methods and composables under
  `fake-indexeddb`; the integrity test of §1.
- End to end, three scenarios: import a small CSV and find its cards;
  open a card in Browse, edit it, see the change; delete a deck and confirm
  its cards are no longer offered for review.
- The 158 unit tests and 5 end-to-end tests of phase 1 must stay green.

## 9. Out of scope

Anki `.apkg` import; the Statistics tab; the settings screen (phase 3);
Capacitor, notifications and PWA (phase 4); sync, GitHub and Vercel
(phase 5).
