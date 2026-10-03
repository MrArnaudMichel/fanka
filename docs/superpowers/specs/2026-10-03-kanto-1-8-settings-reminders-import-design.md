# Kanto 1.8, Settings and Account, Reminders, Import — design

Date: 2026-10-03

## Why

- Kanto went from 1.4.0 to 1.8.0 with ten new components. Some of them replace
  stand-ins Fanka built around their absence (a progress bar for a stepper,
  free-text number fields, `<kt-input type="time">`).
- The daily reminder exists only on Android and was invisible on a tablet
  running an APK from before 2026-09-30. Nothing on screen says which build is
  installed, and the Reminder section is hidden on the web with no explanation.
- The Account block in Settings is one form with an email field and two
  buttons. It says little about sync and offers no way to back up data.
- Import treats a duplicate as an error, forgets the column mapping every time,
  and makes the learner go back to the file to fix one bad row.

## Delivery

One spec, four phases, each its own series of commits, in this order — each
later phase uses what an earlier one adds:

1. Kanto 1.8.0
2. Settings as sub-routes, with Account, Data and About
3. Reminders
4. Import

## Phase 1 — Kanto 1.8.0

- Bump `kanto-ds` to `^1.8.0`. Run unit, integrity and e2e suites before any
  other change; 1.5 and 1.6 changed `kt-calendar`, `kt-tooltip` and every
  popover (top layer, new `--surface-popover` tokens).
- New components, where they replace something:

| Component | Where | Replaces |
|---|---|---|
| `kt-steps` | Import header, `navigable` | `kt-progress-bar` stand-in |
| `kt-number-input` | Study: new cards per day, maximum interval | `kt-input type="number"` |
| `kt-slider` | Study: desired retention, 0.70–0.99, step 0.01, `show-value` formatted as a percentage | `kt-input type="number"` |
| `kt-time-input` | Reminders: each time | `kt-input type="time"` |
| `kt-command-palette` | App shell, Cmd/Ctrl+K | nothing (new) |

- **Command palette.** Mounted once in `layouts/default.vue`. Commands come
  from a composable `useCommands()` built on `useNavigation()`:
  - group "Go to": every page in the sidebar and every Settings section;
  - group "Actions": Start review, Start writing, New card, Import, Sync now
    (only when signed in), Switch theme.
  - `kt-select` runs the command (`navigateTo` or the action).
- **Appearance.** Two new settings in Display:
  - `accent`: one of Kanto's seven presets, applied as `data-accent` on `<html>`;
  - `textSize`: Kanto's `data-text-size` values, applied the same way.
  - `theme.client.ts` already applies `data-theme` before mount; it applies these
    two the same way, and a watcher keeps them in step after a save.
- Not adopted, no use in Fanka today: `kt-date-picker`, `kt-calendar`,
  `kt-date-input`, `kt-multi-select`, virtual or manual `kt-table`.

## Phase 2 — Settings as sub-routes

### Routes

```
app/pages/settings.vue            shell: menu + <NuxtPage />
app/pages/settings/index.vue      compact: list of sections; ≥900px: redirect to account
app/pages/settings/account.vue
app/pages/settings/study.vue      (the former Scheduler form)
app/pages/settings/display.vue
app/pages/settings/reminders.vue
app/pages/settings/data.vue
app/pages/settings/about.vue
```

- From 900px up, `kt-sub-menu-navigation` sits to the left of the content,
  `activeHref` bound to the route. Below 900px, `/settings` shows the same
  sections as a list (Kanto `kt-sub-menu-navigation`, `flush`) and each page
  shows a back link through `kt-page-header`.
- The sidebar's Settings entry stays `/settings`; it is active on every
  sub-route.
- Study, Display and Reminders are forms with their own Save, keeping today's
  rule: local form state seeded once from `ready`, one `update()` patch per
  save. Account and Data run their actions immediately.

### Account

Signed out: one `kt-card` explaining what an account adds (sync across devices,
nothing required to use Fanka), the email field and Send link.

Signed in, three blocks:

1. **Profile** — `kt-avatar` with the display name (initials), the display
   name editable in place, the email read-only. The display name lives in
   Supabase `user_metadata.display_name`, written with
   `auth.updateUser({ data })` through `useAuth().updateProfile()`. Empty name
   falls back to the email's local part. The avatar and name also show at the
   bottom of `AppSidebar` when signed in.
2. **Sync** — status badge (Up to date, Syncing, Offline, Error), last synced
   as relative time, **changes waiting** (count of `db.outbox`), and local
   counts of decks, cards and reviews. Sync now. The counts come from a new
   `useSync().details()` that reads through `core/db`, refreshed on mount and
   after each run.
3. **Session** — Sign out, with the reminder that local data stays on the
   device.

### Data

- **Export backup** — a JSON file `fanka-backup-YYYY-MM-DD.json`:

  ```ts
  interface Backup {
    format: 'fanka-backup';
    version: 1;
    exportedAt: number;
    decks: Deck[]; cards: Card[]; items: Item[];
    reviews: Review[]; attempts: Attempt[];
    settings: Settings;
  }
  ```

  Soft-deleted rows are included so a restore cannot resurrect them. On the
  web, a Blob download. On Android, `@capacitor/filesystem` writes it to the
  cache directory and `@capacitor/share` opens the share sheet.
- **Restore backup** — `kt-drag-drop` for one `.json`. The file is parsed and
  validated, a summary (counts per entity, export date) shown, then a
  `kt-confirm-dialog`. Merge by id: a backup row replaces a local row only when
  its `updatedAt` is newer (reviews and attempts are insert-only: added when
  the id is absent). Every row written goes to the outbox. Settings are
  replaced.
