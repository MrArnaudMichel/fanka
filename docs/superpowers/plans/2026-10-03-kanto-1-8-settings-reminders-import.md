# Kanto 1.8, Settings and Account, Reminders, Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade to Kanto 1.8.0 and use its new components, split Settings into sub-routes with a real Account, Data and About, schedule several weekly reminders a week ahead on Android, and let Import update duplicates, fix rows in place and remember mappings.

**Architecture:** Pure logic first in `core/` (`core/reminder`, `core/backup`, `core/import/rows.ts`), each with vitest tests; Dexie I/O in `core/db`; pages reach both only through composables. Settings becomes a Nuxt nested route (`pages/settings.vue` + `pages/settings/*.vue`) sharing one `useSettingsForm` helper.

**Tech Stack:** Nuxt 4 (ssr: false), Vue 3.5, Kanto 1.8 web components, Dexie 4, Supabase JS, Capacitor 8 (local-notifications, filesystem, share), vitest + happy-dom + fake-indexeddb, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-03-kanto-1-8-settings-reminders-import-design.md`

## Global Constraints

- Commits authored by Arnaud Michel alone: **no `Co-Authored-By` trailer, no AI attribution**.
- All copy English, sentence case, terse, no emoji.
- Never hard-code a colour, size, duration or radius — Kanto tokens, semantic aliases first (`--surface-card`, `--gap-card`, `--text-muted`…).
- Non-string, non-boolean Kanto data goes in as properties (`:commands`, `:steps`, `:sections`, `:format`, `:value` for arrays/numbers). Events are `kt-`-prefixed, payload in `detail`.
- `core/srs`, `core/chinese`, `core/reminder`, `core/backup`, `core/import` are pure: no Vue, Nuxt, Dexie or Capacitor imports.
- Pages never touch Dexie or a scheduler directly — always through a composable.
- Kanto first: no new native `button a nav table input select textarea dialog ul ol` in `app/` templates (the integrity test `test/integrity/kanto-first.test.ts` fails otherwise).
- Traditional characters only in any fixture or copy.
- Minor findings go to `docs/deferred-minors.md`, not into a fix round.
- `kanto-ds` exactly `^1.8.0`.
- Reminder notification ids: `100 + index` for scheduled reminders (≤ 28), `99` for the test notification, legacy `1` cancelled once.
- Backup file: `format: 'fanka-backup'`, `version: 1`, name `fanka-backup-YYYY-MM-DD.json`.
- Header signature: cells trimmed, lower-cased, joined with `\u001f`.

## Review Focus

1. **Old stored settings.** A device whose stored record has `reminderTime: '07:30'` and no `reminderTimes` must come back with `reminderTimes: ['07:30']`, not the default `['19:00']`. Pinned in Task 10.
2. **Removing a time or a day.** Notifications already scheduled for a time the learner removed must disappear; reschedule cancels every pending id in 100–199 and the legacy id 1, not only the ids it is about to reuse. Pinned in Task 10.
3. **A bad or future backup file.** A JSON file that is not a Fanka backup, a `version: 2` backup, or a truncated file must be refused with a message and write nothing. Pinned in Task 7.
4. **Duplicates inside one file with Update.** Two rows with the same hanzi must not both update one card; the second is an error "Repeated earlier in this file". Pinned in Task 13.
5. **Update must not wipe what the file does not carry.** A file with only hanzi, pinyin and translation updating an existing card must keep its example and tags. Pinned in Task 13.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `package.json` | `kanto-ds ^1.8.0`, `"version"`, two Capacitor plugins | 1, 4, 9 |
| `core/db/settings.ts` | Settings type: `accent`, `textSize`, `reminderTimes`, `reminderDays`; migration | 2, 10 |
| `app/composables/useSettings.ts` | apply `data-accent` / `data-text-size`; export `resolvesDark` | 2 |
| `app/utils/commands.ts` | pure command list builder for the palette | 3 |
| `app/composables/useCommands.ts` | palette wiring: commands + run | 3 |
| `app/composables/useNavigation.ts` | `SETTINGS_SECTIONS`, `navActiveHref()` | 3, 4 |
| `app/layouts/default.vue`, `app/components/AppSidebar.vue` | palette mount; `navActiveHref`; profile footer | 3, 4, 5 |
| `app/plugins/kanto.client.ts` | new icons | 3, 4 |
| `app/composables/useSettingsForm.ts` | seed-once draft + save for settings pages | 4 |
| `app/pages/settings.vue` + `app/pages/settings/*.vue` | shell + six sections | 4, 5, 6, 9, 11 |
| `nuxt.config.ts`, `app/composables/useAppInfo.ts`, `app/utils/format.ts` | build info, platform, storage | 4 |
| `app/composables/useAuth.ts` | `displayName`, `updateProfile()` | 5 |
| `core/db/sync-details.ts`, `app/composables/useSync.ts` | outbox + local counts | 6 |
| `core/backup/format.ts` | pure build / parse / merge plan | 7 |
| `core/db/backup.ts` | snapshot, apply plan with outbox, reset device | 8 |
| `app/composables/useBackup.ts` | export (web / Android), restore, reset | 8, 9 |
| `core/reminder/schedule.ts` | `nextReminders`, `normaliseTimes` | 10 |
| `app/composables/useReminder.ts`, `app/plugins/reminder.client.ts` | list scheduling, test notification | 10 |
| `core/import/mapping.ts` | `headerSignature` | 12 |
| `core/import/rows.ts` | `validateImportRows`, `updatedCardFromDraft`, `normalisePinyinText` | 13 |
| `core/db/db.ts`, `core/db/import-mappings.ts` | Dexie v4 `importMappings` | 12 |
| `app/composables/useImport.ts` | async load with remembered mapping, fixRow, duplicate policy | 12, 14 |
| `app/pages/import.vue` | kt-steps, duplicates, side panel | 15 |
| `e2e/settings.spec.ts`, `e2e/import.spec.ts` | end-to-end | 16 |

---

## Phase 1 — Kanto 1.8.0

### Task 1: Upgrade kanto-ds to 1.8.0

**Files:**
- Modify: `package.json`, `package-lock.json`
- Possibly modify: any file a regression points at

**Interfaces:**
- Produces: `kanto-ds@1.8.0` installed; `KtCommand`, `KtStep`, `KT_ACCENTS`, `KT_TEXT_SIZES` importable from `'kanto-ds'`.

- [ ] **Step 1: Baseline**

Run: `npm test 2>&1 | tail -5`
Expected: all pass. Record the count.

- [ ] **Step 2: Install**

Run: `npm install kanto-ds@^1.8.0`
Then: `grep '"version"' node_modules/kanto-ds/package.json`
Expected: `"version": "1.8.0"`

- [ ] **Step 3: Run unit and integrity suites**

Run: `npm test 2>&1 | tail -15`
Expected: same count, all pass. If a test fails, use superpowers:systematic-debugging; the likely causes are listed in the spec (popovers now in the top layer, `kt-calendar` panel changes, `kt-tooltip` in the top layer). Fix the call site, not the test, unless the test asserted Kanto internals.

- [ ] **Step 4: Typecheck and e2e**

Run: `npm run typecheck 2>&1 | tail -20` — Expected: no errors.
Run: `npx playwright test 2>&1 | tail -15` — Expected: all pass. A failure in a spec that opens a `kt-select` usually means a locator scoped inside the host element; the panel now renders in the top layer but stays in the element's shadow root, so `getByRole('option')` still works — fix the locator if it was scoped to a container.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "Upgrade Kanto to 1.8.0"
```
(Add any files fixed in Steps 3–4 to the same commit.)

---

### Task 2: Accent and text size settings

**Files:**
- Modify: `core/db/settings.ts`
- Modify: `app/composables/useSettings.ts`
- Test: `test/db/settings.test.ts`, `test/composables/useSettingsTheme.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // core/db/settings.ts
  export const ACCENTS = ['violet', 'blue', 'teal', 'green', 'orange', 'pink', 'slate'] as const;
  export type Accent = (typeof ACCENTS)[number];
  export type TextSize = 'small' | 'default' | 'large';
  // Settings gains: accent: Accent; textSize: TextSize   (defaults 'violet', 'default')
  // app/composables/useSettings.ts
  export function resolvesDark(theme: Settings['theme']): boolean;  // now exported
  ```

- [ ] **Step 1: Write the failing tests**

Append to `test/db/settings.test.ts` inside `describe('settings', …)`:

```ts
  it('defaults to the violet accent and the default text size', () => {
    expect(DEFAULT_SETTINGS.accent).toBe('violet');
    expect(DEFAULT_SETTINGS.textSize).toBe('default');
  });
```

Append to `test/composables/useSettingsTheme.test.ts` (read the file first and follow its setup — it already resets the DB and imports `useSettings`):

```ts
  it('applies the accent and text size to <html>', async () => {
    await useSettings().update({ accent: 'teal', textSize: 'large' });
    expect(document.documentElement.dataset.accent).toBe('teal');
    expect(document.documentElement.dataset.textSize).toBe('large');
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/db/settings.test.ts test/composables/useSettingsTheme.test.ts`
Expected: FAIL (`accent` undefined; dataset not set).

- [ ] **Step 3: Implement**

In `core/db/settings.ts`, above `export interface Settings`:

```ts
/** Kanto's accent presets (`data-accent`); violet is Kanto's own default. */
export const ACCENTS = ['violet', 'blue', 'teal', 'green', 'orange', 'pink', 'slate'] as const;
export type Accent = (typeof ACCENTS)[number];
/** Kanto's `data-text-size` values. */
export type TextSize = 'small' | 'default' | 'large';
```

Add to `Settings` (after `theme`):

```ts
  /** Kanto accent preset, applied as `data-accent` on <html>. */
  accent: Accent;
  /** Kanto text size, applied as `data-text-size` on <html>. */
  textSize: TextSize;
```

Add to `DEFAULT_SETTINGS` (after `theme: 'dark',`):

```ts
  accent: 'violet',
  textSize: 'default',
