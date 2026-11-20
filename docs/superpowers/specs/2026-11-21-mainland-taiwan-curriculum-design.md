# Mainland and Taiwan curricula — design

Date: 2026-11-21

## Why

Fanka was built for one learner of Taiwanese Mandarin: traditional characters,
the developer's own lesson decks. It is going on Google Play for everyone, and
most learners want Mainland Mandarin. The developer still learns Taiwanese
Mandarin in Taiwan.

So at install the learner chooses what to learn, and Fanka brings the whole
curriculum for it — every word of the official list, cut into short lessons
with an example and exercises — instead of an empty app that expects decks to
be imported.

Success: a new learner installs, picks Mainland or Taiwan, and studies HSK 1 or
Taiwan level 1 lesson 1 within a minute, offline, without importing anything. The
developer's existing decks and review history are untouched.

This is the first of three projects. The second, ads and a paid subscription,
gets its own design once this one ships. Delivery inside this one is in
phases (below).

## Goals

- Two bundles, chosen at onboarding, switchable in Settings:
  - **Mainland**: simplified characters, HSK 3.0, pinyin, Mainland readings,
    `zh-CN` speech.
  - **Taiwan**: traditional characters, the TBCL (臺灣華語文能力基準, Taiwan's
    official proficiency standard; TOCFL score reports give the TBCL level), zhuyin and pinyin, Taiwan
    readings (垃圾 lèsè), `zh-TW` speech.
- Every word of each official list, with an English meaning and, wherever the
  checks pass, one example sentence with pinyin and an English translation.
- Lessons of about 10 words, in list order within each level. A lesson is:
  discover each word → about 12 mixed exercises → a summary → the words join
  spaced repetition for reading.
- Units of 3 lessons, closed by a writing session on the unit's words, after
  which they join spaced repetition for writing too. Reading and writing both
  matter; staggering writing by unit keeps the daily load sustainable and
  writes what the learner already recognises.
- An onboarding: welcome, bundle, level, daily goal, reminder, optional account.
- The Speaking page and everything only it uses is removed.

## Non-goals

- Ads, subscriptions, paywalls (project 2).
- Grammar notes, dialogues, textbook-style lessons.
- A placement test. "I already know level n" is a plain choice.
- Meanings or interface in any language but English.
- Showing one bundle's content in the other script.

## Anti-goals (failure even if it works)

- A simplified-only character shown to a Taiwan learner, or a traditional-only
  one to a Mainland learner, anywhere in shipped content.
- An example sentence that uses words far above the lesson's level, or that
  does not contain the word it illustrates.
- Losing or hiding the developer's existing decks, cards, reviews or attempts.
- Needing the network to study (content is bundled with the app).
- Locking lessons: the next one is suggested, every one stays open.

## Constraints

- `core/srs`, `core/chinese` and the new `core/curriculum` are pure (no Vue,
  Nuxt, Dexie, Capacitor) and tested first. Pages reach data only through
  composables. Kanto first; native elements need an allowlist entry. All copy
  English, sentence case. Colours, sizes, durations and radii are Kanto tokens.
- `CLAUDE.md`'s rule "Traditional characters only in content. Never
  simplified." becomes: "Content is in its bundle's script: traditional for
  Taiwan, simplified for Mainland. Never mixed."
- Generation runs on the developer's machine through Ollama (`qwen3.5:9b`,
  Apache 2.0, fits the RTX 5060's 8 GB). It is never run in CI. Its output is
  committed.
- Sync (Supabase) keeps working; new synced data needs a migration with RLS on
  `auth.uid() = user_id`, as the existing tables have.

## Approaches considered

Content source, the decision that drives the rest:

- **Open lists + generated examples — picked.** Word lists and meanings from
  open data; one example per word generated at build time by a local model and
  filtered by automatic checks. Every word gets a level-appropriate example
  where the checks pass; no API cost.
- Open data only (Tatoeba examples). Free and human-written, but many words,
  especially above beginner level, have no sentence or only ones far above the
  learner's level, so lessons are uneven.
