# Deferred minors

Minor findings whose fix would cost a review round for little gain. Arnaud
works through this list at the end of a phase. Critical and Important
findings are never parked here.

| Where | What | Why it is minor | From |
| --- | --- | --- | --- |
| `app/components/AppSidebar.vue` | Disabled label "Today's session — nothing due right now" omits the visible "· 0" (WCAG 2.5.3) | Disabled, so it cannot be voice-activated | Phase 1 final review |
| `app/pages/review.vue` | Keyboard shortcuts (1–4, U, Space/Enter) stay live in the `cardMissing` error state | Pre-existing, not a regression | Phase 1 final review |
| `app/composables/useReviewSession.ts` (`intervals`) | No test discriminates the interval-anchoring behaviour from a naive `Date.now()`-based computation — swapping one in for the other stays green | Label drift only while the page sits backgrounded; no known regression | Phase 1 final review, carry to phase 2 |
| e2e "session complete" scenario | The finish test writes settings straight into IndexedDB instead of going through a settings screen | No settings screen exists yet; the test is replaced when phase 3 adds one | Phase 1 final review, carry to phase 3 |
| Test output (`npm test`) | Lit prints "Lit is in dev mode. Not recommended for production!" to stderr during every run | Cosmetic test-output noise, silenceable via `process.env.NODE_ENV=production` in vitest.config.ts | Phase 1 task 1 review |
| `core/db/repositories.ts` (`due()`) | Reads items, then cards, then decks in three non-transactional calls and could in principle observe a torn state | Mirrors the pattern `fresh()` already uses; the codebase reserves transactions for write paths | Phase 1 task 6 review |
| `core/db/settings.ts` (`saveSettings`) | Read-modify-write with no transaction, so two rapid `update()` calls could interleave | Reachable only in theory today | Phase 1 task 7 review, carry to phase 3 (whoever builds the settings screen) |
| `test/composables/useSettings.test.ts` | Module-scope singleton state (`settings`, `ready`, `loading`) is not reset between tests | Only one test exists today; a second test re-exercising the race would pass vacuously | Phase 1 task 7 review |
| Bottom bar (<900px) | Two-tab bottom bar is sparse at 500px (each tab ~250px wide) | Cosmetic, a direct consequence of the phase 1 no-dead-link ruling; resolves when Decks, Stats and Settings land | Phase 1 task 10 review, carry to phase 3 |
| `app/composables/useDueCounts.ts` | Cannot distinguish a failed Dexie read from "nothing due" in the UI — only `console.error`s | Argued trade-off; no toast infrastructure wired up for it yet | Phase 1 task 10 review, carry to phase 3 |
| Kanto's `kt-card` as consumed here | Lit "scheduled update after update completed" console advisory, traced to Kanto's own slotchange bookkeeping | Reproduces for any consumer swapping header content per render; not fixable from this repo | Phase 1 task 12 review |
| Any Kanto element with a `disabled` property | Lit+Vue interop has a microtask-scale window between the `disabled` property being set and the shadow DOM disabling the native control | Uniform across the app, not introduced by any one task | Phase 1 task 12 review |
| `app/composables/useFocusWhenEnabled.ts` and `app/pages/index.vue` | The three-line "focus unclaimed" predicate is duplicated between the composable and the page rather than shared as a one-line helper | Duplication only, no behavioural risk | Phase 1 task 13 review |
| `playwright.config.ts` | `workers: 1` is broader than the one race it exists to serialise — `fullyParallel: false` alone would cover the one spec file; `workers: 1` also serialises every spec file added later | Costs nothing at this size | Phase 1 task 14 review |
| Repo root | No CI workflow exists, so `playwright.config.ts`'s CI-specific branch (`reuseExistingServer: !process.env.CI`) is untested against a real pipeline | No pipeline yet to test it against | Phase 1 task 14 review |