```

In `app/composables/useSettings.ts`, extend `applyTheme`:

```ts
function applyTheme(value: Settings): void {
  const root = document.documentElement;
  root.dataset.theme = value.theme;
  root.dataset.hanziFont = value.hanziFont;
  root.dataset.accent = value.accent;
  root.dataset.textSize = value.textSize;
  syncStatusBar(value);
}
```

and change `function resolvesDark(` to `export function resolvesDark(`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run test/db/settings.test.ts test/composables/useSettingsTheme.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/db/settings.ts app/composables/useSettings.ts test/db/settings.test.ts test/composables/useSettingsTheme.test.ts
git commit -m "Add accent and text size settings applied through Kanto's attributes"
```

---

### Task 3: Command palette

**Files:**
- Create: `app/utils/commands.ts`, `app/composables/useCommands.ts`
- Modify: `app/composables/useNavigation.ts` (add `SETTINGS_SECTIONS`, `navActiveHref`)
- Modify: `app/layouts/default.vue`, `app/components/AppSidebar.vue`, `app/plugins/kanto.client.ts`
- Test: `test/utils/commands.test.ts`, `test/utils/navActiveHref.test.ts`

**Interfaces:**
- Consumes: `resolvesDark` (Task 2), `useSync().syncNow`, `useAuth().user`, `useSettings()`.
- Produces:
  ```ts
  // app/composables/useNavigation.ts
  export const SETTINGS_SECTIONS: KtNavItem[];   // label, href (/settings/<id>), icon — six entries
  export function navActiveHref(path: string): string;
  // app/utils/commands.ts
  export function buildCommands(input: { sections: KtNavSection[]; settings: KtNavItem[]; signedIn: boolean; dark: boolean }): KtCommand[];
  // ids: 'go:<href>' | 'action:sync' | 'action:theme'
  // app/composables/useCommands.ts
  export function useCommands(sections: Readonly<Ref<KtNavSection[]>>): { commands: ComputedRef<KtCommand[]>; run(id: string): Promise<void> };
  ```

- [ ] **Step 1: Write the failing tests**

`test/utils/navActiveHref.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { navActiveHref } from '~/composables/useNavigation';

describe('navActiveHref', () => {
  it('maps a deck detail page to Decks', () => {
    expect(navActiveHref('/decks/abc')).toBe('/decks');
  });
  it('maps every settings section to Settings', () => {
    expect(navActiveHref('/settings/account')).toBe('/settings');
    expect(navActiveHref('/settings')).toBe('/settings');
  });
  it('leaves other paths alone', () => {
    expect(navActiveHref('/review')).toBe('/review');
  });
});
```

`test/utils/commands.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { KtNavSection } from 'kanto-ds';
import { buildCommands } from '~/utils/commands';
import { SETTINGS_SECTIONS } from '~/composables/useNavigation';

const sections: KtNavSection[] = [
  { title: 'Learn', items: [{ label: 'Today', href: '/', icon: 'house' }, { label: 'Review', href: '/review', icon: 'play', badge: '3' }] },
];

describe('buildCommands', () => {
  it('lists every page under Go to, keeping its icon and dropping the badge', () => {
    const commands = buildCommands({ sections, settings: [], signedIn: false, dark: true });
    expect(commands.slice(0, 2)).toEqual([
      { id: 'go:/', label: 'Today', group: 'Go to', icon: 'house', keywords: ['Learn'] },
      { id: 'go:/review', label: 'Review', group: 'Go to', icon: 'play', keywords: ['Learn'] },
    ]);
  });

  it('lists every settings section under Settings', () => {
    const commands = buildCommands({ sections: [], settings: SETTINGS_SECTIONS, signedIn: false, dark: true });
    expect(commands.filter((c) => c.group === 'Settings').map((c) => c.id)).toEqual(SETTINGS_SECTIONS.map((s) => `go:${s.href}`));
  });

  it('offers Sync now only when signed in', () => {
    const out = buildCommands({ sections: [], settings: [], signedIn: false, dark: true });
    const inn = buildCommands({ sections: [], settings: [], signedIn: true, dark: true });
    expect(out.some((c) => c.id === 'action:sync')).toBe(false);
    expect(inn.some((c) => c.id === 'action:sync')).toBe(true);
  });

  it('names the theme switch after the theme it switches to', () => {
    expect(buildCommands({ sections: [], settings: [], signedIn: false, dark: true }).find((c) => c.id === 'action:theme')?.label).toBe('Switch to light theme');
    expect(buildCommands({ sections: [], settings: [], signedIn: false, dark: false }).find((c) => c.id === 'action:theme')?.label).toBe('Switch to dark theme');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/utils/commands.test.ts test/utils/navActiveHref.test.ts`
Expected: FAIL (modules / exports missing).

- [ ] **Step 3: Implement navigation helpers**

In `app/composables/useNavigation.ts`, change the type import to `import type { KtNavItem, KtNavSection } from 'kanto-ds';` and add above `useNavigation`:

```ts
/** The Settings sections, in menu order: the settings menu, its mobile list and the command palette all read this. */
export const SETTINGS_SECTIONS: KtNavItem[] = [
  { label: 'Account', href: '/settings/account', icon: 'user' },
  { label: 'Study', href: '/settings/study', icon: 'graduation-cap' },
  { label: 'Display', href: '/settings/display', icon: 'palette' },
  { label: 'Reminders', href: '/settings/reminders', icon: 'bell' },
  { label: 'Data', href: '/settings/data', icon: 'database' },
  { label: 'About', href: '/settings/about', icon: 'info' },
];

/**
 * `kt-sub-menu-navigation` matches `activeHref` by exact equality, so a page
 * below a menu entry maps back to that entry: `/decks/:id` to Decks, every
 * Settings section to Settings.
 */
export function navActiveHref(path: string): string {
  if (path.startsWith('/decks/')) return '/decks';
  if (path.startsWith('/settings/')) return '/settings';
  return path;
}
```

In `app/components/AppSidebar.vue` replace the `activeHref` computed (and its comment) with:

```ts
import { navActiveHref } from '~/composables/useNavigation';
// …
const activeHref = computed(() => navActiveHref(route.path));
```

In `app/layouts/default.vue` replace its `activeHref` computed (and comment) the same way.

- [ ] **Step 4: Implement the builder**

`app/utils/commands.ts`:

```ts
import type { KtCommand, KtNavItem, KtNavSection } from 'kanto-ds';

export interface CommandInput {
  sections: KtNavSection[];
  settings: KtNavItem[];
  signedIn: boolean;
  /** Whether the current theme renders dark, so the switch names the other one. */
  dark: boolean;
}

function goTo(item: KtNavItem, group: string, keywords: string[]): KtCommand | null {
  if (!item.href) return null;
  return { id: `go:${item.href}`, label: item.label, group, icon: item.icon, keywords };
}

/** Everything the command palette offers. Pure, so it is tested without Nuxt. */
export function buildCommands({ sections, settings, signedIn, dark }: CommandInput): KtCommand[] {
  const pages = sections.flatMap((section) =>
    section.items.map((item) => goTo(item, 'Go to', section.title ? [section.title] : [])),
  );
  const settingsPages = settings.map((item) => goTo(item, 'Settings', ['settings', 'preferences']));
  const actions: KtCommand[] = [
    ...(signedIn ? [{ id: 'action:sync', label: 'Sync now', group: 'Actions', icon: 'refresh-cw' }] : []),
    { id: 'action:theme', label: dark ? 'Switch to light theme' : 'Switch to dark theme', group: 'Actions', icon: 'sun-moon', keywords: ['theme', 'dark', 'light'] },
  ];
  return [...pages, ...settingsPages].filter((c): c is KtCommand => c !== null).concat(actions);
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/utils/commands.test.ts test/utils/navActiveHref.test.ts`
Expected: PASS. If the first test fails on `icon: undefined` vs missing key, keep the expectation and make `goTo` omit undefined keys: `...(item.icon ? { icon: item.icon } : {})`.

- [ ] **Step 6: Wire the composable and mount the palette**

`app/composables/useCommands.ts`:

```ts
import type { KtNavSection } from 'kanto-ds';
import { useAuth } from '~/composables/useAuth';
import { SETTINGS_SECTIONS } from '~/composables/useNavigation';
import { resolvesDark, useSettings } from '~/composables/useSettings';
import { useSync } from '~/composables/useSync';
import { buildCommands } from '~/utils/commands';

/** The command palette's list and what picking one does. */
export function useCommands(sections: Readonly<Ref<KtNavSection[]>>) {
  const { user } = useAuth();
  const { settings, update } = useSettings();
  const { syncNow } = useSync();

  const commands = computed(() =>
    buildCommands({ sections: sections.value, settings: SETTINGS_SECTIONS, signedIn: !!user.value, dark: resolvesDark(settings.value.theme) }),
  );

  async function run(id: string): Promise<void> {
    if (id.startsWith('go:')) {
      await navigateTo(id.slice('go:'.length));
    } else if (id === 'action:sync') {
      await syncNow();
    } else if (id === 'action:theme') {
      await update({ theme: resolvesDark(settings.value.theme) ? 'light' : 'dark' });
    }
  }

  return { commands, run };
}
```

In `app/layouts/default.vue` script:

```ts
import { useCommands } from '~/composables/useCommands';
// …after `const { sections } = useNavigation(counts);`
const { commands, run: runCommand } = useCommands(sections);

function onCommand(event: CustomEvent<{ id: string }>): void {
  void runCommand(event.detail.id);
}
```

In its template, just before `<kt-toast-container>`:

```html
    <!-- Cmd/Ctrl+K from anywhere; `commands` is an array, so it goes in as a property. -->
    <kt-command-palette :commands="commands" placeholder="Go to a page or run an action" @kt-select="onCommand" />
```

In `app/plugins/kanto.client.ts`, import from `lucide` and add to `registerIcons` (alphabetical, both lists): `Bell, Database, GraduationCap, Info, LogOut, Palette, Send, SunMoon, User`. Extend the comment: "User, GraduationCap, Palette, Bell, Database and Info are the Settings sections; LogOut is Account's Sign out; Send is Reminders' test notification; SunMoon is the palette's theme switch."

- [ ] **Step 7: Verify in the app**

Run: `npm test 2>&1 | tail -5` — Expected: all pass (the integrity test too).
Run `npm run dev`, open `/`, press Ctrl+K: palette opens; type "stat", Enter → `/stats`; "light" → theme flips.

- [ ] **Step 8: Commit**

```bash
git add app/utils/commands.ts app/composables/useCommands.ts app/composables/useNavigation.ts app/layouts/default.vue app/components/AppSidebar.vue app/plugins/kanto.client.ts test/utils/commands.test.ts test/utils/navActiveHref.test.ts
git commit -m "Add a Cmd+K command palette for pages, settings and quick actions"
```

---

## Phase 2 — Settings as sub-routes

### Task 4: Settings shell, Study, Display, Reminders (moved), About

**Files:**
- Create: `app/composables/useSettingsForm.ts`, `app/composables/useAppInfo.ts`
- Rewrite: `app/pages/settings.vue` (shell)
- Create: `app/pages/settings/index.vue`, `study.vue`, `display.vue`, `reminders.vue`, `about.vue`, `account.vue` (Account moved as-is for now, rebuilt in Task 5)
- Modify: `nuxt.config.ts`, `package.json` (`"version": "1.0.0"`), `app/utils/format.ts`
- Test: `test/composables/useSettingsForm.test.ts`, `test/utils/format.test.ts`

**Interfaces:**
- Consumes: `SETTINGS_SECTIONS`, `navActiveHref` (Task 3), `ACCENTS`, `TextSize` (Task 2).
- Produces:
  ```ts
  export function useSettingsForm<K extends keyof Settings>(keys: readonly K[]): {
    draft: Pick<Settings, K>;        // reactive
    ready: Readonly<Ref<boolean>>;
    saving: Ref<boolean>;
    save(): Promise<boolean>;        // true on success; never throws
  };
  export function formatBytes(bytes: number): string;   // "0 B", "512 B", "1.5 kB", "12 MB"
  export function useAppInfo(): { version: string; commit: string; builtAt: number; platform: 'Android' | 'Web'; storage: Ref<{ usage: number; quota: number } | null>; loadStorage(): Promise<void> };
  ```

- [ ] **Step 1: Write the failing tests**

`test/composables/useSettingsForm.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSettingsForm } from '~/composables/useSettingsForm';
import { useSettings } from '~/composables/useSettings';
import { db } from '~core/db/db';
import { loadSettings } from '~core/db/settings';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('useSettingsForm', () => {
  it('seeds the draft from the stored settings once they load', async () => {
    await useSettings().update({ newPerDay: 22 });
    const form = useSettingsForm(['newPerDay', 'algorithm']);
    await vi.waitFor(() => expect(form.ready.value).toBe(true));
    expect(form.draft.newPerDay).toBe(22);
  });

  it('saves only its own keys, copying arrays out of the reactive draft', async () => {
    const form = useSettingsForm(['newPerDay']);
    await vi.waitFor(() => expect(form.ready.value).toBe(true));
    form.draft.newPerDay = 40;
    expect(await form.save()).toBe(true);
    expect((await loadSettings()).newPerDay).toBe(40);
  });

  it('does not overwrite the draft when settings change elsewhere after seeding', async () => {
    const form = useSettingsForm(['newPerDay']);
    await vi.waitFor(() => expect(form.ready.value).toBe(true));
    form.draft.newPerDay = 5;
    await useSettings().update({ newPerDay: 99 });
    expect(form.draft.newPerDay).toBe(5);
  });
});
```

Add `vi` to the vitest import. Append to `test/utils/format.test.ts`:

```ts
describe('formatBytes', () => {
  it('reads in the largest whole unit', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 kB');
    expect(formatBytes(12 * 1000 * 1000)).toBe('12 MB');
  });
});
```

(and add `formatBytes` to that file's import from `~/utils/format`).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/composables/useSettingsForm.test.ts test/utils/format.test.ts`
Expected: FAIL (missing modules / export).

- [ ] **Step 3: Implement `useSettingsForm` and `formatBytes`**

`app/composables/useSettingsForm.ts`:

```ts
import type { Settings } from '~core/db/settings';
import { useSettings } from '~/composables/useSettings';

/** Arrays come out of a reactive draft as proxies, which IndexedDB cannot clone. */
function plain<T>(value: T): T {
  return (Array.isArray(value) ? [...value] : value) as T;
}

/**
 * Local form state for one Settings page, seeded from the loaded record and
 * never re-synced while the page is open: a background `update()` from
 * another page must not overwrite what the learner is typing. Re-seeds once,
 * the instant `ready` flips true. `save()` writes the page's keys as one
 * patch and never throws; the page words the toast.
 */
export function useSettingsForm<K extends keyof Settings>(keys: readonly K[]) {
  const { settings, ready, update } = useSettings();
  const draft = reactive({}) as Pick<Settings, K>;
  const saving = ref(false);

  function seed(): void {
    for (const key of keys) (draft as Settings)[key] = plain(settings.value[key]) as Settings[K];
  }
  seed();
  watch(ready, (isReady) => {
    if (isReady) seed();
  });

  async function save(): Promise<boolean> {
    saving.value = true;
    try {
      const patch = {} as Partial<Settings>;
      for (const key of keys) (patch as Settings)[key] = plain((draft as Settings)[key]) as Settings[K];
      await update(patch);
      return true;
    } catch (err) {
      console.error('settings: failed to save', err);
      return false;
    } finally {
      saving.value = false;
    }
  }

  return { draft, ready, saving, save };
}
```

Append to `app/utils/format.ts`:

```ts
/** Bytes in the largest unit that keeps a whole number in front, decimal (kB = 1000 B) as storage APIs report. */
export function formatBytes(bytes: number): string {
  const units = ['B', 'kB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const shown = unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${shown} ${units[unit]}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/composables/useSettingsForm.test.ts test/utils/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Build info**

`package.json`: add `"version": "1.0.0",` after `"name": "fanka",`.

`nuxt.config.ts`, at the top:

```ts
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

/** The short commit the bundle is built from, for Settings › About; empty outside a git checkout. */
function gitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return '';
  }
}
```

and in `runtimeConfig.public`:

```ts
      appVersion: pkg.version,
      appCommit: gitCommit(),
      appBuiltAt: String(Date.now()),
```

`app/composables/useAppInfo.ts`:

```ts
import { Capacitor } from '@capacitor/core';

/** What Settings › About shows: which build this is, where it runs, how much it stores. */
export function useAppInfo() {
  const config = useRuntimeConfig().public;
  const storage = ref<{ usage: number; quota: number } | null>(null);

  async function loadStorage(): Promise<void> {
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate?.usage !== undefined && estimate.quota !== undefined) storage.value = { usage: estimate.usage, quota: estimate.quota };
    } catch (err) {
      console.error('useAppInfo: storage estimate failed', err);
    }
  }

  return {
    version: String(config.appVersion ?? ''),
    commit: String(config.appCommit ?? ''),
    builtAt: Number(config.appBuiltAt ?? 0),
    platform: Capacitor.getPlatform() === 'android' ? ('Android' as const) : ('Web' as const),
    storage,
    loadStorage,
  };
}
```

- [ ] **Step 6: The shell**

Replace `app/pages/settings.vue` entirely:

```vue
<script setup lang="ts">
import type { KtNavItem } from 'kanto-ds';
import { useCompactLayout } from '~/composables/useCompactLayout';
import { SETTINGS_SECTIONS } from '~/composables/useNavigation';

const route = useRoute();
const { compact } = useCompactLayout();
const menuSections = [{ items: SETTINGS_SECTIONS }];

function onNavigate(event: CustomEvent<{ item: KtNavItem }>): void {
  event.preventDefault();
  if (event.detail.item.href) void navigateTo(event.detail.item.href);
}
</script>

<template>
  <div class="settings-shell">
    <!-- From 900px up the sections sit beside the page; below, /settings itself is the list. -->
    <kt-sub-menu-navigation
      v-if="!compact"
      class="settings-menu"
      :sections="menuSections"
      :active-href="route.path"
      @kt-navigate="onNavigate"
    />
    <div class="settings-page">
      <NuxtPage />
    </div>
  </div>
</template>

<style scoped>
.settings-shell { display: flex; gap: var(--gap-card); align-items: flex-start; }
.settings-menu { flex: none; position: sticky; top: var(--gap-card); }
.settings-page { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--gap-card); }
</style>
```

(If `--gap-card` is not a valid `top`, use the same token the layout uses for page padding; never a literal.)

`app/pages/settings/index.vue`:

```vue
<script setup lang="ts">
import type { KtNavItem } from 'kanto-ds';
import { useCompactLayout } from '~/composables/useCompactLayout';
import { SETTINGS_SECTIONS } from '~/composables/useNavigation';

const { compact } = useCompactLayout();
const sections = [{ items: SETTINGS_SECTIONS }];

// On a wide screen the menu is already beside the page, so open the first section.
watch(compact, (isCompact) => {
  if (!isCompact) void navigateTo('/settings/account', { replace: true });
}, { immediate: true });

function onNavigate(event: CustomEvent<{ item: KtNavItem }>): void {
  event.preventDefault();
  if (event.detail.item.href) void navigateTo(event.detail.item.href);
}
</script>

<template>
  <kt-page-header eyebrow="Preferences" heading="Settings" />
  <kt-sub-menu-navigation :sections="sections" @kt-navigate="onNavigate" />
</template>
```

Every section page starts with a back control on compact screens. Put it in each page's `kt-page-header` `actions` slot:

```html
<kt-button v-if="compact" slot="actions" variant="secondary-no-bg" size="medium" icon="chevron-left" @click="navigateTo('/settings')">Settings</kt-button>
```

with `const { compact } = useCompactLayout();` in the script.

- [ ] **Step 7: Study page**

`app/pages/settings/study.vue`:

```vue
<script setup lang="ts">
import { toaster } from 'kanto-ds';
import type { KtOption } from 'kanto-ds';
import { useCompactLayout } from '~/composables/useCompactLayout';
import { useSettingsForm } from '~/composables/useSettingsForm';

const { compact } = useCompactLayout();
const { draft, ready, saving, save } = useSettingsForm(['algorithm', 'newPerDay', 'desiredRetention', 'maxInterval'] as const);

const algorithmOptions: KtOption[] = [
  { id: 'FSRS', label: 'FSRS' },
  { id: 'SM-2', label: 'SM-2' },
];
const errors = reactive({ newPerDay: '', maxInterval: '' });
const percent = (n: number) => `${Math.round(n * 100)}%`;

function validate(): boolean {
  errors.newPerDay = Number.isInteger(draft.newPerDay) && draft.newPerDay >= 0 ? '' : 'Enter a whole number, 0 or more.';
  errors.maxInterval = Number.isInteger(draft.maxInterval) && draft.maxInterval >= 1 ? '' : 'Enter a whole number, 1 or more.';
  return !errors.newPerDay && !errors.maxInterval;
}

async function onSave(): Promise<void> {
  if (!validate()) return;
  if (await save()) toaster.success('Settings saved');
  else toaster.error("Couldn't save settings", { description: 'Try again.' });
}
</script>

<template>
  <kt-page-header eyebrow="Settings" heading="Study" description="Daily allowance and the algorithm behind due dates.">
    <kt-button v-if="compact" slot="actions" variant="secondary-no-bg" size="medium" icon="chevron-left" @click="navigateTo('/settings')">Settings</kt-button>
  </kt-page-header>
  <form novalidate @submit.prevent="onSave">
    <kt-form heading="Scheduler" :loading="!ready" loading-fields="4">
      <kt-label-input label="Scheduler algorithm">
        <kt-select :options="algorithmOptions" :value="draft.algorithm" :clearable="false" @kt-change="(e: CustomEvent) => (draft.algorithm = e.detail.value)" />
      </kt-label-input>
      <kt-number-input
        label="New cards per day"
        :min="0"
        :value="draft.newPerDay"
        :error="errors.newPerDay"
        @kt-change="(e: CustomEvent<{ value: number | null }>) => (draft.newPerDay = e.detail.value ?? Number.NaN)"
      />
      <kt-slider
        label="Desired retention"
        :min="0.7"
        :max="0.99"
        :step="0.01"
        show-value
        :format="percent"
        :value="String(draft.desiredRetention)"
        @kt-change="(e: CustomEvent<{ value: string }>) => (draft.desiredRetention = Number(e.detail.value))"
      />
      <kt-number-input
        label="Maximum interval (days)"
        :min="1"
        :value="draft.maxInterval"
        :error="errors.maxInterval"
        @kt-change="(e: CustomEvent<{ value: number | null }>) => (draft.maxInterval = e.detail.value ?? Number.NaN)"
      />
      <kt-button slot="footer" type="submit" variant="primary" size="medium" :full-width="compact" :disabled="saving || !ready">Save</kt-button>
    </kt-form>
  </form>