- Licensed publisher content. Best quality; contracts and per-use cost rule it
  out for launch. Possible later for a paid tier.

Bundle model: one bundle (script + curriculum + romanisation together) was
picked over two independent settings (script, curriculum). Simpler, and it is
how learners think of it; HSK in traditional characters is dropped.

## Sources

| What | Source | Licence |
|---|---|---|
| HSK 3.0 list, levels 1–6 and the 7–9 band, pinyin | `drkameleon/complete-hsk-vocabulary` `complete.json`, pinned commit | MIT (the list itself is the official PRC list, widely reused) |
| TBCL word list (三等七級詞語表, 14,452 words, levels 1–7), Taiwan pinyin and zhuyin, written and spoken frequency | NAER, `14452詞語表202504.xlsx` from coct.naer.edu.tw (page ID=41), pinned by file name and checksum | CC BY, stated on the download page; attribution on Licences: 國家教育研究院《臺灣華語文能力基準》 |
| English meanings | CC-CEDICT, matched on the bundle's script and reading | CC BY-SA 4.0 (attribution on Licences) |
| Simplified ↔ traditional character sets | `opencc-data` (already a dependency) | Apache 2.0 |
| Example sentences | generated by `qwen3.5:9b` through Ollama | Apache 2.0 model; outputs ours |

Taiwan readings come from the TBCL list itself, so the MOE dictionary
(CC BY-ND, no derivatives) is not used.

## Design

### Bundle and settings

- `Settings` gains `bundle: 'mainland' | 'taiwan' | null` (null until
  onboarding), `onboardedAt: number | null`, `dailyLessons: 1 | 2 | 3`, and for
  Taiwan `reading: 'zhuyin' | 'pinyin' | 'both'` (default `both`).
- `Deck` gains `bundle: 'mainland' | 'taiwan'`. A Dexie migration sets every
  existing deck to `taiwan` (all existing content is traditional). Decks,
  Browse, Review, Stats and Today show only the active bundle's decks.
- Switching bundle in Settings changes what is shown; nothing is deleted. Each
  bundle keeps its own progress because its words are different cards.
- Fonts: add Noto Serif SC and Noto Sans SC. `--fk-font-hanzi-*` resolve to TC
  or SC from a `data-bundle` attribute on `<html>`, set like `data-theme`.
- Speech: `useSpeech` takes its language from the bundle (`zh-CN` / `zh-TW`).

### Script guard

`core/chinese/script.ts` gains `traditionalOnly` (generated from OpenCC like
`simplified-only.json`) and `wrongScriptCharactersIn(text, bundle)`. It guards
generated content (build fails on any hit), imports and the card editor (a
deck of the other script is refused with the offending characters named).

### Content files

```
content/                     committed, served as static assets
  mainland/index.json        levels → lessons → word ids, counts, version
  mainland/level-1.json      the words of HSK 1 with their examples
  …
  taiwan/index.json
  taiwan/level-1.json …
```

A word: `{ id, hanzi,
readings: [{ pinyin, zhuyin?, meanings[] }], pos?, level, lesson,
example?: { text, pinyin, translation, segments[] } }`. Ids are stable
across rebuilds (`hsk1-0042`, `tbcl1-0042`, by list order), because progress
and cards refer to them.

Lessons: each level's words, in list order, cut into lessons of 10 (the last
one of a level takes the remainder if it is under 5). Lesson ids `hsk1-l003`.

Units: each level's lessons in threes (the last unit of a level takes one or
two left over), each followed by a writing session. Unit ids `hsk1-u01`; the
writing session's id is `hsk1-u01-writing`.

Level files are fetched on demand (Nuxt serves `content/` from `public/`, the
Capacitor bundle includes it), so only the active bundle's open level is
loaded. Roughly 5 MB for both bundles in total.

### Build pipeline (`scripts/content/`, run by hand)

1. **fetch**: downloads the pinned sources into an untracked cache.
2. **words**: normalises each list into words with ids, levels, readings and
   CC-CEDICT meanings. A word CC-CEDICT does not know gets a meaning from the
   model in step 3. Runs the script guard.
