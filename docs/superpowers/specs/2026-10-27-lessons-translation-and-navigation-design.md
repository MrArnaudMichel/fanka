# Lessons, translation drill and navigation — design

Date: 2026-10-27

## Why

- A lesson (the decks that share a tag) could only be browsed, not studied as
  a whole.
- There was no way to work on meanings alone, without pinyin or writing.
- Each module had added its own entry to Learn, which had grown to six items
  with no order between scheduled study and free practice.

## Decisions

- **Learn lesson** runs Review or Writing with `?lesson=<tag>`: every card
  of the lesson in one direction, shuffled, until each has been answered
  right once. A miss comes back three cards later (`~core/srs/lesson`).
  Answers are practice, written by `recordPracticeAnswer`, the same rule as
  endless practice: a new card starts its schedule, any other is logged.
- **Translation** is multiple choice, hanzi to English, English to hanzi or
  both, over one lesson or the studied decks. Answers are logged as checked
  practice on the recognition item and never move the schedule.
- `useStudyRun` reads the query once and picks the session; `SessionProgress`
  and `SessionDone` are shared by Review and Writing. `ChoiceQuestion` is
  shared by Translation and the radicals quiz.
- **Navigation**: Learn is the schedule and the lessons (Today, Lessons,
  Review, Writing); Practice is everything outside the schedule
  (Translation, Endless, Speaking, Radicals); Collection loses Add, which
  stays in Cards, a deck's page and the command palette.
- **Today** keeps Review and Writing, then up to four lessons (due first,
  then started), then one tile per practice mode. The deck list moved out:
  Decks and Lessons already show it.
- Kanto 1.12; `.mcp.json` runs `kanto-mcp` at the same version.