</template>
```

(A stored retention below 0.70 from an older device: the slider clamps its display; saving writes the clamped value. Acceptable — 0.70 is FSRS's useful floor.)

- [ ] **Step 8: Display page**

`app/pages/settings/display.vue`: same shape as Study, with

```ts
import { KT_ACCENTS, KT_TEXT_SIZES } from 'kanto-ds';
const { draft, ready, saving, save } = useSettingsForm(
  ['theme', 'accent', 'textSize', 'hanziFont', 'showZhuyin', 'toneColors', 'hidePinyinUntilRevealed', 'strokeFeedback', 'autoPlayAudio'] as const,
);
const themeOptions: KtOption[] = [
  { id: 'auto', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];
const accentOptions: KtOption[] = KT_ACCENTS.map((a) => ({ id: a.id, label: a.label }));
const textSizeOptions: KtOption[] = KT_TEXT_SIZES.map((t) => ({ id: t.id, label: t.label }));
const hanziFontOptions: KtOption[] = [
  { id: 'serif', label: 'Serif' },
  { id: 'sans', label: 'Sans' },
];
```

page header `heading="Display" description="Theme, colour and how cards are shown."`, one `kt-form` "Appearance" with four `kt-label-input` + `kt-select` (Theme, Accent colour, Text size, Hanzi font), and one `kt-form` "Cards" with the five `kt-toggle size="small"` copied verbatim from the old `settings.vue` (bound to `draft.*`), Save in the second form's footer. Keep the old comment "kt-toggle's `label` is only an accessible name; the visible label is its slot."

- [ ] **Step 9: Reminders page (moved, unchanged behaviour)**

`app/pages/settings/reminders.vue`: move the old Reminder form. Script:

```ts
import { toaster } from 'kanto-ds';
import { useCompactLayout } from '~/composables/useCompactLayout';
import { useReminder } from '~/composables/useReminder';
import { useSettingsForm } from '~/composables/useSettingsForm';

const { compact } = useCompactLayout();
const { draft, ready, saving, save } = useSettingsForm(['reminderEnabled', 'reminderTime'] as const);
const { native, requestPermission } = useReminder();
const denied = ref(false);

async function onToggle(event: CustomEvent<{ checked: boolean }>): Promise<void> {
  draft.reminderEnabled = event.detail.checked;
  denied.value = false;
  if (event.detail.checked && !(await requestPermission())) {
    draft.reminderEnabled = false;
    denied.value = true;
  }
}

async function onSave(): Promise<void> {
  if (await save()) toaster.success('Settings saved');
  else toaster.error("Couldn't save settings", { description: 'Try again.' });
}
```

Template: page header "Reminders" / "A daily notification with how many cards are due."; when `!native`, a `kt-empty-state icon="bell" heading="Reminders need the Android app" description="Install Fanka on Android to get a daily notification with how many cards are due."`; otherwise the old form (toggle, denied alert, `kt-input type="time"` bound to `draft.reminderTime`) with Save in its footer.

- [ ] **Step 10: About page**

`app/pages/settings/about.vue`:

```vue
<script setup lang="ts">
import { useAppInfo } from '~/composables/useAppInfo';
import { useCompactLayout } from '~/composables/useCompactLayout';
import { formatBytes } from '~/utils/format';

const { compact } = useCompactLayout();
const { version, commit, builtAt, platform, storage, loadStorage } = useAppInfo();
onMounted(loadStorage);
const builtLabel = builtAt ? new Date(builtAt).toLocaleString() : 'Unknown';
</script>

<template>
  <kt-page-header eyebrow="Settings" heading="About" description="Which build this is and where it runs.">
    <kt-button v-if="compact" slot="actions" variant="secondary-no-bg" size="medium" icon="chevron-left" @click="navigateTo('/settings')">Settings</kt-button>
  </kt-page-header>
  <kt-card>
    <dl class="facts">
      <dt>Version</dt><dd>{{ version }}<template v-if="commit"> ({{ commit }})</template></dd>
      <dt>Built</dt><dd>{{ builtLabel }}</dd>
      <dt>Platform</dt><dd>{{ platform }}</dd>
      <template v-if="storage">
        <dt>Storage used</dt><dd>{{ formatBytes(storage.usage) }} of {{ formatBytes(storage.quota) }}</dd>
      </template>
    </dl>
  </kt-card>
</template>

<style scoped>
.facts { display: grid; grid-template-columns: max-content 1fr; gap: var(--gap-element) var(--gap-card); margin: 0; }
.facts dt { color: var(--text-muted); font: var(--font-normal-regular); }
.facts dd { margin: 0; color: var(--text-body); font: var(--font-normal-medium); }
</style>
```

- [ ] **Step 11: Account page (moved as-is)**

`app/pages/settings/account.vue`: move the old Account `<form>` block and its script (useAuth, useSync, email, linkSent, onSendLink, onSignOut, onSyncNow, lastSyncedLabel) verbatim, with a page header `eyebrow="Settings" heading="Account"` and the compact back button. Task 5 rebuilds it.

- [ ] **Step 12: Verify**

Run: `npm test 2>&1 | tail -5` — Expected: all pass.
Run: `npm run typecheck 2>&1 | tail -10` — Expected: no errors.
Run `npm run dev`: at ≥900px `/settings` lands on Account with the menu on the left and the sidebar's Settings entry highlighted; at 400px `/settings` is the list and each section has a Settings back button. Change new cards per day with −/+, save, reload: kept. Change accent: the primary colour changes on save.

- [ ] **Step 13: Commit**

```bash
git add package.json nuxt.config.ts app/pages/settings.vue app/pages/settings app/composables/useSettingsForm.ts app/composables/useAppInfo.ts app/utils/format.ts test/composables/useSettingsForm.test.ts test/utils/format.test.ts
git commit -m "Split Settings into sections with Study, Display, Reminders and About pages"
```

---

### Task 5: Account — profile and session

**Files:**
- Modify: `app/composables/useAuth.ts`
- Rewrite: `app/pages/settings/account.vue`
- Modify: `app/components/AppSidebar.vue`
- Test: `test/composables/useAuth.test.ts`

**Interfaces:**
- Produces (added to `useAuth()`'s return):
  ```ts
  displayName: ComputedRef<string>;                   // metadata name, else email local part, else ''
  updateProfile(name: string): Promise<boolean>;      // never throws; error lands in `error`
  ```

- [ ] **Step 1: Write the failing tests**

In `test/composables/useAuth.test.ts`, add to the hoisted `authStub`:

```ts
    updateUser: vi.fn(async (attrs: { data: { display_name: string } }): Promise<{ data: { user: unknown }; error: FakeAuthError }> => ({
      data: { user: { id: 'u1', email: 'arnaud@example.com', user_metadata: { display_name: attrs.data.display_name } } },
      error: null,
    })),
```

and widen `FakeSession` to `{ user: { id: string; email: string; user_metadata?: { display_name?: string } } } | null`. Then add tests (read the file's existing tests first; they share module state and use `authStub.emit` + `flush()`):

```ts
describe('profile', () => {
  it('falls back to the email local part without a display name', async () => {
    const { useAuth } = await import('~/composables/useAuth');
    const auth = useAuth();
    authStub.emit('SIGNED_IN', { user: { id: 'u1', email: 'arnaud@example.com' } });
    expect(auth.displayName.value).toBe('arnaud');
  });

  it('saves a trimmed display name and shows it', async () => {
    const { useAuth } = await import('~/composables/useAuth');
    const auth = useAuth();
    authStub.emit('SIGNED_IN', { user: { id: 'u1', email: 'arnaud@example.com' } });
    expect(await auth.updateProfile('  Arnaud  ')).toBe(true);
    expect(authStub.updateUser).toHaveBeenCalledWith({ data: { display_name: 'Arnaud' } });
    expect(auth.displayName.value).toBe('Arnaud');
  });

  it('reports a failed update in error and returns false', async () => {
    const { useAuth } = await import('~/composables/useAuth');
    const auth = useAuth();
    authStub.updateUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'Network down' } });
    expect(await auth.updateProfile('X')).toBe(false);
    expect(auth.error.value).toBe('Network down');
  });
});
```

(Adapt the import style to the file's own — if it imports `useAuth` at the top, use that.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/composables/useAuth.test.ts`
Expected: FAIL (`displayName` / `updateProfile` undefined).

- [ ] **Step 3: Implement**

In `app/composables/useAuth.ts`, at module scope after the refs:

```ts
/** The name Account and the sidebar show: the profile's, else the email's local part. */
const displayName = computed(() => {
  const named = (user.value?.user_metadata?.display_name as string | undefined)?.trim();
  if (named) return named;
  return user.value?.email?.split('@')[0] ?? '';
});
```

Inside `useAuth()`, before `return`:

```ts
  /** Stores the display name in the account's metadata. Never throws: a failure lands in `error`. */
  async function updateProfile(name: string): Promise<boolean> {
    error.value = '';
    try {
      const { data, error: updateError } = await getSupabaseClient().auth.updateUser({ data: { display_name: name.trim() } });
      if (updateError) {
        error.value = updateError.message;
        return false;
      }
      if (data.user) user.value = data.user;
      return true;
    } catch (err) {
      console.error('useAuth: profile update failed', err);
      error.value = err instanceof Error ? err.message : 'Profile update failed';
      return false;
    }
  }
```

and add `displayName, updateProfile,` to the returned object.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/composables/useAuth.test.ts`
Expected: PASS.

- [ ] **Step 5: Rebuild the Account page**

`app/pages/settings/account.vue` (Task 6 adds the Sync block between Profile and Session):

```vue
<script setup lang="ts">
import { toaster } from 'kanto-ds';
import { useAuth } from '~/composables/useAuth';
import { useCompactLayout } from '~/composables/useCompactLayout';

const { compact } = useCompactLayout();
const { user, loading, error, displayName, signIn, signOut, updateProfile } = useAuth();

const email = ref('');
const linkSent = ref(false);
const nameDraft = ref('');
const savingName = ref(false);
watch(displayName, (name) => (nameDraft.value = name), { immediate: true });

async function onSendLink(): Promise<void> {
  linkSent.value = false;
  await signIn(email.value);
  if (!error.value) linkSent.value = true;
}

async function onSaveName(): Promise<void> {
  savingName.value = true;
  const ok = await updateProfile(nameDraft.value);
  savingName.value = false;
  if (ok) toaster.success('Profile saved');
  else toaster.error("Couldn't save your profile", { description: error.value || 'Try again.' });
}

async function onSignOut(): Promise<void> {
  await signOut();
  linkSent.value = false;
  email.value = '';
}
</script>

<template>
  <kt-page-header eyebrow="Settings" heading="Account" description="Your profile and how this device syncs.">
    <kt-button v-if="compact" slot="actions" variant="secondary-no-bg" size="medium" icon="chevron-left" @click="navigateTo('/settings')">Settings</kt-button>
  </kt-page-header>

  <form v-if="!user" novalidate @submit.prevent="onSendLink">
    <kt-form heading="Sign in" description="An account syncs your decks and progress across devices. Fanka works fully offline without one.">
      <kt-label-input label="Email">
        <kt-input type="email" name="email" autocomplete="email" placeholder="you@example.com" :value="email" :error="error"
          @kt-input="(e: CustomEvent<{ value: string }>) => { email = e.detail.value; linkSent = false; }" />
      </kt-label-input>
      <kt-alert v-if="linkSent && !error" variant="success" description="Check your inbox for the sign-in link." />
      <kt-button slot="footer" type="submit" variant="primary" size="medium" :disabled="loading || !email">Send link</kt-button>
    </kt-form>
  </form>

  <template v-else>
    <form novalidate @submit.prevent="onSaveName">
      <kt-form heading="Profile">
        <div class="identity">
          <kt-avatar size="large" :name="displayName" />
          <div class="identity-text">
            <span class="identity-name">{{ displayName }}</span>
            <span class="identity-email">{{ user.email }}</span>
          </div>
        </div>
        <kt-label-input label="Display name">
          <kt-input name="display-name" autocomplete="nickname" :value="nameDraft" @kt-input="(e: CustomEvent<{ value: string }>) => (nameDraft = e.detail.value)" />
        </kt-label-input>
        <kt-button slot="footer" type="submit" variant="primary" size="medium" :disabled="savingName || nameDraft.trim() === displayName">Save</kt-button>
      </kt-form>
    </form>

    <!-- Sync block: Task 6 -->

    <kt-form heading="Session" description="Signing out keeps everything on this device.">
      <kt-button slot="footer" variant="dark" size="medium" icon="log-out" @click="onSignOut">Sign out</kt-button>
    </kt-form>
  </template>
</template>

<style scoped>
form { display: flex; flex-direction: column; }
.identity { display: flex; align-items: center; gap: var(--gap-element); }
.identity-text { display: flex; flex-direction: column; min-width: 0; }
.identity-name { font: var(--font-normal-medium); color: var(--text-body); }
.identity-email { font: var(--font-normal-small); color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; }
</style>
```

- [ ] **Step 6: Sidebar footer**

In `app/components/AppSidebar.vue` script add:

```ts
import { useAuth } from '~/composables/useAuth';
const { user, displayName } = useAuth();
```

At the end of `<aside>`:

```html
    <!-- Signed in only: who this is, a shortcut to Account. -->
    <kt-card v-if="user" class="profile" clickable @click="navigateTo('/settings/account')">
      <span class="profile-row">
        <kt-avatar size="small" :name="displayName" />
        <span class="profile-name">{{ displayName }}</span>
      </span>
    </kt-card>
