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
- **Kanto first.** Before building any interface element, check Kanto's 42
  components (`node_modules/kanto-ui/dist/components`). A native interactive or structural
  element in `app/` needs an entry with its reason in
  `test/integrity/native-elements.allowlist.ts`; the integrity test fails
  otherwise. A hand-built copy of a Kanto component receives none of the
  design system's later fixes.
- **Minor findings go to `docs/deferred-minors.md`**, not into a fix round.

## Commands

    npm run dev        # local
    npm test           # vitest
    npm run build      # Vercel target
    npm run build:app  # static bundle for Capacitor
