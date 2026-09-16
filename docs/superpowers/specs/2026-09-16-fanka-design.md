# Fanka — design

**Date:** 2026-09-16
**Status:** approved, pending implementation plan

Fanka is a spaced-repetition application for learning Traditional Chinese. The
core is deliberately generic — decks of cards with a scheduler — and the
Chinese-specific behaviour (tone colouring, zhuyin, stroke order, recognition
vs. production) lives in one clearly bounded layer on top of it.

It ships as one codebase with two targets: a web application deployed to Vercel
from GitHub, and an Android application packaged by Capacitor.

The source design is the Claude Design project `Fanka.dc.html`
(`c57c4456-c34c-4eef-89c8-f9f4430c8b1c`). The design system is
[Kanto](https://github.com/MrArnaudMichel/kanto) v1.0.1, consumed from
`file:../kanto` until it is published to npm.

---

## 1. Language

All copy is English: the interface, the seeded deck translations, the code,
the comments and the commit messages. This matches Kanto's own rule — "Copy is
English, sentence case, no emoji" — so no Kanto default string needs
overriding for language reasons.

The source mockup is in French. Every French label in it is translated, and
the record fields that named a language are renamed to be language-neutral:
`fr` → `translation`, `exFr` → `exampleTranslation`. A deck therefore carries
its own translation language, and nothing in the schema assumes French or
English.

## 2. Architecture

### 2.1 One codebase, two build targets

Nuxt 4 with `ssr: false`.

This is a constraint, not a shortcut. Kanto components are custom elements
that need a DOM at definition time. Under SSR they render "unstyled but
present" and then upgrade — the flash Kanto's own README documents. Disabling
SSR removes it, and everything else Nuxt provides still applies: the router,
auto-imports, and Nitro for `/server/api`.

| Command | Preset | Output | Target |
| --- | --- | --- | --- |
| `npm run build` | `vercel` | `.vercel/output` | Vercel, via GitHub |
| `npm run build:app` | `static` | `.output/public` | Capacitor `webDir` |
| `npm run dev` | — | — | Local browser |

The Android build never calls Vercel to render a page. It calls it only for
`/api/*`. That asymmetry is the reason offline is handled entirely on the
client.

### 2.2 Modules

Each module has one purpose, a declared interface, and is testable on its own.

| Module | Purpose | Depends on |
| --- | --- | --- |
| `core/srs/` | Scheduling. Pure functions, no I/O. | — |
| `core/chinese/` | Pinyin, zhuyin, tones, stroke data. Pure except the stroke fetch. | — |
| `core/db/` | Dexie schema and repositories. | `dexie` |
| `core/sync/` | Outbox, conflict resolution, remote adapters. | `core/db` |
| `core/native/` | Capacitor facade with web fallbacks. | `@capacitor/*` |
| `core/import/` | CSV/TSV, pasted text and Anki `.apkg` parsing. | `core/db` |
| `app/` | Pages, layouts, composables, components. | all of the above |

`core/srs` and `core/chinese` are pure and are built test-first.

`core/native` exists so that no page ever imports a Capacitor plugin directly.
Every call has a web fallback, which keeps `npm run dev` working in a plain
browser and keeps the app testable without a device.

## 3. Data model

### 3.1 The card / item split

The mockup queues `{ id: 'c1', dir: 'recog' }` — the direction of review is
scheduled independently of the card. The schema makes that explicit:

```ts
interface Deck {
  id: string;
  name: string;
  description: string;
  colorToken: string;        // --chart-series-N
  tag: string;
  translationLang: string;   // 'en' for the seeded decks
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

interface Card {
  id: string;
  deckId: string;
  hanzi: string;             // traditional
  pinyin: PinyinSyllable[];  // [{ text: 'xué', tone: 2 }]
  zhuyin: string;
  translation: string;
  pos: PartOfSpeech;
  example: string;
  examplePinyin: string;
  exampleTranslation: string;
  tags: string[];
  note: string;              // mnemonic
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

interface Item {                       // one SRS state per direction
  id: string;                          // `${cardId}:${dir}`
  cardId: string;
  dir: 'recognition' | 'production';
  state: 'new' | 'learning' | 'review' | 'relearning';
  due: number;                         // epoch ms
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  lastReview: number | null;
  suspended: boolean;
  updatedAt: number;
}

interface Review {                     // the log — never mutated
  id: string;
  itemId: string;
  grade: 1 | 2 | 3 | 4;
  reviewedAt: number;
  durationMs: number;
  before: Pick<Item, 'state' | 'due' | 'stability' | 'difficulty'>;
}
```

A card produces one or two items depending on the "Recognition" / "Production"
checkboxes on the add form.

`Review` is not decorative. It is the only source for true retention, the
activity heatmap, per-tone accuracy and undo. Deriving those from `Item` alone
is impossible, because `Item` holds only the current state.

### 3.2 Tables

Dexie database `fanka`, version 1:

```
decks     id, updatedAt, deletedAt
cards     id, deckId, updatedAt, deletedAt, *tags
items     id, cardId, dir, due, state, suspended, updatedAt
reviews   id, itemId, reviewedAt
strokes   char
settings  key
outbox    id, entity, entityId, at
```

`items.due` is indexed because the due query runs on every screen.

### 3.3 Settings

A single record, with the fields the mockup exposes plus the ones it declares
and never uses (`hidePinyin`, `audio`) which are implemented here:

```ts
interface Settings {
  algorithm: 'FSRS' | 'SM-2';
  desiredRetention: number;   // 0.80 – 0.97
  newPerDay: number;
  maxInterval: number;        // days
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
```

## 4. Scheduling

The mockup's `schedule()` is a stub with hard-coded multipliers
(`{ 2: 1.25, 3: 2.45, 4: 3.9 }`). It is replaced.

```ts
interface Scheduler {
  preview(item: Item, now: number, settings: Settings): Record<Grade, number>; // ms until due
  apply(item: Item, grade: Grade, now: number, settings: Settings): Item;
}
```

Two implementations:

- `FsrsScheduler` — wraps [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs)
  (FSRS-6, MIT). `desiredRetention` and `maxInterval` are passed through to the
  algorithm, not approximated.
- `Sm2Scheduler` — a direct SM-2 implementation, because the settings screen
  offers it as a real choice.

**Invariant:** the interval shown on a grade button and the interval applied
when it is pressed come from the same call. `preview` and `apply` share their
arithmetic; the UI never recomputes anything.

Undo restores the `Item` from `Review.before` and deletes the `Review` row. It
is exact, not an approximation.

### 4.1 Queue construction

For a session, in order:

1. Items with `due <= now`, `state != 'new'`, not suspended, ordered by `due`.
2. Up to `newPerDay` minus those already introduced today, `state == 'new'`.
3. Interleaved so that new cards are spread through the session rather than
   front-loaded, and so that the two directions of the same card are never
   adjacent.

## 5. Chinese layer

`core/chinese/` holds everything language-specific:

- **Pinyin** — numbered (`xue2`) ↔ diacritic (`xué`) in both directions, tone
  extraction, neutral tone as 5. Pure, and heavily tested; this is where silent
  data corruption would hide.
- **Tones → colour** — `1: --color-info-base`, `2: --color-success-base`,
  `3: --color-warning-base`, `4: --color-danger-base`, `5: --color-text-400`,
  exactly as the mockup. Bypassed to `--color-white` when `toneColors` is off.
- **Zhuyin** — conversion from pinyin, so an imported deck without zhuyin can
  still show it.
- **Stroke data** — fetch from the `hanzi-writer-data` CDN, store in the
  `strokes` table, read from there afterwards. A character seen once online
  works offline permanently. The session pre-fetches the strokes for its whole
  queue while the first card is being answered.

`hanzi-writer` itself is loaded on the client only and rendered into a
container the component owns, never into Vue-managed DOM.

## 6. Kanto usage

All 42 elements are used. The mockup uses 14 and hand-draws the rest in
`<div>`s; those are replaced.

**Replacing hand-drawn markup:** `kt-card` (every panel), `kt-toggle` (the
seven switches in Settings), `kt-meter` (deck composition bars), `kt-kbd`
(shortcut hints), `kt-empty-state`, `kt-progress-bar`, `kt-avatar`, `kt-badge`,
`kt-stat`, `kt-table`, `kt-chart`, `kt-alert`, `kt-segmented-control`,
`kt-sub-menu-navigation` (the sidebar), `kt-icon`.

**Added, because the product needs them and the system already has them:**

| Element | Where |
| --- | --- |
| `kt-side-panel` | Card detail, opened from a row in Browse |
| `kt-modal` | Create/edit deck; the `?` shortcut sheet |
| `kt-confirm-dialog` | Deleting a deck — focuses Cancel, per the system's rule |
| `kt-dropdown` | Row actions in Browse |
| `kt-collapsible` | Settings sections |
| `kt-tabs` | Deck detail: Cards / Statistics / Settings |
| `kt-timeline` | A card's review history |
| `kt-pagination` | Browse table |
| `kt-breadcrumb`, `kt-page-header` | Page headers |
| `kt-drag-drop` | Import step 1, file drop |
| `kt-form`, `kt-label-input`, `kt-input`, `kt-textarea`, `kt-select` | Add/edit card, with native validity |
| `kt-input-menu` | Tag entry |
| `kt-split-button` | "Start session" with deck / due-only / cram |
| `kt-toast`, `kt-toast-container` | Save, sync, undo |
| `kt-tooltip` | Icon-only buttons — never a control's only name |
| `kt-skeleton` | First paint while Dexie loads |
| `kt-toggle-button`, `kt-toggle-button-group` | Review direction filter |
| `kt-code` | Settings: the API endpoint and sync payload preview |

**Rules that are not negotiable in this codebase:**

- No hard-coded colour, size, duration or radius. Everything is a token.
- Semantic aliases over ramp steps: `--surface-card`, not `--color-dark-16`.
- Type applied whole: `font: var(--font-normal-medium)`.
- Data passed as properties, never attributes, for anything non-primitive.
- Elevation is a lighter surface, not a shadow.
- One primary button per screen.

**The one documented exception:** the Chinese typefaces. `Noto Serif TC` and
`Noto Sans TC` are not in Kanto's token layer, so Fanka adds two application
tokens, `--fk-font-hanzi-serif` and `--fk-font-hanzi-sans`, declared once on
`:root` alongside Kanto's. No component is forked.

**Theme:** the mockup is dark-only. Kanto ships a complete light theme driven
by `data-theme`, so Settings offers dark / light / auto for the cost of one
attribute.

## 7. Screens

The mockup defines ten screens. Nine become routes; the tenth — "Android" — is
handled as described at the end of this section. One route the mockup implies
but does not draw, deck detail, is added.

| Route | Screen | Substance |
| --- | --- | --- |
| `/` | Today | Due counts by state, daily goal, streak, 7-day forecast chart, decks with cards due, recent cards |
| `/review` | Review | The session. Prompt, reveal, four grades with interval preview, stroke panel, card scheduling panel, session stats, end-of-session summary |
| `/decks` | Decks | Deck cards with composition meters, due/new counts, review and browse actions |
| `/decks/:id` | Deck detail | Tabs: cards, statistics, settings |
| `/browse` | Browse | Full card table: search, deck filter, state filter, direction filter, sorting, pagination, multi-select, bulk suspend/move/delete |
| `/cards/new`, `/cards/:id` | Add / edit | Validated form, live tone-coloured pinyin preview, stroke preview, direction checkboxes |
| `/import` | Import | Three steps: source (CSV/TSV, `.apkg`, pasted text) → field mapping → verification and commit |
| `/stats` | Statistics | Retention, cards learned, streak, time per day, retention area chart, reviews bar chart, maturity breakdown, answer mix, per-tone accuracy, activity heatmap, hardest cards |
| `/write` | Writing | Stroke-order practice across the collection, with quiz mode |
| `/settings` | Settings | Algorithm, retention, new/day, max interval, display, fonts, theme, reminders, offline, account, devices, sync |

Navigation: a 252px sidebar above 900px, a five-tab bottom bar below it —
Home, Review, Decks, Stats, Settings — exactly as the mockup specifies.

The mockup's "Android" screen is a presentation of the mobile
adaptation rather than a product screen. Its content becomes real: the mobile
layouts it illustrates are the actual responsive behaviour of `/` and
`/review`, so the screen itself is not reproduced.

## 8. Learning-centred interaction

- The session is the default path. One primary button per screen, and on Today
  it is "Start session".
- **Thumb first on mobile.** Grades in a 2×2 grid, 56px tall, at the bottom of
  the screen. Haptic feedback on each grade.
- **Keyboard first on desktop.** Space reveals and grades Good, `1`–`4` grade,
  `U` undoes, `E` edits, `?` opens the shortcut sheet.
- The interval preview sits on the grade button before it is pressed.
- Undo is offered in a toast after every grade.
- `hidePinyinUntilRevealed` is implemented, not merely stored.
- Session state survives backgrounding (Capacitor `App` resume) and reload.
- Reduced motion is respected through Kanto's token layer, which already gates
  every duration.

## 9. Offline and native

**Storage: IndexedDB via Dexie, not SQLite.** This is a deliberate deviation
from the brief. The same code then runs on web and Android with no native
plugin, no schema migration written twice, and no divergence between the two
targets. Dexie handles these volumes — tens of thousands of rows — without
difficulty. SQLite would buy nothing here and cost a platform split.

**Stroke data: lazy with a permanent cache.** A character fetched once is
stored in `strokes` forever. The session pre-fetches its queue. With
`offlineStrokeCache` off, nothing is stored.

**Reminders: `@capacitor/local-notifications`.** A daily notification at the
chosen time, carrying the due count. Not push: push would require Firebase and
a server, while "revision reminder" is fully served locally and stays free.

Other plugins, all behind `core/native/`: `haptics`, `app` (Android back
button, resume), `network` (sync on reconnect), `preferences` (bootstrap
settings before Dexie opens), `status-bar` and `splash-screen` themed to
`--color-dark-8`.

**Capacitor config:** `webDir: '.output/public'`, `androidScheme: 'https'`, no
cleartext traffic, API base URL pointing at the Vercel deployment.

**The web stays a PWA**, installable, with a service worker caching the shell.
The same offline engine serves both.

## 10. Sync

```ts
interface SyncEngine {
  push(ops: OutboxEntry[]): Promise<void>;
  pull(since: number): Promise<RemoteChanges>;
  status(): SyncStatus;
}
```

Two implementations: `NullSync` (the default — the app is fully usable with no
account) and `SupabaseSync`.

Every local mutation writes an `outbox` entry in the same Dexie transaction as
the change itself, so a crash cannot lose one. The engine drains the outbox
when the network is available and on resume.

Conflict resolution is last-write-wins per record on `updatedAt`, with one
exception: `reviews` are append-only and are never in conflict — they merge by
union on `id`. Since the item state is derivable from its review log, a
divergent `Item` is repaired by replaying its reviews.

**Supabase free tier:** tables mirroring the local ones with a `user_id`
column, RLS on every table (`auth.uid() = user_id`), magic-link authentication.
`SUPABASE_URL` and `SUPABASE_ANON_KEY` are optional environment variables; when
they are absent the app runs on `NullSync` and never mentions an account.

## 11. Seeded content

Real Traditional Chinese decks, shipped as JSON and loaded on first run:

- HSK 1–3 in traditional characters
- Frequent characters
- Everyday life and politeness

Each card carries hanzi, tone-marked pinyin, zhuyin, an English translation,
part of speech, an example sentence with its pinyin and English translation,
and tags. Seeding is idempotent and records a version, so a later release can
add decks without duplicating existing ones. The user's own edits to a seeded
card are never overwritten.

## 12. Testing

| Layer | How |
| --- | --- |
| `core/srs` | Vitest. Interval monotonicity across grades, retention and max-interval effects, undo exactness, `preview`/`apply` agreement. Test-first. |
| `core/chinese` | Vitest. Pinyin round-trips numbered ↔ diacritic, tone extraction, zhuyin conversion. Test-first. |
| `core/db` | Vitest with `fake-indexeddb`. Repository operations, outbox written in the same transaction. |
| `core/sync` | Vitest. Outbox drain, conflict resolution, review-log merge. |
| `core/import` | Vitest. CSV/TSV edge cases, field mapping, `.apkg` extraction. |
| App | Playwright smoke: start a session, reveal, grade, undo, finish; reload mid-session and confirm it resumes. |

## 13. Delivery

- GitHub repository, created with `gh repo create`.
- Vercel connected to it, Nuxt preset, `/api` running on Nitro.
- GitHub Actions: lint, typecheck and unit tests on every push and PR; a
  manually triggered workflow that assembles the debug APK and uploads it as
  an artifact.
- The debug APK is built locally as part of this work and the build is
  verified, not assumed.

**Known risk:** the installed JDK is 25, which is newer than the Android
Gradle Plugin that Capacitor generates supports. Mitigation: install a JDK 21
and point Gradle at it with `org.gradle.java.home` in
`android/gradle.properties`. This is expected to need doing, not a surprise.

## 14. Deviations from the mockup, and why

| Mockup | Fanka | Why |
| --- | --- | --- |
| French copy | English | Kanto's own rule; the user asked for it |
| Stub `schedule()` | ts-fsrs / SM-2 | The mockup's multipliers are placeholders |
| Direction implicit in a fixed queue | `Item` per direction | The mockup already schedules per direction; the schema says so |
| Dark only | Dark / light / auto | Kanto ships the light theme already |
| SQLite (brief) | IndexedDB/Dexie | One implementation for both targets |
| Push notifications (brief) | Local notifications | Free, no server, and it is what a reminder needs |
| "Android" presentation screen | Real responsive behaviour | The screen illustrated a layout; the layout is the deliverable |