3. **examples**: for each word, asks Ollama for one sentence, with the words of
   its level and below as the allowed vocabulary, as JSON
   `{ text, pinyin, translation }`. Checks, all required:
   - contains the word;
   - script guard passes;
   - every other word, by greedy longest match against the allowed
     vocabulary, is allowed, with at most one exception;
   - 4 to 20 Han characters;
   - one pinyin syllable per Han character.
   Up to 3 attempts, then the word ships without an example and is listed in
   `content/<bundle>/rejected.json`. Results are appended to a JSONL cache keyed
   by word id and prompt version, so an interrupted run resumes and a rerun
   costs nothing.
4. **assemble**: writes `index.json` and the level files.

Expected run: about 25,500 words (11,000 HSK + 14,452 TBCL) at a few seconds
each, so two or three nights on the developer's machine.

### Curriculum core (`core/curriculum`, pure)

- Types for the content above.
- `nextLesson(index, completed)`: the first lesson not completed.
- `buildExercises(lesson, levelWords, rng)`: about 12 exercises, every word at
  least once, from these kinds:
  - meaning → hanzi and hanzi → meaning: four choices; distractors from the
    lesson, then the level;
  - reading: the right pinyin (or zhuyin) among the same syllables with other
    tones;
  - listening: hear the word, pick it; skipped when no voice is available;
  - cloze: the example with the word blanked, pick the word; needs an example;
  - order: the example's segments shuffled; needs an example;
  - writing: draw the word's first character, at most one per lesson.
  Deterministic for a given seed, so it is testable.
- `scoreLesson(answers)`: correct count and the words missed.
- `unitsOf(level)`: the level's lessons grouped in threes.
- `nextStep(index, completed)` replaces `nextLesson`: the first lesson not
  completed, or a unit's writing session when its lessons are all done and the
  session is not; the next unit's lessons stay open either way.
- `buildWritingSession(unitWords)`: every character of the unit's words that
  has stroke data, each shown with its stroke order, then drawn.

### Progress and reviews

- New Dexie table `lessonProgress` `{ id: lessonId, bundle, completedAt,
  correct, total, known: boolean }` (`known` when marked by the onboarding level
  choice), synced through a new Supabase table and migration, with RLS as the
  others.
- Finishing a lesson creates its words as cards in a per-level curriculum deck
  (`HSK 1`, `Taiwan 1`, tagged with the curriculum so they group as a lesson
  does today), with a **reading** item each. It skips the `newPerDay` cap (the
  lesson introduced the word): the item starts learned, due the next day, or
  the same day for a word missed in the lesson.
- Finishing a unit's writing session adds a **writing** item to each of its
  words, on the same terms (drawn wrong in the session → due the same day).
  A word none of whose characters have stroke data gets no writing item.
- The daily goal counts a writing session as one lesson.
- `lessonProgress` also records writing sessions (`kind: 'lesson' |
  'writing'`). Answers during the lesson are
  logged as attempts with source `lesson`, so Statistics counts them.
- "I already know level n" marks the lessons below as `known`; it creates no
  cards and no reviews.
- The existing 20-word `hsk1-traditional` seed: removed if it has no reviews;
  kept as an ordinary Taiwan deck otherwise.

### Screens

- `/welcome`: the onboarding, shown while `onboardedAt` is null. Steps:
  1. welcome: one sentence;
  2. Mainland or Taiwan;
  3. level: "I'm new", or "I already know" a level;
  4. daily goal: 1, 2 or 3 lessons;
  5. reminder time (existing reminder settings and permission prompt), skippable;
  6. account, skippable.
  An existing install sees it once with Taiwan preselected.
- `/lessons`: levels, each with its lessons, done ones marked, the next one
  highlighted.
- `/lessons/[id]`: discover → exercises → summary, with Continue to the next
  step. The same route runs a writing session (stroke order, then draw).
- `/lessons` shows each level's units, each with its three lessons and its
  writing session.
- Today: the next step (lesson or writing session) and today's goal above the
  reviews.
- Navigation: Lessons added; Speaking removed.