```

Styles:

```css
.profile { margin-top: auto; }
.profile-row { display: flex; align-items: center; gap: var(--gap-element); min-width: 0; }
.profile-name { font: var(--font-normal-medium); color: var(--text-body); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

(If `kt-card clickable` fires `kt-click` rather than `click`, check `node_modules/kanto-ds/dist/docs/kt-card.md` and bind that event.)

- [ ] **Step 7: Verify and commit**

Run: `npm test 2>&1 | tail -5` — Expected: all pass.

```bash
git add app/composables/useAuth.ts app/pages/settings/account.vue app/components/AppSidebar.vue test/composables/useAuth.test.ts
git commit -m "Rebuild Account with a profile, display name and a sidebar shortcut"
```

---

### Task 6: Account — sync details

**Files:**
- Create: `core/db/sync-details.ts`
- Modify: `app/composables/useSync.ts`, `app/pages/settings/account.vue`
- Test: `test/db/sync-details.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // core/db/sync-details.ts
  export interface SyncDetails { pending: number; decks: number; cards: number; reviews: number }
  export function readSyncDetails(): Promise<SyncDetails>;   // live (not soft-deleted) decks and cards; all reviews; outbox size
  // useSync() gains
  details: Readonly<Ref<SyncDetails | null>>;
  refreshDetails(): Promise<void>;                          // never throws; also run after each sync
  ```

- [ ] **Step 1: Write the failing test**

`test/db/sync-details.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { readSyncDetails } from '~core/db/sync-details';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('readSyncDetails', () => {
  it('counts live decks and cards, every review and the outbox', async () => {
    await db.decks.bulkPut([
      { id: 'd1', deletedAt: null } as never,
      { id: 'd2', deletedAt: 5 } as never,
    ]);
    await db.cards.bulkPut([{ id: 'c1', deckId: 'd1', deletedAt: null } as never]);
    await db.reviews.bulkPut([{ id: 'r1', itemId: 'i', reviewedAt: 1 } as never, { id: 'r2', itemId: 'i', reviewedAt: 2 } as never]);
    await db.outbox.put({ id: 'o1', entity: 'card', entityId: 'c1', op: 'put', at: 1 });

    expect(await readSyncDetails()).toEqual({ pending: 1, decks: 1, cards: 1, reviews: 2 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/db/sync-details.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`core/db/sync-details.ts`:

```ts
import { db } from './db';

export interface SyncDetails {
  /** Changes written locally and not yet sent. */
  pending: number;
  decks: number;
  cards: number;
  reviews: number;
}

/** What Account's sync block shows. Soft-deleted decks and cards are not counted. */
export async function readSyncDetails(): Promise<SyncDetails> {
  const [pending, decks, cards, reviews] = await Promise.all([
    db.outbox.count(),
    db.decks.filter((d) => d.deletedAt === null).count(),
    db.cards.filter((c) => c.deletedAt === null).count(),
    db.reviews.count(),
  ]);
  return { pending, decks, cards, reviews };
}
```

In `app/composables/useSync.ts`: import `{ type SyncDetails, readSyncDetails } from '~core/db/sync-details'`; module scope:

```ts
const details = ref<SyncDetails | null>(null);

/** Never throws: Account keeps the last counts it had. */
async function refreshDetails(): Promise<void> {
  try {
    details.value = await readSyncDetails();
  } catch (err) {
    console.error('useSync: could not read sync details', err);
  }
}
```

In `runExclusive`, inside the `.finally(() => {` add `void refreshDetails();` as its first line. Return `details: readonly(details), refreshDetails,` from `useSync()`.

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/db/sync-details.test.ts test/composables/useSync.test.ts` — Expected: PASS.

- [ ] **Step 5: Sync block on Account**

In `account.vue` script:

```ts
import { useSync } from '~/composables/useSync';
import { plural } from '~/utils/format';

const { status, lastSyncedAt, error: syncError, details, syncNow, refreshDetails } = useSync();
onMounted(refreshDetails);

const STATUS: Record<string, { label: string; tone: 'success' | 'info' | 'warning' | 'danger' }> = {
  idle: { label: 'Up to date', tone: 'success' },
  syncing: { label: 'Syncing', tone: 'info' },
  offline: { label: 'Offline', tone: 'warning' },
  error: { label: 'Error', tone: 'danger' },
};
const statusMeta = computed(() => (status.value === 'idle' && (details.value?.pending ?? 0) > 0 ? { label: 'Waiting to sync', tone: 'info' as const } : STATUS[status.value]!));
const lastSyncedLabel = computed(() => (lastSyncedAt.value ? new Date(lastSyncedAt.value).toLocaleString() : 'Not yet on this device'));
```

(Read `plural` in `app/utils/format.ts` for its exact output before using it in copy.)

Replace `<!-- Sync block: Task 6 -->` with:

```html
    <kt-form heading="Sync">
      <div class="sync-head">
        <kt-badge variant="tag" :tone="statusMeta.tone" size="small">{{ statusMeta.label }}</kt-badge>
        <span class="muted">Last synced {{ lastSyncedLabel }}</span>
      </div>
      <div v-if="details" class="sync-stats">
        <kt-stat label="Waiting to send" :value="String(details.pending)" />
        <kt-stat label="Decks" :value="String(details.decks)" />
        <kt-stat label="Cards" :value="String(details.cards)" />
        <kt-stat label="Reviews" :value="String(details.reviews)" />
      </div>
      <kt-alert v-if="status === 'error'" variant="danger" :description="syncError || 'Sync failed. It will retry automatically.'" />
      <kt-alert v-if="status === 'offline'" variant="warning" description="No connection. Changes are saved here and sync once you're back online." />
      <kt-button slot="footer" variant="secondary" size="medium" icon="refresh-cw" :disabled="status === 'syncing'" @click="syncNow">Sync now</kt-button>
    </kt-form>
```

Styles:

```css
.sync-head { display: flex; align-items: center; gap: var(--gap-element); flex-wrap: wrap; }
.muted { color: var(--text-muted); font: var(--font-normal-small); }
.sync-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--gap-element); }
```

(`120px` is a grid track minimum, the same pattern `import.vue`'s `.stats` uses; if the integrity or style review flags it, log to `docs/deferred-minors.md`.)

- [ ] **Step 6: Verify and commit**

Run: `npm test 2>&1 | tail -5` — Expected: all pass.

```bash
git add core/db/sync-details.ts app/composables/useSync.ts app/pages/settings/account.vue test/db/sync-details.test.ts
git commit -m "Show sync status, pending changes and local counts on Account"
```

---

### Task 7: Pure backup format

**Files:**
- Create: `core/backup/format.ts`
- Test: `test/backup/format.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface BackupData { decks: Deck[]; cards: Card[]; items: Item[]; reviews: Review[]; attempts: Attempt[] }
  export interface Backup extends BackupData { format: 'fanka-backup'; version: 1; exportedAt: number; settings: Settings }
  export function buildBackup(data: BackupData, settings: Settings, now: number): Backup;
  export function backupFileName(now: number): string;                     // fanka-backup-YYYY-MM-DD.json, local date
  export type ParsedBackup = { ok: true; backup: Backup } | { ok: false; error: string };
  export function parseBackup(text: string): ParsedBackup;
  export function mergePlan(local: BackupData, backup: BackupData): BackupData;  // rows to write
  ```

- [ ] **Step 1: Write the failing tests**

`test/backup/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { type BackupData, backupFileName, buildBackup, mergePlan, parseBackup } from '~core/backup/format';
import { DEFAULT_SETTINGS } from '~core/db/settings';

const empty = (): BackupData => ({ decks: [], cards: [], items: [], reviews: [], attempts: [] });
const deck = (id: string, updatedAt: number) => ({ id, updatedAt, deletedAt: null }) as never;
const review = (id: string) => ({ id, itemId: 'i', reviewedAt: 1 }) as never;

describe('buildBackup', () => {
  it('stamps the format, version and time', () => {
    const backup = buildBackup(empty(), DEFAULT_SETTINGS, 1000);
    expect(backup).toMatchObject({ format: 'fanka-backup', version: 1, exportedAt: 1000, settings: DEFAULT_SETTINGS, decks: [] });
  });
});

describe('backupFileName', () => {
  it('uses the local date', () => {
    expect(backupFileName(new Date(2026, 9, 3, 23, 30).getTime())).toBe('fanka-backup-2026-10-03.json');
  });
});

describe('parseBackup', () => {
  it('round-trips a built backup', () => {
    const backup = buildBackup({ ...empty(), decks: [deck('d1', 1)] }, DEFAULT_SETTINGS, 5);
    expect(parseBackup(JSON.stringify(backup))).toEqual({ ok: true, backup });
  });

  it('refuses text that is not JSON', () => {
    expect(parseBackup('{"format": "fanka-ba')).toEqual({ ok: false, error: 'This file is not a Fanka backup.' });
  });

  it('refuses JSON that is not a Fanka backup', () => {
    expect(parseBackup('{"hello": 1}')).toEqual({ ok: false, error: 'This file is not a Fanka backup.' });
  });

  it('refuses a backup from a newer version', () => {
    const future = { ...buildBackup(empty(), DEFAULT_SETTINGS, 5), version: 2 };
    expect(parseBackup(JSON.stringify(future))).toEqual({ ok: false, error: 'This backup comes from a newer Fanka. Update the app first.' });
  });

  it('refuses a backup with a missing table or a row without an id', () => {
    const { cards: _cards, ...noCards } = buildBackup(empty(), DEFAULT_SETTINGS, 5);
    expect(parseBackup(JSON.stringify(noCards)).ok).toBe(false);
    const badRow = { ...buildBackup(empty(), DEFAULT_SETTINGS, 5), decks: [{ name: 'x' }] };
    expect(parseBackup(JSON.stringify(badRow))).toEqual({ ok: false, error: 'This backup is damaged.' });
  });
});

describe('mergePlan', () => {
  it('writes rows missing locally and rows newer in the backup', () => {
    const local = { ...empty(), decks: [deck('d1', 10), deck('d2', 10)] };
    const backup = { ...empty(), decks: [deck('d1', 5), deck('d2', 20), deck('d3', 1)] };
    expect(mergePlan(local, backup).decks.map((d) => d.id)).toEqual(['d2', 'd3']);
  });

  it('only adds reviews and attempts whose id is absent', () => {
    const local = { ...empty(), reviews: [review('r1')] };
    const backup = { ...empty(), reviews: [review('r1'), review('r2')] };
    expect(mergePlan(local, backup).reviews.map((r) => r.id)).toEqual(['r2']);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/backup/format.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`core/backup/format.ts`:

```ts
/**
 * The backup file Settings › Data exports and restores. Pure: no Dexie, no
 * file I/O — `core/db/backup.ts` reads and writes the database, and
 * `useBackup` gets the file in and out of the device.
 */
import type { Attempt, Card, Deck, Item, Review } from '~core/db/schema';
import type { Settings } from '~core/db/settings';

export interface BackupData {
  decks: Deck[];
  cards: Card[];
  items: Item[];
  reviews: Review[];
  attempts: Attempt[];
}

export interface Backup extends BackupData {
  format: 'fanka-backup';
  version: 1;
  exportedAt: number;
  settings: Settings;
}

export type ParsedBackup = { ok: true; backup: Backup } | { ok: false; error: string };

const TABLES = ['decks', 'cards', 'items', 'reviews', 'attempts'] as const;
const NOT_A_BACKUP = 'This file is not a Fanka backup.';

export function buildBackup(data: BackupData, settings: Settings, now: number): Backup {
  return { format: 'fanka-backup', version: 1, exportedAt: now, settings, ...data };
}

export function backupFileName(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `fanka-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

/** Checks the shape only as far as a restore needs: the stamp, each table, an id on every row. */
export function parseBackup(text: string): ParsedBackup {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: NOT_A_BACKUP };
  }
  if (typeof value !== 'object' || value === null || (value as { format?: unknown }).format !== 'fanka-backup') {
    return { ok: false, error: NOT_A_BACKUP };
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.version !== 'number' || candidate.version > 1) {
    return { ok: false, error: 'This backup comes from a newer Fanka. Update the app first.' };
  }
  const tablesOk = TABLES.every(
    (table) => Array.isArray(candidate[table]) && (candidate[table] as unknown[]).every((row) => typeof (row as { id?: unknown })?.id === 'string'),
  );
  if (!tablesOk || typeof candidate.settings !== 'object' || candidate.settings === null) {
    return { ok: false, error: 'This backup is damaged.' };
  }
  return { ok: true, backup: candidate as unknown as Backup };
}

function newer<T extends { id: string; updatedAt: number }>(local: T[], incoming: T[]): T[] {
  const byId = new Map(local.map((row) => [row.id, row]));
  return incoming.filter((row) => {
    const existing = byId.get(row.id);
    return !existing || row.updatedAt > existing.updatedAt;
  });
}

function absent<T extends { id: string }>(local: T[], incoming: T[]): T[] {
  const ids = new Set(local.map((row) => row.id));
  return incoming.filter((row) => !ids.has(row.id));
}

/**
 * The rows a restore writes: decks, cards and items when missing here or
 * newer in the backup; reviews and attempts are history, insert-only, added
 * when their id is missing.
 */
export function mergePlan(local: BackupData, backup: BackupData): BackupData {
  return {
    decks: newer(local.decks, backup.decks),
    cards: newer(local.cards, backup.cards),
    items: newer(local.items, backup.items),
    reviews: absent(local.reviews, backup.reviews),
    attempts: absent(local.attempts, backup.attempts),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/backup/format.test.ts` — Expected: PASS. (The "missing table" case returns `This backup is damaged.`)

- [ ] **Step 5: Commit**

```bash
git add core/backup/format.ts test/backup/format.test.ts
git commit -m "Add the pure backup format with parsing and a merge plan"
```

---

### Task 8: Backup I/O and the useBackup composable

**Files:**
- Create: `core/db/backup.ts`, `app/composables/useBackup.ts`
- Test: `test/db/backup.test.ts`

**Interfaces:**
- Consumes: Task 7's `BackupData`, `Backup`, `buildBackup`, `mergePlan`, `parseBackup`, `backupFileName`.
- Produces:
  ```ts
  // core/db/backup.ts
  export function readBackupData(): Promise<BackupData>;
  export interface RestoreResult { decks: number; cards: number; items: number; reviews: number; attempts: number }
  export function applyBackup(backup: Backup, now: number): Promise<RestoreResult>;   // one transaction, outbox for every row, settings replaced
  export function resetDevice(): Promise<void>;   // clears every table except strokes; keeps the seedVersion row
  // app/composables/useBackup.ts
  export function useBackup(): {
    exportBackup(): Promise<void>;                          // throws on failure; page toasts
    readFile(file: File): Promise<ParsedBackup>;
    restore(backup: Backup): Promise<RestoreResult>;        // then reloads the page
    reset(): Promise<void>;                                 // then reloads the page
  };
  ```

- [ ] **Step 1: Write the failing tests**

`test/db/backup.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildBackup } from '~core/backup/format';
import { applyBackup, readBackupData, resetDevice } from '~core/db/backup';
import { db } from '~core/db/db';
import { DEFAULT_SETTINGS, loadSettings } from '~core/db/settings';

const deck = (id: string, updatedAt: number) => ({ id, name: id, updatedAt, deletedAt: null }) as never;

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('backup I/O', () => {
  it('reads every table, soft-deleted rows included', async () => {
    await db.decks.bulkPut([deck('d1', 1), { ...(deck('d2', 1) as object), deletedAt: 9 } as never]);
    expect((await readBackupData()).decks.map((d) => d.id).sort()).toEqual(['d1', 'd2']);
  });

  it('applies only newer rows, queues each for sync and replaces settings', async () => {
    await db.decks.put(deck('d1', 10));
    const backup = buildBackup(
      { decks: [deck('d1', 5), deck('d2', 3)], cards: [], items: [], reviews: [], attempts: [] },
      { ...DEFAULT_SETTINGS, newPerDay: 33 },
      100,
    );
    const result = await applyBackup(backup, 200);
    expect(result.decks).toBe(1);
    expect((await db.decks.get('d1'))?.updatedAt).toBe(10);
    expect(await db.decks.get('d2')).toBeDefined();
    expect((await db.outbox.toArray()).map((o) => `${o.entity}:${o.entityId}`)).toEqual(['deck:d2']);
    expect((await loadSettings()).newPerDay).toBe(33);
  });

  it('resets the device but keeps the seed marker so nothing reseeds', async () => {
    await db.decks.put(deck('d1', 1));
    await db.outbox.put({ id: 'o', entity: 'deck', entityId: 'd1', op: 'put', at: 1 });
    await db.syncState.put({ key: 'lastPulledAt', value: 5 });
    await db.settings.put({ key: 'seedVersion', value: 3 });
    await db.settings.put({ key: 'settings', value: { newPerDay: 1 } });
    await resetDevice();
    expect(await db.decks.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.syncState.count()).toBe(0);
    expect((await db.settings.get('seedVersion'))?.value).toBe(3);
    expect(await db.settings.get('settings')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/db/backup.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement `core/db/backup.ts`**

```ts
import { type Backup, type BackupData, mergePlan } from '~core/backup/format';
import { db } from './db';
import type { OutboxEntry } from './schema';

export interface RestoreResult {
  decks: number;
  cards: number;
  items: number;
  reviews: number;
  attempts: number;
}

/** Every row, soft-deleted ones too, so a restore cannot bring a deleted card back. */
export async function readBackupData(): Promise<BackupData> {
  const [decks, cards, items, reviews, attempts] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray(),
    db.items.toArray(),
    db.reviews.toArray(),
    db.attempts.toArray(),
  ]);
  return { decks, cards, items, reviews, attempts };
}

function queued(entity: OutboxEntry['entity'], ids: string[], at: number): OutboxEntry[] {
  return ids.map((entityId) => ({ id: crypto.randomUUID(), entity, entityId, op: 'put', at }));
}

/** Merges `backup` in one transaction; every row written is queued for sync. Settings are replaced. */
export async function applyBackup(backup: Backup, now: number): Promise<RestoreResult> {
  return db.transaction('rw', [db.decks, db.cards, db.items, db.reviews, db.attempts, db.outbox, db.settings], async () => {
    const plan = mergePlan(await readBackupData(), backup);
    await db.decks.bulkPut(plan.decks);
    await db.cards.bulkPut(plan.cards);
    await db.items.bulkPut(plan.items);
    await db.reviews.bulkPut(plan.reviews);
    await db.attempts.bulkPut(plan.attempts);
    await db.outbox.bulkPut([
      ...queued('deck', plan.decks.map((r) => r.id), now),
      ...queued('card', plan.cards.map((r) => r.id), now),
      ...queued('item', plan.items.map((r) => r.id), now),
      ...queued('review', plan.reviews.map((r) => r.id), now),
      ...queued('attempt', plan.attempts.map((r) => r.id), now),
    ]);
    await db.settings.put({ key: 'settings', value: backup.settings });
    return {
      decks: plan.decks.length,
      cards: plan.cards.length,
      items: plan.items.length,
      reviews: plan.reviews.length,
      attempts: plan.attempts.length,
    };
  });
}

/**
 * Empties this device: collection, history, outbox, sync cursor and
 * settings. The stroke cache stays (it is only a download cache) and so does
 * the seed marker, so the starter deck is not added again.
 */
export async function resetDevice(): Promise<void> {
  const tables = [db.decks, db.cards, db.items, db.reviews, db.attempts, db.outbox, db.syncState, db.settings];
  await db.transaction('rw', tables, async () => {
    const seed = await db.settings.get('seedVersion');
    await Promise.all(tables.map((table) => table.clear()));
    if (seed) await db.settings.put(seed);
  });
}
```

(After Task 12 adds `importMappings`, Task 12 adds it to `resetDevice`'s list.)

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/db/backup.test.ts` — Expected: PASS.

- [ ] **Step 5: Install the Capacitor plugins**

Run: `npm install @capacitor/filesystem@^8 @capacitor/share@^8`
Expected: both added to `dependencies`.

- [ ] **Step 6: Implement `useBackup`**

`app/composables/useBackup.ts`:

```ts
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { type Backup, type ParsedBackup, backupFileName, buildBackup, parseBackup } from '~core/backup/format';
import { type RestoreResult, applyBackup, readBackupData, resetDevice } from '~core/db/backup';
import { loadSettings } from '~core/db/settings';

/** Hands a finished file to the learner: a download in the browser, the share sheet on Android. */
async function deliver(name: string, text: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'Fanka backup', url: uri });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Settings › Data. Restore and reset reload the page afterwards: every
 * module-scope cache (settings, due counts, sync status) is rebuilt from the
 * database that way, with nothing to keep in step by hand.
 */
export function useBackup() {
  async function exportBackup(): Promise<void> {
    const now = Date.now();
    const backup = buildBackup(await readBackupData(), await loadSettings(), now);
    await deliver(backupFileName(now), JSON.stringify(backup));
  }

  async function readFile(file: File): Promise<ParsedBackup> {
    try {
      return parseBackup(await file.text());
    } catch {
      return { ok: false, error: "Couldn't read that file." };
    }
  }

  async function restore(backup: Backup): Promise<RestoreResult> {
    const result = await applyBackup(backup, Date.now());
    window.location.reload();
    return result;
  }

  async function reset(): Promise<void> {
    await resetDevice();
    window.location.reload();
  }

  return { exportBackup, readFile, restore, reset };
}
```

(`document.createElement('a')` is script, not template: the integrity test reads templates only.)

- [ ] **Step 7: Commit**

```bash
git add core/db/backup.ts app/composables/useBackup.ts test/db/backup.test.ts package.json package-lock.json
git commit -m "Read, apply and reset backups through core/db, with web and Android export"
```

---

### Task 9: Data page

**Files:**
- Create: `app/pages/settings/data.vue`
- Modify: `android/` via `npx cap sync android` (plugin registration)

**Interfaces:**
- Consumes: `useBackup()` (Task 8), `useAuth().user`.

- [ ] **Step 1: Write the page**

`app/pages/settings/data.vue`:

```vue
<script setup lang="ts">
import { toaster } from 'kanto-ds';
import type { Backup } from '~core/backup/format';
import { useAuth } from '~/composables/useAuth';
import { useBackup } from '~/composables/useBackup';
import { useCompactLayout } from '~/composables/useCompactLayout';

const { compact } = useCompactLayout();
const { user } = useAuth();
const { exportBackup, readFile, restore, reset } = useBackup();

const exporting = ref(false);
const pending = ref<Backup | null>(null);
const restoreError = ref('');
const confirmRestore = ref(false);
const confirmReset = ref(false);
const dropEl = ref<(HTMLElement & { selectedFiles: readonly File[] }) | null>(null);

async function onExport(): Promise<void> {
  exporting.value = true;
  try {
    await exportBackup();
  } catch (err) {
    console.error('data: export failed', err);
    toaster.error("Couldn't export a backup", { description: 'Try again.' });
  } finally {
    exporting.value = false;
  }
}

async function onFile(): Promise<void> {
  restoreError.value = '';
  pending.value = null;
  const file = dropEl.value?.selectedFiles[0];
  if (!file) return;
  const parsed = await readFile(file);
  if (parsed.ok) pending.value = parsed.backup;
  else restoreError.value = parsed.error;
}

const summary = computed(() => {
  const b = pending.value;
  if (!b) return '';
  return `${b.decks.length} decks, ${b.cards.length} cards and ${b.reviews.length} reviews, exported ${new Date(b.exportedAt).toLocaleString()}.`;
});

async function onConfirmRestore(): Promise<void> {
  confirmRestore.value = false;
  if (!pending.value) return;
  try {
    await restore(pending.value);
  } catch (err) {
    console.error('data: restore failed', err);
    toaster.error("Couldn't restore the backup", { description: 'Nothing was changed. Try again.' });
  }
}

async function onConfirmReset(): Promise<void> {
  confirmReset.value = false;
  try {
    await reset();
  } catch (err) {
    console.error('data: reset failed', err);
    toaster.error("Couldn't reset this device", { description: 'Try again.' });
  }
}
</script>

<template>
  <kt-page-header eyebrow="Settings" heading="Data" description="Back up your collection, restore it, or start this device over.">
    <kt-button v-if="compact" slot="actions" variant="secondary-no-bg" size="medium" icon="chevron-left" @click="navigateTo('/settings')">Settings</kt-button>
  </kt-page-header>

  <kt-form heading="Export" description="Every deck, card, review and setting in one JSON file.">
    <kt-button slot="footer" variant="primary" size="medium" icon="download" :disabled="exporting" @click="onExport">Export backup</kt-button>
  </kt-form>

  <kt-form heading="Restore" description="Adds what the backup has and this device doesn't. Newer changes here are kept.">
    <kt-drag-drop ref="dropEl" accept=".json,application/json" :multiple="false" @kt-files-change="onFile" />
    <kt-alert v-if="restoreError" variant="danger" :description="restoreError" />
    <kt-alert v-if="pending" variant="info" heading="Ready to restore" :description="summary" />
    <kt-button slot="footer" variant="primary" size="medium" :disabled="!pending" @click="confirmRestore = true">Restore</kt-button>
  </kt-form>

  <kt-form heading="Reset this device" :description="user ? 'Clears everything stored here. Your account keeps its copy, and the next sync brings it back.' : 'Clears everything stored here. Without an account or a backup, this cannot be undone.'">
    <kt-button slot="footer" variant="danger" size="medium" @click="confirmReset = true">Reset this device</kt-button>
  </kt-form>

  <kt-confirm-dialog
    :open="confirmRestore"
    heading="Restore this backup?"
    :message="summary"
    confirm-label="Restore"
    variant="primary"
    @kt-confirm="onConfirmRestore"
    @kt-cancel="confirmRestore = false"
  />
  <kt-confirm-dialog
    :open="confirmReset"
    heading="Reset this device?"
    :message="user ? 'Everything here is cleared, then synced back from your account.' : 'Every deck, card and review on this device is deleted.'"
    confirm-label="Reset"
    variant="danger"
    @kt-confirm="onConfirmReset"
    @kt-cancel="confirmReset = false"
  />
</template>
```

- [ ] **Step 2: Verify**

Run: `npm test 2>&1 | tail -5` — Expected: all pass (integrity included).
Run `npm run dev` → `/settings/data`: Export downloads `fanka-backup-<today>.json`; dropping that file shows the summary; Restore reloads with nothing lost; dropping a `.json` that is not a backup shows "This file is not a Fanka backup."

- [ ] **Step 3: Android sync**

Run: `npm run android:sync 2>&1 | tail -5`
Expected: `@capacitor/filesystem` and `@capacitor/share` listed among the found plugins.

- [ ] **Step 4: Commit**

```bash
git add app/pages/settings/data.vue android
git commit -m "Add Settings › Data with export, restore and reset"
```

---

## Phase 3 — Reminders

### Task 10: Weekly multi-time scheduling

**Files:**
- Modify: `core/reminder/schedule.ts`, `core/db/settings.ts`, `app/composables/useReminder.ts`, `app/plugins/reminder.client.ts`, `app/pages/settings/reminders.vue` (binding only)
- Test: `test/reminder/schedule.test.ts` (rewrite), `test/db/settings.test.ts`, `test/composables/useReminder.test.ts` (rewrite)

**Interfaces:**
- Produces:
  ```ts
  // core/reminder/schedule.ts
  export const GENERIC_BODY: string;                       // unchanged
  export function normaliseTimes(times: readonly string[]): string[];   // valid "HH:MM" only, deduped, sorted
  export function nextReminders(now: number, times: readonly string[], days: readonly number[], dueToday: number, doneToday: boolean, horizonDays?: number): Reminder[];
  // nextReminder is removed
  // core/db/settings.ts: Settings loses reminderTime, gains
  reminderTimes: string[];   // default ['19:00']
  reminderDays: number[];    // default [0,1,2,3,4,5,6]
  // app/composables/useReminder.ts
  export const FIRST_REMINDER_ID = 100;
  export const TEST_REMINDER_ID = 99;
  export interface ScheduledNotification { id: number; at: number; title: string; body: string }
  export interface ReminderEngine {
    requestPermission(): Promise<boolean>;
    pending(): Promise<number[]>;
    cancel(ids: number[]): Promise<void>;
    schedule(list: ScheduledNotification[]): Promise<void>;
  }
  useReminder(engine?) → { native, requestPermission, reschedule(now?), sendTest(now?): Promise<boolean> }
  ```

- [ ] **Step 1: Write the failing schedule tests**

Replace `test/reminder/schedule.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GENERIC_BODY, nextReminders, normaliseTimes } from '~core/reminder/schedule';

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
// 2026-09-16 is a Wednesday.

describe('normaliseTimes', () => {
  it('drops invalid times, dedupes and sorts', () => {
    expect(normaliseTimes(['19:00', '7:00', '08:30', '19:00', '24:00'])).toEqual(['08:30', '19:00']);
  });
});

describe('nextReminders', () => {
  it('schedules every time on every allowed day for a week, today first with the count', () => {
    const list = nextReminders(local(2026, 9, 16, 8), ['19:00'], EVERY_DAY, 12, false);
    expect(list).toHaveLength(7);
    expect(list[0]).toEqual({ at: local(2026, 9, 16, 19), body: '12 cards due today' });
    expect(list[1]).toEqual({ at: local(2026, 9, 17, 19), body: GENERIC_BODY });
    expect(list[6]!.at).toBe(local(2026, 9, 22, 19));
  });

  it('skips today when today is done or nothing is due, and past times', () => {
    expect(nextReminders(local(2026, 9, 16, 8), ['19:00'], EVERY_DAY, 5, true)[0]!.at).toBe(local(2026, 9, 17, 19));
    expect(nextReminders(local(2026, 9, 16, 8), ['19:00'], EVERY_DAY, 0, false)[0]!.at).toBe(local(2026, 9, 17, 19));
    expect(nextReminders(local(2026, 9, 16, 19, 0), ['19:00'], EVERY_DAY, 3, false)[0]!.at).toBe(local(2026, 9, 17, 19));
  });

  it('keeps several times a day in order', () => {
    const list = nextReminders(local(2026, 9, 16, 9), ['20:00', '08:00'], EVERY_DAY, 4, false);
    expect(list.slice(0, 3).map((r) => r.at)).toEqual([local(2026, 9, 16, 20), local(2026, 9, 17, 8), local(2026, 9, 17, 20)]);
    expect(list[0]!.body).toBe('4 cards due today');
  });

  it('only uses the allowed days of the week', () => {
    // Weekdays only, from a Friday evening: next is Monday.
    const list = nextReminders(local(2026, 9, 18, 21), ['19:00'], [1, 2, 3, 4, 5], 4, false);
    expect(list[0]!.at).toBe(local(2026, 9, 21, 19));
    expect(list.every((r) => ![0, 6].includes(new Date(r.at).getDay()))).toBe(true);
  });

  it('is empty without a valid time or an allowed day', () => {
    expect(nextReminders(local(2026, 9, 16, 8), ['nope'], EVERY_DAY, 1, false)).toEqual([]);
    expect(nextReminders(local(2026, 9, 16, 8), ['19:00'], [], 1, false)).toEqual([]);
  });

  it('keeps the wall-clock time across a DST change', () => {
    // Europe/Paris-style change on 2026-10-25 when the test zone has one; the local reading must stay 19:00.
    const list = nextReminders(local(2026, 10, 22, 8), ['19:00'], EVERY_DAY, 1, false);
    expect(list.every((r) => new Date(r.at).getHours() === 19 && new Date(r.at).getMinutes() === 0)).toBe(true);
  });

  it('uses the singular for one card', () => {
    expect(nextReminders(local(2026, 9, 16, 8), ['19:00'], EVERY_DAY, 1, false)[0]!.body).toBe('1 card due today');
  });
});
```

- [ ] **Step 2: Write the failing settings migration test**

Append to `test/db/settings.test.ts`:

```ts
  it('migrates a stored single reminder time into the list', async () => {
    await db.settings.put({ key: 'settings', value: { reminderEnabled: true, reminderTime: '07:30' } });
    const loaded = await loadSettings();
    expect(loaded.reminderTimes).toEqual(['07:30']);
    expect(loaded.reminderDays).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(loaded).not.toHaveProperty('reminderTime');
  });

  it('prefers a stored list over a leftover single time', async () => {
    await db.settings.put({ key: 'settings', value: { reminderTime: '07:30', reminderTimes: ['09:00'] } });
    expect((await loadSettings()).reminderTimes).toEqual(['09:00']);
  });
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run test/reminder/schedule.test.ts test/db/settings.test.ts`
Expected: FAIL (`nextReminders` / `normaliseTimes` missing; `reminderTimes` undefined).

- [ ] **Step 4: Implement the schedule**

Replace the body of `core/reminder/schedule.ts` after `occurrence()` and `dueBody()` (keep `Reminder`, `GENERIC_BODY`, `TIME`, `occurrence`, `dueBody`):

```ts
/** Valid "HH:MM" times only, each once, earliest first. */
export function normaliseTimes(times: readonly string[]): string[] {
  return [...new Set(times.filter((t) => TIME.test(t)))].sort();
}

/**
 * Every reminder for the next `horizonDays` calendar days, today included:
 * each time on each allowed weekday (0 = Sunday), strictly after `now`,
 * earliest first. Today's carry the due count, and are left out when today
 * is done or nothing is due; later days carry the generic body, since
 * today's count says nothing about them. Scheduling a week ahead keeps the
 * reminders coming when the app is not opened for a few days.
 */
export function nextReminders(
  now: number,
  times: readonly string[],
  days: readonly number[],
  dueToday: number,
  doneToday: boolean,
  horizonDays = 7,
): Reminder[] {
  const allowed = new Set(days);
  const hasWork = !doneToday && dueToday > 0;
  const list: Reminder[] = [];
  for (let offset = 0; offset < horizonDays; offset += 1) {
    for (const time of normaliseTimes(times)) {
      const [, h, m] = TIME.exec(time)!;
      const at = occurrence(now, offset, Number(h), Number(m));
      if (at <= now || !allowed.has(new Date(at).getDay())) continue;
      if (offset === 0 && !hasWork) continue;
      list.push({ at, body: offset === 0 ? dueBody(dueToday) : GENERIC_BODY });
    }
  }
  return list;
}
```

Delete `nextReminder`.

- [ ] **Step 5: Implement the settings change**

In `core/db/settings.ts` replace the two reminder fields of `Settings`:

```ts
  /** Reminders on the Android app; off until the learner allows notifications. */
  reminderEnabled: boolean;
  /** Local times of the reminders, "HH:MM", 1 to 4, sorted. */
  reminderTimes: string[];
  /** Weekdays the reminders fire, 0 = Sunday … 6 = Saturday. */
  reminderDays: number[];
```

Defaults: replace `reminderTime: '19:00',` with

```ts
  reminderTimes: ['19:00'],
  reminderDays: [0, 1, 2, 3, 4, 5, 6],
```

In `loadSettings`, after the merge loop and before `return merged;`:

```ts
  // Before reminderTimes, a single reminderTime was stored; carry it over once.
  const legacyTime = (stored as { reminderTime?: unknown }).reminderTime;
  if (!('reminderTimes' in stored) && typeof legacyTime === 'string') merged.reminderTimes = [legacyTime];
```

Update the comment above `loadSettings` from "Settings are flat; a nested setting would need a hand-written merge here." to "Settings are flat (arrays of primitives are fine); a nested object would need a hand-written merge here."

- [ ] **Step 6: Run the pure tests**

Run: `npx vitest run test/reminder/schedule.test.ts test/db/settings.test.ts` — Expected: PASS.

- [ ] **Step 7: Write the failing composable tests**

Replace `test/composables/useReminder.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIRST_REMINDER_ID, type ReminderEngine, TEST_REMINDER_ID, useReminder } from '~/composables/useReminder';
import { useDueCounts } from '~/composables/useDueCounts';
import { useSettings } from '~/composables/useSettings';
import { db } from '~core/db/db';

function fakeEngine(granted = true, pendingIds: number[] = []) {
  const calls: string[] = [];
  const engine: ReminderEngine = {
    requestPermission: vi.fn(async () => granted),
    pending: vi.fn(async () => pendingIds),
    cancel: vi.fn(async (ids: number[]) => {
      calls.push(`cancel:${ids.join(',')}`);
    }),
    schedule: vi.fn(async (list) => {
      calls.push(...list.map((n) => `schedule:${n.id}:${n.at}:${n.body}`));
    }),
  };
  return { engine, calls };
}

const NOW = new Date(2026, 8, 16, 8, 0).getTime();

afterEach(async () => {
  await useDueCounts().refresh();
  await vi.waitFor(() => new Promise((resolve) => setTimeout(resolve, 10)));
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('useReminder', () => {
  it('cancels every pending reminder, the legacy id included, and the test one untouched', async () => {
    const { engine, calls } = fakeEngine(true, [1, 99, 100, 101, 127, 200]);
    await useSettings().update({ reminderEnabled: false });
    await useReminder(engine).reschedule(NOW);
    expect(calls).toEqual(['cancel:1,100,101,127']);
  });

  it('schedules a week of reminders from id 100 when on', async () => {
    const { engine, calls } = fakeEngine();
    await useSettings().update({ reminderEnabled: true, reminderTimes: ['19:30'], reminderDays: [0, 1, 2, 3, 4, 5, 6] });
    await useReminder(engine).reschedule(NOW);
    // Due counts are not loaded here, so today reads as done: first is tomorrow.
    const scheduled = calls.filter((c) => c.startsWith('schedule:'));
    expect(scheduled).toHaveLength(6);
    expect(scheduled[0]).toBe(`schedule:${FIRST_REMINDER_ID}:${new Date(2026, 8, 17, 19, 30).getTime()}:Time for today's cards`);
    expect(scheduled[5]!.startsWith(`schedule:${FIRST_REMINDER_ID + 5}:`)).toBe(true);
  });

  it('sends a test notification a second from now', async () => {
    const { engine, calls } = fakeEngine();
    expect(await useReminder(engine).sendTest(NOW)).toBe(true);
    expect(calls).toEqual([`schedule:${TEST_REMINDER_ID}:${NOW + 1000}:Reminders are working`]);
  });

  it('does not send a test without permission', async () => {
    const { engine, calls } = fakeEngine(false);
    expect(await useReminder(engine).sendTest(NOW)).toBe(false);
    expect(calls).toEqual([]);
  });

  it('reports the permission result', async () => {
    expect(await useReminder(fakeEngine(false).engine).requestPermission()).toBe(false);
    expect(await useReminder(fakeEngine(true).engine).requestPermission()).toBe(true);
  });

  it('never throws when the engine fails', async () => {
    const { engine } = fakeEngine();
    engine.pending = vi.fn(async () => {
      throw new Error('boom');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(useReminder(engine).reschedule(NOW)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 8: Run to verify they fail**

Run: `npx vitest run test/composables/useReminder.test.ts` — Expected: FAIL (new exports missing).

- [ ] **Step 9: Implement `useReminder`**

Replace `app/composables/useReminder.ts` from the imports through the end:

```ts
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useDueCounts } from '~/composables/useDueCounts';
import { useSettings } from '~/composables/useSettings';
import { nextReminders } from '~core/reminder/schedule';

/** Scheduled reminders take ids from here up; at most 4 times × 7 days. */
export const FIRST_REMINDER_ID = 100;
const LAST_REMINDER_ID = 199;
/** The single reminder of earlier builds, cancelled so it cannot linger after an update. */
const LEGACY_REMINDER_ID = 1;
export const TEST_REMINDER_ID = 99;

export interface ScheduledNotification {
  id: number;
  at: number;
  title: string;
  body: string;
}

/** The few things the composable needs from a notification engine, so tests can fake it. */
export interface ReminderEngine {
  /** Asks for notification permission; true when granted. */
  requestPermission(): Promise<boolean>;
  /** Ids of every notification still waiting to show. */
  pending(): Promise<number[]>;
  cancel(ids: number[]): Promise<void>;
  schedule(list: ScheduledNotification[]): Promise<void>;
}

const nativeEngine: ReminderEngine = {
  async requestPermission() {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    return (await LocalNotifications.requestPermissions()).display === 'granted';
  },
  async pending() {
    return (await LocalNotifications.getPending()).notifications.map((n) => n.id);
  },
  async cancel(ids) {
    if (ids.length > 0) await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  },
  async schedule(list) {
    if (list.length === 0) return;
    await LocalNotifications.schedule({
      notifications: list.map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: { at: new Date(n.at), allowWhileIdle: false } })),
    });
  },
};

/** Whether this build can show reminders at all; false in the browser. */
export function useNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

function isReminderId(id: number): boolean {
  return id === LEGACY_REMINDER_ID || (id >= FIRST_REMINDER_ID && id <= LAST_REMINDER_ID);
}

/**
 * The reminders. On the web every call is a no-op. `reschedule()` cancels
 * every pending reminder first — so a time or day just removed leaves
 * nothing behind — then schedules the next week when the reminder is on. It
 * never throws, since a notification problem must not break the screen that
 * triggered it.
 */
export function useReminder(engine?: ReminderEngine) {
  const native = engine !== undefined || Capacitor.isNativePlatform();
  const notifier = engine ?? nativeEngine;
  const { settings } = useSettings();
  const { counts } = useDueCounts();

  async function requestPermission(): Promise<boolean> {
    if (!native) return false;
    try {
      return await notifier.requestPermission();
    } catch (err) {
      console.error('useReminder: could not ask for permission', err);
      return false;
    }
  }

  async function reschedule(now = Date.now()): Promise<void> {
    if (!native) return;
    try {
      const stale = (await notifier.pending()).filter(isReminderId);
      await notifier.cancel(stale);
      if (!settings.value.reminderEnabled) return;
      const total = counts.value.review.total + counts.value.writing.total;
      const list = nextReminders(now, settings.value.reminderTimes, settings.value.reminderDays, total, total === 0);
      await notifier.schedule(list.map((r, i) => ({ id: FIRST_REMINDER_ID + i, at: r.at, title: 'Fanka', body: r.body })));
    } catch (err) {
      console.error('useReminder: could not reschedule', err);
    }
  }

  /** A notification a second from now, to check permission and display on this device. */
  async function sendTest(now = Date.now()): Promise<boolean> {
    if (!(await requestPermission())) return false;
    try {
      await notifier.schedule([{ id: TEST_REMINDER_ID, at: now + 1000, title: 'Fanka', body: 'Reminders are working' }]);
      return true;
    } catch (err) {
      console.error('useReminder: could not send the test notification', err);
      return false;
    }
  }

  return { native, requestPermission, reschedule, sendTest };
}
```

In `app/plugins/reminder.client.ts`, change the watched tuple to:

```ts
      () => [
        counts.value.review.total + counts.value.writing.total,
        settings.value.reminderEnabled,
        settings.value.reminderTimes.join(','),
        settings.value.reminderDays.join(','),
      ],
```

In `app/pages/settings/reminders.vue` (stopgap until Task 11), change `useSettingsForm(['reminderEnabled', 'reminderTime'] as const)` to `useSettingsForm(['reminderEnabled', 'reminderTimes'] as const)` and bind the time input to `draft.reminderTimes[0]`, writing `draft.reminderTimes = [e.detail.value]` on change.

- [ ] **Step 10: Run all tests**

Run: `npm test 2>&1 | tail -5` — Expected: all pass. `grep -rn "reminderTime\b\|nextReminder\b\|REMINDER_ID\b" app core test` — Expected: no matches.

- [ ] **Step 11: Commit**

```bash
git add core/reminder/schedule.ts core/db/settings.ts app/composables/useReminder.ts app/plugins/reminder.client.ts app/pages/settings/reminders.vue test/reminder/schedule.test.ts test/db/settings.test.ts test/composables/useReminder.test.ts
git commit -m "Schedule a week of reminders at several times on chosen days"
```

---

### Task 11: Reminders page

**Files:**
- Rewrite: `app/pages/settings/reminders.vue`

**Interfaces:**
- Consumes: `useSettingsForm` (Task 4), `useReminder().sendTest/requestPermission/native` (Task 10), `normaliseTimes` (Task 10).

- [ ] **Step 1: Write the page**

`app/pages/settings/reminders.vue`:

```vue
<script setup lang="ts">
import { toaster } from 'kanto-ds';
import { normaliseTimes } from '~core/reminder/schedule';
import { useCompactLayout } from '~/composables/useCompactLayout';
import { useReminder } from '~/composables/useReminder';
import { useSettingsForm } from '~/composables/useSettingsForm';

const MAX_TIMES = 4;
const SUGGESTED_TIMES = ['08:00', '12:00', '19:00', '21:00'];
// Monday first in the bar; stored as Date#getDay() numbers (0 = Sunday).
const WEEK = [1, 2, 3, 4, 5, 6, 0];
// 2026-10-04 is a Sunday, so day d is 4 + d.
const dayName = (d: number) => new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(2026, 9, 4 + d));

const { compact } = useCompactLayout();
const { draft, ready, saving, save } = useSettingsForm(['reminderEnabled', 'reminderTimes', 'reminderDays'] as const);
const { native, requestPermission, sendTest } = useReminder();
const denied = ref(false);
const daysError = ref('');
const testing = ref(false);

async function onToggle(event: CustomEvent<{ checked: boolean }>): Promise<void> {
  draft.reminderEnabled = event.detail.checked;
  denied.value = false;
  if (event.detail.checked && !(await requestPermission())) {
    draft.reminderEnabled = false;
    denied.value = true;
  }
}

function onDays(event: CustomEvent<{ value: string[] | null }>): void {
  draft.reminderDays = (event.detail.value ?? []).map(Number);
  daysError.value = '';
}

function onTime(index: number, event: CustomEvent<{ value: string | null }>): void {
  if (!event.detail.value) return; // incomplete: keep the last full time
  const next = [...draft.reminderTimes];
  next[index] = event.detail.value;
  draft.reminderTimes = next;
}

function addTime(): void {
  const free = SUGGESTED_TIMES.find((t) => !draft.reminderTimes.includes(t)) ?? '12:00';
  draft.reminderTimes = [...draft.reminderTimes, free];
}

function removeTime(index: number): void {
  draft.reminderTimes = draft.reminderTimes.filter((_, i) => i !== index);
}

async function onTest(): Promise<void> {
  testing.value = true;
  const ok = await sendTest();
  testing.value = false;
  if (ok) toaster.success('Test notification sent');
  else denied.value = true;
}

async function onSave(): Promise<void> {
  if (draft.reminderEnabled && draft.reminderDays.length === 0) {
    daysError.value = 'Choose at least one day.';
    return;
  }
  draft.reminderTimes = normaliseTimes(draft.reminderTimes);
  if (await save()) toaster.success('Settings saved');
  else toaster.error("Couldn't save settings", { description: 'Try again.' });
}
</script>

<template>
  <kt-page-header eyebrow="Settings" heading="Reminders" description="Notifications with how many cards are due.">
    <kt-button v-if="compact" slot="actions" variant="secondary-no-bg" size="medium" icon="chevron-left" @click="navigateTo('/settings')">Settings</kt-button>
  </kt-page-header>

  <kt-empty-state
    v-if="!native"
    icon="bell"
    heading="Reminders need the Android app"
    description="Install Fanka on Android to get notifications with how many cards are due."
  />

  <form v-else novalidate @submit.prevent="onSave">
    <kt-form heading="Schedule" :loading="!ready" loading-fields="3">
      <kt-toggle size="small" :checked="draft.reminderEnabled" @kt-change="onToggle">Remind me to study</kt-toggle>
      <kt-alert
        v-if="denied"
        variant="warning"
        description="Notifications are blocked. Turn them on for Fanka in Android settings, under Apps, then Notifications."
      />
      <template v-if="draft.reminderEnabled">
        <kt-label-input label="Days">
          <kt-toggle-button-group multiple label="Days" :value="draft.reminderDays.map(String)" @kt-change="onDays">
            <kt-toggle-button v-for="d in WEEK" :key="d" variant="outline" :value="String(d)">{{ dayName(d) }}</kt-toggle-button>
          </kt-toggle-button-group>
        </kt-label-input>
        <kt-alert v-if="daysError" variant="danger" :description="daysError" />

        <div class="times">
          <div v-for="(time, index) in draft.reminderTimes" :key="index" class="time-row">
            <kt-time-input :label="`Time ${index + 1}`" :value="time" @kt-change="onTime(index, $event)" />
            <kt-button
              variant="secondary-no-bg"
              size="medium"
              icon="x"
              :label="`Remove time ${index + 1}`"
              :disabled="draft.reminderTimes.length === 1"
              @click="removeTime(index)"
            />
          </div>
          <kt-button variant="secondary" size="medium" icon="plus" :disabled="draft.reminderTimes.length >= MAX_TIMES" @click="addTime">Add time</kt-button>
        </div>
      </template>
      <kt-button slot="footer" variant="secondary" size="medium" icon="send" :disabled="testing" @click="onTest">Send test notification</kt-button>
      <kt-button slot="footer" type="submit" variant="primary" size="medium" :disabled="saving || !ready">Save</kt-button>
    </kt-form>
  </form>
</template>

<style scoped>
form { display: flex; flex-direction: column; }
.times { display: flex; flex-direction: column; gap: var(--gap-element); align-items: flex-start; }
.time-row { display: flex; align-items: flex-end; gap: var(--gap-element); }
</style>
```

(If `kt-toggle-button-group`'s `value` is not set from a Vue binding, it is a property-only field (`attribute: —`); Vue sets it as a property because the element defines it — check in the browser that the saved days show selected on reload.)

- [ ] **Step 2: Verify**

Run: `npm test 2>&1 | tail -5` — Expected: all pass.
Run `npm run dev` → `/settings/reminders` in a browser: the empty state. Then `npm run android` with a device: toggle on, untick Saturday and Sunday, add 08:00, Save; Send test notification → a notification within seconds.

- [ ] **Step 3: Commit**

```bash
git add app/pages/settings/reminders.vue
git commit -m "Rebuild Reminders with days of the week, several times and a test notification"
```

---

## Phase 4 — Import

### Task 12: Remembered mappings

**Files:**
- Modify: `core/import/mapping.ts` (add `headerSignature`)
- Modify: `core/db/db.ts` (version 4), `core/db/backup.ts` (`resetDevice` clears the table)
- Create: `core/db/import-mappings.ts`
- Modify: `app/composables/useImport.ts` (`load` async, `setMapping` async, `mappingRemembered`)
- Modify: `app/pages/import.vue` (await `load` / `setMapping`; note in step 2)
- Test: `test/import/mapping.test.ts`, `test/db/import-mappings.test.ts`, `test/composables/useImport.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // core/import/mapping.ts
  export function headerSignature(header: readonly string[]): string;
  // core/db/import-mappings.ts
  export interface ImportMappingRow { signature: string; columns: Target[]; updatedAt: number }
  export function findImportMapping(signature: string): Promise<Target[] | null>;
  export function saveImportMapping(signature: string, columns: readonly Target[], now: number): Promise<void>;
  // useImport()
  load(text: string): Promise<void>;          // was sync; still throws on no data rows
  setMapping(m: Mapping): Promise<void>;      // was sync; saves when m.hasHeader, never throws on save failure
  mappingRemembered: Ref<boolean>;
  ```

- [ ] **Step 1: Write the failing tests**

Append to `test/import/mapping.test.ts`:

```ts
describe('headerSignature', () => {
  it('ignores case and surrounding spaces', () => {
    expect(headerSignature([' Front', 'BACK '])).toBe(headerSignature(['front', 'back']));
  });
  it('tells different headers apart, including their order', () => {
    expect(headerSignature(['front', 'back'])).not.toBe(headerSignature(['back', 'front']));
    expect(headerSignature(['a b'])).not.toBe(headerSignature(['a', 'b']));
  });
});
```

(add `headerSignature` to the file's import.)

`test/db/import-mappings.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { findImportMapping, saveImportMapping } from '~core/db/import-mappings';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('import mappings', () => {
  it('returns null for an unknown signature and the columns once saved', async () => {
    expect(await findImportMapping('x')).toBeNull();
    await saveImportMapping('x', ['hanzi', 'ignore', 'translation'], 1);
    expect(await findImportMapping('x')).toEqual(['hanzi', 'ignore', 'translation']);
  });
});
```

Append to `test/composables/useImport.test.ts` (read its setup first — it already resets the DB and builds a deck; reuse its helpers):

```ts
describe('remembered mapping', () => {
  it('reuses the mapping saved for the same headers', async () => {
    const first = useImport();
    await first.load('Front,Back,Sound\n朋友,friend,peng2 you5');
    await first.setMapping({ columns: ['hanzi', 'translation', 'pinyin'], hasHeader: true });

    const second = useImport();
    await second.load('front,back,sound\n老師,teacher,lao3 shi1');
    expect(second.mapping.value).toEqual({ columns: ['hanzi', 'translation', 'pinyin'], hasHeader: true });
    expect(second.mappingRemembered.value).toBe(true);
  });

  it('ignores a saved mapping with a different column count', async () => {
    const first = useImport();
    await first.load('Front,Back\n朋友,friend');
    await first.setMapping({ columns: ['hanzi', 'translation'], hasHeader: true });
    const second = useImport();
    await second.load('Front,Back,Extra\n朋友,friend,x');
    expect(second.mappingRemembered.value).toBe(false);
  });
});
```

Update every existing `load(` call in `test/composables/useImport.test.ts` to `await …load(` (and `setMapping(` to `await …setMapping(`), making the enclosing test `async` where needed.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/import/mapping.test.ts test/db/import-mappings.test.ts test/composables/useImport.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `core/import/mapping.ts`:

```ts
/**
 * What identifies "the same kind of file" for a remembered mapping: its
 * header cells, trimmed and lower-cased, in order. U+001F (unit separator)
 * joins them, since no header cell contains it.
 */
export function headerSignature(header: readonly string[]): string {
  return header.map((cell) => cell.trim().toLowerCase()).join('\u001f');
}
```

`core/db/db.ts`: import `type { Target } from '~core/import/mapping'`, add

```ts
/** A column mapping the learner confirmed, kept for the next file with the same header. Local only, never synced. */
export interface ImportMappingRow {
  signature: string;
  columns: Target[];
  updatedAt: number;
}
```

the table field `importMappings!: Table<ImportMappingRow, string>;`, and after version 3:

```ts
    // Additive: remembered import mappings, local to this device.
    this.version(4).stores({ importMappings: 'signature' });
```

`core/db/import-mappings.ts`:

```ts
import type { Target } from '~core/import/mapping';
import { db } from './db';

export type { ImportMappingRow } from './db';

export async function findImportMapping(signature: string): Promise<Target[] | null> {
  return (await db.importMappings.get(signature))?.columns ?? null;
}

/** `columns` may be a reactive array; it is copied so IndexedDB can clone it. */
export async function saveImportMapping(signature: string, columns: readonly Target[], now: number): Promise<void> {
  await db.importMappings.put({ signature, columns: [...columns], updatedAt: now });
}
```

(Move the `ImportMappingRow` interface into this file instead if `core/db/db.ts` importing from `core/import` creates a cycle; `db.ts` then imports the type from here.)

`core/db/backup.ts` `resetDevice`: add `db.importMappings` to `tables`.

`app/composables/useImport.ts`:
- imports: `headerSignature` from `~core/import/mapping`; `findImportMapping, saveImportMapping` from `~core/db/import-mappings`.
- add `const mappingRemembered = ref(false);`
- replace `load` and `setMapping`:

```ts
  /**
   * Detects the delimiter, parses `text` into `rows`, and picks a mapping:
   * the one saved for this header when its column count still fits,
   * otherwise a guess. Throws (and touches neither `rows` nor `mapping`) on
   * fewer than one data row — the caller shows that inline (ruling 4).
   */
  async function load(text: string): Promise<void> {
    const delimiter: Delimiter = detectDelimiter(text);
    const parsed = parseDelimited(text, delimiter);
    const guessed = guessMapping(parsed);
    const saved = parsed[0] ? await findImportMapping(headerSignature(parsed[0])).catch(() => null) : null;
    const remembered = saved !== null && saved.length === parsed[0]!.length;
    const chosen: Mapping = remembered ? { columns: saved, hasHeader: true } : guessed;
    const dataRowCount = chosen.hasHeader ? parsed.length - 1 : parsed.length;
    if (dataRowCount < 1) {
      throw new Error('No data rows found in that source.');
    }
    rows.value = parsed;
    mapping.value = chosen;
    mappingRemembered.value = remembered;
    results.value = [];
  }

  /** Sets the mapping step 3 verifies, and remembers it for this header. A failed save is logged, never thrown. */
  async function setMapping(m: Mapping): Promise<void> {
    mapping.value = m;
    const header = rows.value[0];
    if (!m.hasHeader || !header) return;
    try {
      await saveImportMapping(headerSignature(header), m.columns, Date.now());
    } catch (err) {
      console.error('useImport: could not remember the mapping', err);
    }
  }
```

- return `mappingRemembered`.

`app/pages/import.vue`:
- in `onContinueFromStep1`: `load(text);` → `await load(text);` (still inside the try).
- in `onContinueFromStep2`: `setMapping(built);` → `await setMapping(built);`.
- destructure `mappingRemembered` from `useImport()`; at the top of the step 2 section:

```html
      <kt-alert v-if="mappingRemembered" variant="info" description="Mapping from your last import with these columns." />
```

- [ ] **Step 4: Run the tests**

Run: `npm test 2>&1 | tail -5` — Expected: all pass (`test/db/migration-v3.test.ts` too; if it asserts `db.verno === 3`, update it to 4).

- [ ] **Step 5: Commit**

```bash
git add core/import/mapping.ts core/db/db.ts core/db/import-mappings.ts core/db/backup.ts app/composables/useImport.ts app/pages/import.vue test/import/mapping.test.ts test/db/import-mappings.test.ts test/composables/useImport.test.ts test/db
git commit -m "Remember import column mappings per header"
```

---

### Task 13: Import rows — duplicates and updates (pure)

**Files:**
- Create: `core/import/rows.ts`
- Test: `test/import/rows.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DuplicatePolicy = 'skip' | 'update';
  export interface ImportRow extends Validated { duplicate: boolean }   // ok and already in the deck
  export const REPEATED_MESSAGE = 'Repeated earlier in this file';
  export function validateImportRows(drafts: readonly CardDraft[], deckHanzi: ReadonlySet<string>): ImportRow[];
  export function normalisePinyinText(text: string): string;          // moved from useImport
  export function updatedCardFromDraft(card: Card, draft: CardDraft, now: number): Card;
  ```

- [ ] **Step 1: Write the failing tests**

`test/import/rows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Card } from '~core/db/schema';
import { REPEATED_MESSAGE, updatedCardFromDraft, validateImportRows } from '~core/import/rows';
import type { CardDraft } from '~core/import/validate';

const draft = (overrides: Partial<CardDraft> = {}): CardDraft => ({ hanzi: '朋友', pinyin: 'peng2 you5', translation: 'friend', ...overrides });

describe('validateImportRows', () => {
  it('marks a row already in the deck as a duplicate, not an error', () => {
    const [row] = validateImportRows([draft()], new Set(['朋友']));
    expect(row).toMatchObject({ ok: true, duplicate: true });
    expect(row!.issues.some((i) => i.severity === 'error')).toBe(false);
  });

  it('makes the second of two identical hanzi in the file an error', () => {
    const rows = validateImportRows([draft(), draft({ translation: 'pal' })], new Set(['朋友']));
    expect(rows[0]).toMatchObject({ ok: true, duplicate: true });
    expect(rows[1]).toMatchObject({ ok: false, duplicate: false });
    expect(rows[1]!.issues).toContainEqual({ field: 'hanzi', severity: 'error', message: REPEATED_MESSAGE });
  });

  it('lets a later row through when the earlier one with that hanzi had an error', () => {
    const rows = validateImportRows([draft({ translation: '' }), draft()], new Set());
    expect(rows[0]!.ok).toBe(false);
    expect(rows[1]!.ok).toBe(true);
  });

  it('keeps every other validation, such as simplified characters', () => {
    const [row] = validateImportRows([draft({ hanzi: '学习', pinyin: 'xue2 xi2' })], new Set());
    expect(row!.ok).toBe(false);
  });
});

describe('updatedCardFromDraft', () => {
  const card = {
    id: 'c1', deckId: 'd1', hanzi: '朋友', pinyin: [], zhuyin: 'ㄆㄥˊ', translation: 'old', pos: 'noun',
    example: '他是我的朋友。', examplePinyin: 'tā shì wǒ de péngyou', exampleTranslation: 'He is my friend.',
    tags: ['hsk1'], note: 'mine', createdAt: 1, updatedAt: 1, deletedAt: null,
  } as unknown as Card;

  it('overwrites content and updatedAt, keeping identity, note and creation', () => {
    const next = updatedCardFromDraft(card, draft({ translation: 'friend', tags: ['core'] }), 50);
    expect(next).toMatchObject({ id: 'c1', deckId: 'd1', hanzi: '朋友', translation: 'friend', tags: ['core'], note: 'mine', createdAt: 1, updatedAt: 50 });
    expect(next.pinyin.map((s) => s.text).join(' ')).toBe('péng you');
  });

  it('keeps example fields and tags the file did not map', () => {
    const next = updatedCardFromDraft(card, draft(), 50);
    expect(next.example).toBe('他是我的朋友。');
    expect(next.exampleTranslation).toBe('He is my friend.');
    expect(next.tags).toEqual(['hsk1']);
  });
});
```

(Check `parsePinyin('peng2 you5')`'s text output in `test/chinese/pinyin.test.ts` and adjust the expected `'péng you'` to whatever it produces.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/import/rows.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`core/import/rows.ts`:

```ts
/**
 * Import-only rules on top of `validateCard`: a card already in the deck is
 * a duplicate the learner chooses to skip or update, not an error; the same
 * hanzi twice in one file is an error, so two rows never fight over one
 * card. Pure: no Vue, Dexie or Capacitor.
 */
import { parsePinyin } from '~core/chinese/pinyin';
import { toZhuyin } from '~core/chinese/zhuyin';
import type { Card } from '~core/db/schema';
import { type CardDraft, type Validated, validateCard } from '~core/import/validate';

export type DuplicatePolicy = 'skip' | 'update';

export interface ImportRow extends Validated {
  /** Valid, and its hanzi is already a live card in the destination deck. */
  duplicate: boolean;
}

export const REPEATED_MESSAGE = 'Repeated earlier in this file';

const NONE: ReadonlySet<string> = new Set();

export function validateImportRows(drafts: readonly CardDraft[], deckHanzi: ReadonlySet<string>): ImportRow[] {
  const seen = new Set<string>();
  return drafts.map((draft) => {
    const validated = validateCard(draft, NONE);
    const hanzi = validated.draft.hanzi;
    const issues = [...validated.issues];
    if (hanzi && seen.has(hanzi)) issues.push({ field: 'hanzi', severity: 'error', message: REPEATED_MESSAGE });
    const ok = issues.every((issue) => issue.severity !== 'error');
    if (ok) seen.add(hanzi);
    return { draft: validated.draft, issues, ok, duplicate: ok && deckHanzi.has(hanzi) };
  });
}

/** A pinyin string (numbered or diacritic) in the joined diacritic form the schema stores — same conversion useCardEditor.ts applies. */
export function normalisePinyinText(text: string): string {
  return parsePinyin(text)
    .map((s) => s.text)
    .join(' ');
}

/**
 * The card after an import row updates it. Items and reviews are separate
 * rows and stay as they are, so progress is kept. A field the file did not
 * map (undefined in the draft) keeps the card's value; a mapped field
 * replaces it, even when empty.
 */
export function updatedCardFromDraft(card: Card, draft: CardDraft, now: number): Card {
  const pinyin = parsePinyin(draft.pinyin);
  return {
    ...card,
    pinyin,
    zhuyin: draft.zhuyin && draft.zhuyin.length > 0 ? draft.zhuyin : toZhuyin(pinyin),
    translation: draft.translation,
    example: draft.example ?? card.example,
    examplePinyin: draft.examplePinyin === undefined ? card.examplePinyin : normalisePinyinText(draft.examplePinyin),
    exampleTranslation: draft.exampleTranslation ?? card.exampleTranslation,
    tags: draft.tags === undefined ? card.tags : [...draft.tags],
    updatedAt: now,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/import/rows.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/import/rows.ts test/import/rows.test.ts
git commit -m "Add import row rules for duplicates, repeats and card updates"
```

---

### Task 14: useImport — duplicate policy and fixing a row

**Files:**
- Modify: `app/composables/useImport.ts`
- Test: `test/composables/useImport.test.ts`

**Interfaces:**
- Consumes: Task 13's `validateImportRows`, `ImportRow`, `DuplicatePolicy`, `updatedCardFromDraft`, `normalisePinyinText`.
- Produces (changes to `useImport()`):
  ```ts
  results: Ref<ImportRow[]>;                         // was Validated[]
  counts: ComputedRef<{ valid: number; warnings: number; errors: number; duplicates: number }>;
  // valid = ok && !duplicate; warnings = ok && has warning; errors = !ok; duplicates = ok && duplicate
  duplicatePolicy: Ref<DuplicatePolicy>;             // default 'skip'
  fixRow(index: number, draft: CardDraft): void;     // re-validates every row with that draft replaced
  commit(): Promise<{ created: number; updated: number; skipped: number }>;
  ```

- [ ] **Step 1: Write the failing tests**

In `test/composables/useImport.test.ts`, replace the existing duplicate assertion (line ~176, `toContainEqual({ field: 'hanzi', severity: 'error', message: 'Already in this deck' })`) with `expect(duplicateRow).toMatchObject({ ok: true, duplicate: true });`, then add (using the file's existing deck/card fixture helpers — read them first):

```ts
describe('duplicates', () => {
  it('skips cards already in the deck by default', async () => {
    // deck d1 already holds 朋友 (use the file's helper to create it)
    const imp = useImport();
    imp.targetDeckId.value = deckId;
    await imp.load('hanzi,pinyin,translation\n朋友,peng2 you5,pal\n老師,lao3 shi1,teacher');
    await imp.verify();
    expect(imp.counts.value).toEqual({ valid: 1, warnings: 0, errors: 0, duplicates: 1 });
    expect(await imp.commit()).toEqual({ created: 1, updated: 0, skipped: 1 });
  });

  it('updates their content and keeps their items with Update', async () => {
    const imp = useImport();
    imp.targetDeckId.value = deckId;
    await imp.load('hanzi,pinyin,translation\n朋友,peng2 you5,pal');
    await imp.verify();
    imp.duplicatePolicy.value = 'update';
    const itemsBefore = await db.items.where('cardId').equals(existingCardId).toArray();
    expect(await imp.commit()).toEqual({ created: 0, updated: 1, skipped: 0 });
    expect((await db.cards.get(existingCardId))?.translation).toBe('pal');
    expect(await db.items.where('cardId').equals(existingCardId).toArray()).toEqual(itemsBefore);
    expect((await db.outbox.toArray()).some((o) => o.entity === 'card' && o.entityId === existingCardId)).toBe(true);
  });
});

describe('fixRow', () => {
  it('re-validates the edited row in place', async () => {
    const imp = useImport();
    imp.targetDeckId.value = deckId;
    await imp.load('hanzi,pinyin,translation\n老師,lao3 shi1,\n學生,xue2 sheng1,student');
    await imp.verify();
    expect(imp.results.value[0]!.ok).toBe(false);
    imp.fixRow(0, { hanzi: '老師', pinyin: 'lao3 shi1', translation: 'teacher' });
    expect(imp.results.value[0]!.ok).toBe(true);
    expect(imp.results.value[1]!.draft.hanzi).toBe('學生');
    expect(imp.counts.value.valid).toBe(2);
  });
});
```

(`deckId` / `existingCardId` stand for whatever the file's setup creates; if it has no such helper, create the deck with `decks.create` and a card with `cards.create` from `~core/db/repositories` in a `beforeEach` — read their signatures in `core/db/repositories.ts`.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/composables/useImport.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**

In `app/composables/useImport.ts`:

- imports: drop `validateCard` and `Validated`; add
  ```ts
  import { type DuplicatePolicy, type ImportRow, normalisePinyinText, updatedCardFromDraft, validateImportRows } from '~core/import/rows';
  ```
  Delete the local `normalisePinyinText` and `DUPLICATE_MESSAGE`.
- `ImportCounts` gains `duplicates: number;`.
- Replace `commitBatch` with:

```ts
/**
 * One batch, one Dexie transaction, outbox entries included. The deck's live
 * cards are read fresh inside this transaction — not carried over from
 * `verify()` — so a card created by an earlier batch, or by anything else,
 * is always seen (ruling 2). A hanzi already present is skipped or updated
 * per `policy`; updating rewrites the card only, so its items keep their
 * progress.
 */
async function commitBatch(
  deckId: string,
  batch: ImportRow[],
  policy: DuplicatePolicy,
  now: number,
): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  await db.transaction('rw', db.cards, db.items, db.outbox, async () => {
    const deckCards = await db.cards.where('deckId').equals(deckId).toArray();
    const byHanzi = new Map(deckCards.filter((c) => c.deletedAt === null).map((c) => [c.hanzi, c]));

    for (const row of batch) {
      const draft = row.draft;
      const existing = byHanzi.get(draft.hanzi);
      if (existing) {
        if (policy === 'skip') {
          skipped += 1;
          continue;
        }
        const next = updatedCardFromDraft(existing, draft, now);
        await db.cards.put(next);
        await db.outbox.put(outboxEntry('card', next.id, 'put', now));
        byHanzi.set(next.hanzi, next);
        updated += 1;
        continue;
      }
      // …the existing creation code, unchanged from `const pinyin = parsePinyin(draft.pinyin);`
      // through `created += 1;`, then:
      byHanzi.set(card.hanzi, card);
    }
  });

  return { created, updated, skipped };
}
```

(Keep the creation block verbatim; only replace `existingHanzi.add(draft.hanzi)` with the `byHanzi.set` after the card is built.)

- Inside `useImport()`:

```ts
  const results = ref<ImportRow[]>([]);
  const duplicatePolicy = ref<DuplicatePolicy>('skip');
  /** The drafts and deck hanzi the current results were built from, so one row can be fixed and everything re-checked. */
  let drafts: CardDraft[] = [];
  let deckHanzi: ReadonlySet<string> = new Set();
```

- `counts`:

```ts
  const counts = computed<ImportCounts>(() => {
    let valid = 0;
    let warnings = 0;
    let errors = 0;
    let duplicates = 0;
    for (const row of results.value) {
      if (!row.ok) {
        errors += 1;
        continue;
      }
      if (row.duplicate) duplicates += 1;
      else valid += 1;
      if (row.issues.some((issue) => issue.severity === 'warning')) warnings += 1;
    }
    return { valid, warnings, errors, duplicates };
  });
```

- `verify`:

```ts
  async function verify(): Promise<void> {
    if (!mapping.value || !targetDeckId.value) {
      results.value = [];
      return;
    }
    drafts = applyMapping(rows.value, mapping.value);
    deckHanzi = new Set((await cards.forDeck(targetDeckId.value)).map((c) => c.hanzi));
    results.value = validateImportRows(drafts, deckHanzi);
  }

  /** Step 3's side panel: replaces one row's draft and re-checks every row, so a fix that clashes with another row is caught. */
  function fixRow(index: number, draft: CardDraft): void {
    drafts = drafts.map((d, i) => (i === index ? draft : d));
    results.value = validateImportRows(drafts, deckHanzi);
  }
```

- `commit`:

```ts
  async function commit(): Promise<{ created: number; updated: number; skipped: number }> {
    const deckId = targetDeckId.value;
    if (!deckId) throw new Error('No destination deck selected.');

    const validRows = results.value.filter((row) => row.ok);
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      try {
        const result = await commitBatch(deckId, batch, duplicatePolicy.value, Date.now());
        created += result.created;
        updated += result.updated;
        skipped += result.skipped;
      } catch (err) {
        if (created > 0) await refreshDueCounts();
        throw new ImportCommitError(created, err);
      }
    }

    await refreshDueCounts();
    return { created, updated, skipped };
  }
```

Update its doc comment: "`skipped` counts duplicates left alone under Skip; rows with an error are never counted — the page already shows them as errors."

- Return `duplicatePolicy` and `fixRow`.

- [ ] **Step 4: Run the tests**

Run: `npm test 2>&1 | tail -5` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useImport.ts test/composables/useImport.test.ts
git commit -m "Let Import skip or update cards already in the deck and fix a row in place"
```

---

### Task 15: Import page — steps, duplicates, side panel

**Files:**
- Modify: `app/pages/import.vue`

**Interfaces:**
- Consumes: `useImport()`'s `duplicatePolicy`, `fixRow`, `counts.duplicates`, `results: ImportRow[]`, `commit()` → `{ created, updated, skipped }`.

- [ ] **Step 1: Steps instead of the progress bar**

Script:

```ts
import type { KtStep } from 'kanto-ds';

const STEPS: KtStep[] = [
  { id: 'source', label: 'Source' },
  { id: 'mapping', label: 'Field mapping' },
  { id: 'review', label: 'Review' },
];
const STEP_IDS = ['source', 'mapping', 'review'] as const;
const currentStepId = computed(() => STEP_IDS[step.value - 1]);

/** `navigable` only offers completed steps, so this only ever goes back. */
function onStepChange(event: CustomEvent<{ id: string }>): void {
  const index = STEP_IDS.indexOf(event.detail.id as (typeof STEP_IDS)[number]);
  if (index >= 0) step.value = (index + 1) as 1 | 2 | 3;
}
```

Template: replace the `kt-progress-bar` and the comment above it with

```html
    <kt-steps label="Import steps" :steps="STEPS" :current="currentStepId" navigable @kt-change="onStepChange" />
```

Keep `stepDescription` in the page header (the e2e specs read it).

- [ ] **Step 2: Duplicates in step 3**

Script:

```ts
import type { DuplicatePolicy } from '~core/import/rows';

const DUPLICATE_OPTIONS: KtSegmentedOption[] = [
  { value: 'skip', label: 'Skip' },
  { value: 'update', label: 'Update' },
];
function onDuplicatePolicy(event: CustomEvent<{ value: string | number }>): void {
  duplicatePolicy.value = event.detail.value === 'update' ? 'update' : 'skip';
}
const canImport = computed(() => counts.value.valid > 0 || (counts.value.duplicates > 0 && duplicatePolicy.value === 'update'));
```

(destructure `duplicatePolicy`, `fixRow` from `useImport()`.)

`PreviewStatus` becomes `'valid' | 'warning' | 'error' | 'duplicate'`; `statusFor(row: ImportRow)`:

```ts
function statusFor(row: ImportRow): PreviewStatus {
  if (!row.ok) return 'error';
  if (row.duplicate) return 'duplicate';
  return row.issues.some((issue) => issue.severity === 'warning') ? 'warning' : 'valid';
}
```

`STATUS_META` gains `duplicate: { label: 'In deck', tone: 'info' }` (widen the tone union with `'info'`). Change the `Validated` import to `import type { ImportRow } from '~core/import/rows';`.

In the step-3 `.stats` add `<kt-stat label="Already in deck" :value="String(counts.duplicates)" />`. Below the stats:

```html
      <kt-label-input v-if="counts.duplicates > 0" label="Cards already in the deck">
        <kt-segmented-control label="Cards already in the deck" :options="DUPLICATE_OPTIONS" :value="duplicatePolicy" @kt-change="onDuplicatePolicy" />
      </kt-label-input>
```

Import button: `:disabled="!canImport || importing"`.

`onImport` toast:

```ts
    const { created, updated, skipped } = await commit();
    const parts = [
      updated > 0 ? `${updated} updated` : '',
      skipped > 0 ? `${skipped} already in the deck skipped` : '',
    ].filter(Boolean);
    toaster.success(`Imported ${created} card${created === 1 ? '' : 's'}`, parts.length > 0 ? { description: parts.join(', ') } : undefined);
```

- [ ] **Step 3: Fix a row in a side panel**

Script:

```ts
import type { CardDraft } from '~core/import/validate';

const editingIndex = ref<number | null>(null);
const editDraft = reactive<CardDraft>({ hanzi: '', pinyin: '', translation: '', example: '', examplePinyin: '', exampleTranslation: '' });
const EDIT_FIELDS: { key: keyof Omit<CardDraft, 'tags' | 'zhuyin'>; label: string }[] = [
  { key: 'hanzi', label: 'Hanzi' },
  { key: 'pinyin', label: 'Pinyin' },
  { key: 'translation', label: 'Translation' },
  { key: 'example', label: 'Example' },
  { key: 'examplePinyin', label: 'Example pinyin' },
  { key: 'exampleTranslation', label: 'Example translation' },
];
const editingIssues = computed(() => (editingIndex.value === null ? '' : results.value[editingIndex.value]?.issues.map((i) => i.message).join('; ') ?? ''));

/** Only rows with something to fix open the panel. */
function onRowClick(event: CustomEvent<{ row: KtTableRow }>): void {
  const index = Number((event.detail.row as unknown as PreviewRow).id);
  const row = results.value[index];
  if (!row || (row.ok && row.issues.length === 0)) return;
  Object.assign(editDraft, { example: '', examplePinyin: '', exampleTranslation: '', ...row.draft });
  editingIndex.value = index;
}

function onFixSave(): void {
  if (editingIndex.value === null) return;
  const original = results.value[editingIndex.value]!.draft;
  // A field the file did not map stays unmapped unless the learner typed something.
  const optional = (key: 'example' | 'examplePinyin' | 'exampleTranslation') =>
    original[key] === undefined && !editDraft[key] ? undefined : editDraft[key];
  fixRow(editingIndex.value, {
    ...original,
    hanzi: editDraft.hanzi,
    pinyin: editDraft.pinyin,
    translation: editDraft.translation,
    example: optional('example'),
    examplePinyin: optional('examplePinyin'),
    exampleTranslation: optional('exampleTranslation'),
  });
  editingIndex.value = null;
}
```

Table: add `@kt-row-click="onRowClick"` to `kt-table`. After the step-3 section (before `DeckFormModal`):

```html
    <kt-side-panel :open="editingIndex !== null" eyebrow="Fix row" :heading="editDraft.hanzi || 'Row'" @kt-close="editingIndex = null">
      <form class="fix-form" novalidate @submit.prevent="onFixSave">
        <kt-alert v-if="editingIssues" variant="warning" :description="editingIssues" />
        <kt-label-input v-for="field in EDIT_FIELDS" :key="field.key" :label="field.label">
          <kt-input :value="editDraft[field.key] ?? ''" @kt-input="(e: CustomEvent<{ value: string }>) => (editDraft[field.key] = e.detail.value)" />
        </kt-label-input>
      </form>
      <kt-button slot="footer" variant="primary" size="medium" @click="onFixSave">Check row</kt-button>
    </kt-side-panel>
```

Style: `.fix-form { display: flex; flex-direction: column; gap: var(--gap-element); }`.

- [ ] **Step 4: Verify**

Run: `npm test 2>&1 | tail -5` — Expected: all pass (integrity: no native elements added; `form` is not watched).
Run `npm run dev` → Import into a deck that holds 朋友 a CSV with `朋友,peng2 you5,pal` and `老師,lao3 shi1,` : step 3 shows Already in deck 1, Errors 1; click the 老師 row, type "teacher", Check row → Valid 1; choose Update, Import → toast "Imported 1 card" with "1 updated" as its description.

- [ ] **Step 5: Commit**

```bash
git add app/pages/import.vue
git commit -m "Show import steps, choose what happens to duplicates and fix rows in a side panel"
```

---

### Task 16: End-to-end coverage and wrap-up

**Files:**
- Create: `e2e/settings.spec.ts`
- Modify: `e2e/import.spec.ts`

- [ ] **Step 1: Settings e2e**

`e2e/settings.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('settings opens on Account with the sections beside it on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/settings');
  await page.waitForURL(/\/settings\/account$/);
  await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Study' }).click();
  await expect(page.getByRole('heading', { name: 'Study', level: 1 })).toBeVisible();
});

test('settings is a list on a phone, and each section goes back to it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings');
  await page.getByRole('link', { name: 'About' }).click();
  await expect(page.getByText('Platform')).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test('a saved study setting survives a reload', async ({ page }) => {
  await page.goto('/settings/study');
  const field = page.getByRole('spinbutton', { name: 'New cards per day' });
  await field.fill('21');
  await field.press('Tab');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Settings saved')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: 'New cards per day' })).toHaveValue('21');
});
```

(If `kt-sub-menu-navigation` exposes items as something other than links, read `e2e/layout.spec.ts` for how the main nav is clicked and use the same locator.)

- [ ] **Step 2: Import e2e**

Append to `e2e/import.spec.ts`:

```ts
test('a duplicate can update the existing card and a broken row can be fixed', async ({ page }) => {
  const deckName = `Duplicate test ${Date.now()}`;

  await page.goto('/decks');
  await page.getByRole('button', { name: 'New deck' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill(deckName);
  await page.getByRole('button', { name: 'Create deck' }).click();
  await expect(page.getByRole('main').getByText(deckName)).toBeVisible();

  const importCsv = async (csv: string) => {
    await page.goto('/import');
    await page.getByRole('combobox', { name: 'Destination deck' }).click();
    await page.getByRole('option', { name: deckName }).click();
    await page
      .locator('kt-drag-drop input[type="file"]')
      .setInputFiles({ name: 'cards.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') });
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Step 3 of 3 — Review')).toBeVisible();
  };

  await importCsv(['hanzi,pinyin,translation', '朋友,peng2 you5,friend'].join('\n'));
  await page.getByRole('button', { name: 'Import' }).click();
  await page.waitForURL(/\/decks\/[^/?]+$/);

  await importCsv(['hanzi,pinyin,translation', '朋友,peng2 you5,pal', '老師,lao3 shi1,'].join('\n'));
  await expect(page.locator('kt-stat', { hasText: 'Already in deck' }).locator('[part=value]')).toHaveText('1');
  await expect(page.locator('kt-stat', { hasText: 'Errors' }).locator('[part=value]')).toHaveText('1');

  await page.getByRole('row', { name: /老師/ }).click();
  await page.getByRole('textbox', { name: 'Translation' }).fill('teacher');
  await page.getByRole('button', { name: 'Check row' }).click();
  await expect(page.locator('kt-stat', { hasText: 'Errors' }).locator('[part=value]')).toHaveText('0');

  await page.getByRole('radio', { name: 'Update' }).click();
  await page.getByRole('button', { name: 'Import' }).click();
  await page.waitForURL(/\/decks\/[^/?]+$/);
  await expect(page.getByText('pal', { exact: true })).toBeVisible();
  await expect(page.getByText('老師', { exact: true })).toBeVisible();
});
```

(If `kt-segmented-control` segments are not `radio` roles, check `node_modules/kanto-ds/dist/docs/kt-segmented-control.md` for their role and adjust.)

- [ ] **Step 3: Run everything**

Run: `npm test 2>&1 | tail -5` — Expected: all pass.
Run: `npm run typecheck 2>&1 | tail -10` — Expected: no errors.
Run: `npx playwright test 2>&1 | tail -15` — Expected: all pass.
Run: `npm run build 2>&1 | tail -5` — Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add e2e/settings.spec.ts e2e/import.spec.ts
git commit -m "Cover Settings navigation and duplicate imports end to end"
```

---

## Spec coverage

| Spec item | Task |
|---|---|
| Bump to 1.8.0, run suites | 1 |
| kt-steps / kt-number-input / kt-slider / kt-time-input | 15 / 4 / 4 / 11 |
| Command palette | 3 |
| Accent, text size | 2, 4 |
| Settings sub-routes, menu, mobile list | 3, 4 |
| Account: signed out, profile, sidebar footer | 5 |
| Account: sync details | 6 |
| Data: export / restore / reset | 7, 8, 9 |
| About: version, commit, build, platform, storage | 4 |
| Reminders: times, days, migration, week ahead, ids, test, web state | 10, 11 |
| Import: steps, duplicates Skip/Update, fix row, remembered mapping | 12–15 |
| Testing | every task; e2e in 16 |

Deliberate narrowing of the spec: the palette's Actions group holds Sync now and the theme switch; Start review, Start writing, New card and Import are reached through "Go to", which lists those pages already.