- **Reset this device** — `kt-confirm-dialog` (danger). Clears every Dexie
  table and the sync cursor, reseeds nothing. When signed in, the next sync
  pulls the account back; the dialog says which case applies.
- Pure `core/backup/format.ts`: `buildBackup(snapshot, settings, now)`,
  `parseBackup(text): { ok: true, backup } | { ok: false, error }` — checks
  `format`, `version`, that each array exists and each row has an `id`.
  `mergePlan(local, backup)` returns the rows to write. No Dexie: the I/O is in
  `core/db/backup.ts`, the page goes through `useBackup()`.

### About

- App version (`package.json` gains `"version"`), git commit (short sha) and
  build time, injected at build through `nuxt.config.ts` `runtimeConfig.public`
  (computed in the config with `git rev-parse --short HEAD` and `Date.now()`).
- Platform: Android or Web (`Capacitor.getPlatform()`).
- Storage used: `navigator.storage.estimate()`, hidden when unavailable.

## Phase 3 — Reminders

### Settings

`reminderTime: string` becomes:

```ts
/** Local times "HH:MM", 1 to 4, sorted, no duplicates. */
reminderTimes: string[];
/** Days of the week the reminder fires, 0 = Sunday … 6 = Saturday. Never empty when enabled. */
reminderDays: number[];
```

Defaults: `['19:00']`, `[0, 1, 2, 3, 4, 5, 6]`. `loadSettings` migrates a stored
`reminderTime` into `reminderTimes: [reminderTime]` when `reminderTimes` is
absent, before the usual merge drops the old key.

### Scheduling

- Today only the next notification is scheduled: an unopened app gets one
  notification, then none. From now on the next **7 days** are scheduled.
- Pure `core/reminder/schedule.ts`:

  ```ts
  nextReminders(now, times, days, dueToday, doneToday, horizonDays = 7): Reminder[]
  ```

  Every occurrence of every time on an allowed day within the horizon, strictly
  after `now`, sorted. Today's occurrences carry the due count when there is
  work left and are skipped when today is done; every later occurrence carries
  the generic body. Invalid times are dropped. `nextReminder` is replaced.
- Notification ids: `100 + index` for the scheduled list (at most 4 × 7 = 28).
  `reschedule()` cancels every pending notification in the 100–199 range (read
  through `getPending`), then schedules the new list. The startup plugin's
  watcher also watches `reminderTimes` and `reminderDays`.
- `ReminderEngine` gains `pending(): Promise<number[]>` and schedules a list.

### Page

- Toggle Daily reminder (permission asked on turning it on, as today).
- Days: `kt-toggle-button-group multiple`, seven buttons with short day names
  from `Intl` in the page's locale, Monday first.
- Times: one `kt-time-input` per time with a remove button, Add time up to 4.
- **Send test notification**: schedules id 99 one second ahead, title Fanka,
  body "Reminders are working". Toast on success; the permission alert on
  failure.
- Validation on Save: at least one day and one time when enabled.
- On the web the page shows a `kt-empty-state`: reminders work in the Android
  app.

## Phase 4 — Import

- `kt-steps` with Source, Field mapping, Review, `navigable` (back only).
- **Duplicates.** A card whose hanzi is already in the deck is no longer an
  error. `validateCard` takes a policy; with existing hanzi it records a
  `duplicate` flag instead of an error issue. Step 3 shows a fourth stat,
  Already in deck, and a `kt-segmented-control` "Cards already in the deck":
  - **Skip** (default) — today's behaviour.
  - **Update** — overwrites the card's content (pinyin, zhuyin, translation,
    example fields, tags) and `updatedAt`; items and reviews untouched, so SRS
    progress stays. Outbox entry for the card.
  The result toast counts created, updated and skipped.
- **Fix a row.** Rows with an error or warning are clickable (`kt-row-click`).
  A `kt-side-panel` shows hanzi, pinyin, translation, example, example pinyin,
  example translation. Save re-runs `validateCard` on that row only and
  replaces it in `results`. A fixed row keeps its index.
- **Remembered mapping.** On Continue from step 2, the mapping is saved keyed
  by a header signature: the header cells trimmed, lower-cased, joined with
  `\u001f`; only when the source has a header row. Stored in a new local Dexie
  table `importMappings` (`signature`, `columns`, `updatedAt`), never synced,
  schema version bump. On load, a saved mapping for the same signature and
  column count replaces the guess, and step 2 shows "Mapping from your last
  import with these columns". Pure signature function in
  `core/import/mapping.ts`.

## Testing

- Written first, vitest: `nextReminders`, settings migration, `buildBackup`,
  `parseBackup`, `mergePlan`, header signature, duplicate policy in
  `validateCard`, the update path of the import commit.
- Composables with fakes: `useReminder` (fake engine with `pending`),
  `useBackup` (fake-indexeddb), `useAuth().updateProfile` (stub client).
- Integrity: every new native element would need an allowlist entry; the design
  needs none.
- e2e: Settings navigation (menu on desktop, list on mobile), Study save, Import
  with a duplicate set to Update and a row fixed in the side panel.

## Out of scope

- Web push and any server-side scheduling.
- Remote counts in the sync block (only local counts and the outbox).
- Avatar upload; account deletion.
- Anki and Pleco formats; import from the deck page.
- Custom date ranges in Stats.