### Removing Speaking

`app/pages/speaking.vue`, `SpeakingQuestionCard.vue`, `core/speaking`, its
navigation entry, icon registration if unused elsewhere, and their tests.

## Phases

1. Bundles: settings, deck migration, script guard both ways, fonts, speech,
   Speaking removed, onboarding (with only the lesson-free steps working).
2. Content pipeline: words for both bundles, example generation, assembly,
   Licences entries.
3. Lessons: curriculum core, lesson screens, progress table and sync, Today,
   the onboarding level step.

## Builder's calls (made while reviewing; correct any)

- **Levels.** HSK: 1, 2, 3, 4, 5, 6 and one "HSK 7–9" level, as the official
  list bands them (about 560 lessons, shown in sections of 50). Taiwan: the
  TBCL's seven levels (第1級 to 第7級); within a level, core words (核心詞)
  first, then by spoken plus written frequency. Deck names follow: `HSK 1`,
  `HSK 7–9`, `Taiwan 1`, `Taiwan 7`. "TOCFL" is the exam's name, owned by
  SC-TOP; the app describes Taiwan levels as "TBCL, Taiwan's official
  standard", may say TOCFL reports the TBCL level, and never names a level
  after the exam (TOCFL keeps its own 4 bands and 8 levels).
- **TBCL entries with variants** (`爸爸/爸`, readings `bàba / bà`): the first
  form is the word; the others are listed on its card as variants.
- **Duplicates.** One word per hanzi per list. A word listed at two levels
  stays at the lower one. Several readings (了 le / liǎo) are one word whose
  `readings[]` each carry their meanings, the commonest first; the card shows
  them all. Nothing in the list is dropped.
- **Ids.** Card id = word id (`hsk1-0042`); deck id = `curriculum:hsk1`; item
  ids derived from the card id and direction. Two devices finishing the same
  lesson write the same rows, so sync merges them instead of duplicating.
- **Content updates.** Cards keep `wordId`. A rebuilt `content/` never rewrites
  existing cards (as `core/seed` already behaves); `index.json`'s `version`
  only busts cached level files.
- **Stroke data.** `scripts/build-stroke-data.mjs` builds both scripts' sets:
  shared characters once, simplified-only into the same folder. Writing skips
  any character without data, in either bundle.
- **Lesson attempts.** Buffered during the lesson and written when it
  finishes; an abandoned lesson logs nothing. Writing exercises are mode
  `writing`, every other kind mode `review`; correct = grade 3, wrong = grade 1.
  Source `lesson` is new: a Supabase migration widens the `attempts` source
  check. Statistics counts lesson time and answers with practice.
- **Deck bundle in sync.** A Supabase migration adds `decks.bundle` with
  default `taiwan`, backfilling the developer's rows; a row without it reads as
  `taiwan`.
- **Bundle across devices.** Bundle and onboarding stay per device (settings do
  not sync). On sign-in, a device whose account has curriculum progress in only
  one bundle switches to it and skips the bundle step.
- **Readings.** `reading` replaces `showZhuyin`: a migration maps `true` to
  `both`, `false` to `pinyin`. Mainland shows pinyin only and ignores it.
  `hidePinyinUntilRevealed` is unchanged and applies to whichever is shown.
- **Order exercise.** Assembly stores `example.segments[]` from the greedy
  match used by the vocabulary check; the app does not segment.
- **"I already know level n"** marks levels 1 to n as known; the next lesson is
  the first of level n + 1.

## Open questions

- **TBCL licence, resolved.** NAER's download page states CC BY for the word
  lists; the site footer says "All rights reserved". The page-level licence is
  specific to these files and is relied on, with attribution. The developer may
  email NAER to confirm the CC BY version; nothing waits on it.
- `qwen3.5:9b`'s Chinese quality on rare words is unknown; the first few
  hundred examples are read by the developer before the full run.

## Left to the builder

Prompt wording; the order of exercises within a lesson; the exact layout of the
lesson screens within Kanto; how `content/` is copied into `public/`; the
JSONL cache format.
