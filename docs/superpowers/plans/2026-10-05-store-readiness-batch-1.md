# Store readiness, batch 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Google Play blockers: in-app account deletion, public privacy / account-deletion / licences pages, and a signed release AAB.

**Architecture:** A `security definer` SQL function deletes the caller's `auth.users` row; existing `on delete cascade` foreign keys remove every synced row. `useAuth().deleteAccount()` calls it, signs out locally and forgets the sync cursor and outbox. Three public routes render on a sidebar-less `legal` layout. Gradle reads the version and version code from `package.json` through one Node script and signs release builds from an untracked `keystore.properties` or `FANKA_*` environment variables.

**Tech Stack:** Nuxt 4 (SPA, `ssr: false`), Vue 3, Kanto (`kanto-ds` web components), Dexie, Supabase JS v2, Capacitor 8 / Gradle (AGP), Vitest (happy-dom, fake-indexeddb), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-store-readiness-batch-1-design.md`

## Global Constraints

- Commits are authored by Arnaud Michel alone: no `Co-Authored-By` trailer, no AI attribution.
- All copy is English, sentence case, terse, no emoji.
- Never hard-code a colour, size, duration or radius: Kanto tokens, semantic aliases first (`--surface-card`, `--text-muted`, `--gap-element`…).
- Kanto data goes in as properties (`:columns`, `:data`), events are `kt-`-prefixed with payload in `detail`.
- `core/` stays pure: no Vue, Nuxt or Capacitor imports.
- Pages never touch Dexie directly — always through a composable (the `Kanto first` integrity test enforces it).
- Before any native interactive/structural element (`button a nav table input select textarea dialog ul ol`) in `app/`, use a Kanto component; otherwise add an entry with a reason to `test/integrity/native-elements.allowlist.ts`. This plan uses none.
- Public domain `https://fanka.arnaudmichel.fr`; public contact `contact@arnaudmichel.fr`; developer name `Arnaud Michel`.
- Deleting the account keeps local data; the learner is signed out and continues offline.
- Minor review findings go to `docs/deferred-minors.md`, not into a fix round.
- Commands: `npm test` (Vitest), `npm run typecheck`, `npm run test:e2e` (Playwright, starts `npm run dev`).

## Review Focus

1. **Server deletion succeeds but local sign-out throws** — the account is gone, so `deleteAccount()` must still return `true`, clear `user`, and forget the sync state (test in Task 2).
2. **Server deletion fails (network, RPC error)** — nothing local changes: session, cursor and outbox untouched, `error` set (test in Task 2).
3. **Double tap on "Delete account" in the confirm dialog** — only one RPC call; the button is disabled while it runs (guard + test in Task 2).
4. **A pre-release or out-of-range version (`1.2.3-beta`, `1.100.0`)** — Gradle must fail with the script's message instead of producing a colliding `versionCode` (test in Task 6).
5. **Release build without credentials** — fails with a message naming `keystore.properties` and the `FANKA_*` variables; debug builds still work with no keystore (manual check in Task 7).

---

### Task 1: Delete-account SQL function and local sync forgetting

**Files:**
- Create: `supabase/migrations/0003_delete_account.sql`
- Modify: `core/sync/engine.ts` (add an export next to `getLastPulledAt`, around line 8-13)
- Test: `test/sync/forget.test.ts`

**Interfaces:**
- Produces: `forgetSyncedAccount(): Promise<void>` exported from `~core/sync/engine` — deletes the `lastPulledAt` row from `db.syncState` and clears `db.outbox`, in one transaction.
- Produces: Postgres function `public.delete_my_account()` returning `void`, callable by role `authenticated` only.

- [ ] **Step 1: Write the failing test**

`test/sync/forget.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '~core/db/db';
import { forgetSyncedAccount } from '~core/sync/engine';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('forgetSyncedAccount', () => {
  it('drops the pull cursor and every unsent change, and keeps local data', async () => {
    await db.syncState.put({ key: 'lastPulledAt', value: 123 });
    await db.outbox.put({ id: 'o1', entity: 'card', entityId: 'c1', op: 'put', at: 1 });
    await db.decks.put({ id: 'd1', deletedAt: null } as never);

    await forgetSyncedAccount();

    expect(await db.syncState.get('lastPulledAt')).toBeUndefined();
    expect(await db.outbox.count()).toBe(0);
    expect(await db.decks.count()).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sync/forget.test.ts`
Expected: FAIL — `forgetSyncedAccount` is not exported.

- [ ] **Step 3: Implement**

In `core/sync/engine.ts`, directly below `getLastPulledAt`:

```ts
/**
 * After the account is deleted: the cursor and the unsent changes both
 * pointed at it. Local decks, cards and reviews are left alone.
 */
export async function forgetSyncedAccount(): Promise<void> {
  await db.transaction('rw', [db.syncState, db.outbox], async () => {
    await db.syncState.delete(LAST_PULLED_AT_KEY);
    await db.outbox.clear();
  });
}
```

`supabase/migrations/0003_delete_account.sql`:

```sql
-- Account deletion, which Google Play requires in the app. Every table in
-- 0001/0002 references auth.users (id) on delete cascade, so deleting the
-- caller's auth row removes every row they own.
--
-- security definer: the authenticated role cannot delete from auth.users
-- itself. search_path is empty so nothing in the caller's path can shadow
-- auth.users. auth.uid() is null for an anonymous caller, so the delete
-- matches nothing even if the grant below were wrong.
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/sync`
Expected: PASS (all sync tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_delete_account.sql core/sync/engine.ts test/sync/forget.test.ts
git commit -m "Add the account deletion function and forget the sync state locally"
```

---

### Task 2: `useAuth().deleteAccount()`

**Files:**
- Modify: `app/composables/useAuth.ts` (new function inside `useAuth()`, exported in the returned object next to `signOut`)
- Modify: `docs/deferred-minors.md` (one row)
- Test: `test/composables/useAuth.test.ts`

**Interfaces:**
- Consumes: `forgetSyncedAccount()` from `~core/sync/engine` (Task 1); RPC `delete_my_account` (Task 1).
- Produces: `deleteAccount(): Promise<boolean>` and `deleting: Readonly<Ref<boolean>>` on `useAuth()`. Returns `true` once the server account is gone; `false` with `error` set otherwise. Never throws. A call while one is running returns `false` without calling the server.

- [ ] **Step 1: Extend the fake client and write the failing tests**

In `test/composables/useAuth.test.ts`, change the hoisted block so the fake client also has `rpc`, and mock the engine:

```ts
const { authStub, rpc, forgetSyncedAccount, getSupabaseClient } = vi.hoisted(() => {
  // …existing listeners / authStub unchanged…
  const rpc = vi.fn(async (): Promise<{ error: FakeAuthError }> => ({ error: null }));
  const forgetSyncedAccount = vi.fn(async (): Promise<void> => {});
  const getSupabaseClient = vi.fn(() => ({ auth: authStub, rpc }));
  return { authStub, rpc, forgetSyncedAccount, getSupabaseClient };
});

vi.mock('~core/sync/engine', () => ({ forgetSyncedAccount }));
```

Append:

```ts
describe('deleteAccount', () => {
  it('deletes the account, signs out locally and forgets the sync state', async () => {
    const { useAuth } = await import('~/composables/useAuth');
    const auth = useAuth();
    authStub.emit('SIGNED_IN', { user: { id: 'u1', email: 'arnaud@example.com' } });
    rpc.mockClear();
    authStub.signOut.mockClear();
    forgetSyncedAccount.mockClear();

    expect(await auth.deleteAccount()).toBe(true);

    expect(rpc).toHaveBeenCalledWith('delete_my_account');
    expect(authStub.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(forgetSyncedAccount).toHaveBeenCalledTimes(1);
    expect(auth.user.value).toBeNull();
    expect(auth.error.value).toBe('');
  });

  it('changes nothing locally when the server refuses', async () => {
    const { useAuth } = await import('~/composables/useAuth');
    const auth = useAuth();
    authStub.emit('SIGNED_IN', { user: { id: 'u1', email: 'arnaud@example.com' } });
    rpc.mockResolvedValueOnce({ error: { message: 'JWT expired' } });
    authStub.signOut.mockClear();
    forgetSyncedAccount.mockClear();

    expect(await auth.deleteAccount()).toBe(false);

    expect(auth.error.value).toBe('JWT expired');
    expect(authStub.signOut).not.toHaveBeenCalled();
    expect(forgetSyncedAccount).not.toHaveBeenCalled();
    expect(auth.user.value).toMatchObject({ id: 'u1' });
  });

  it('changes nothing locally when the network call throws', async () => {
    const { useAuth } = await import('~/composables/useAuth');
    const auth = useAuth();
    rpc.mockRejectedValueOnce(new Error('Failed to fetch'));
    forgetSyncedAccount.mockClear();

    expect(await auth.deleteAccount()).toBe(false);

    expect(auth.error.value).toBe('Failed to fetch');
    expect(forgetSyncedAccount).not.toHaveBeenCalled();
  });

  it('still reports success when the local sign-out fails after the server deleted the account', async () => {
    const { useAuth } = await import('~/composables/useAuth');
    const auth = useAuth();
    authStub.emit('SIGNED_IN', { user: { id: 'u1', email: 'arnaud@example.com' } });
    authStub.signOut.mockRejectedValueOnce(new Error('storage locked'));
    forgetSyncedAccount.mockClear();

    expect(await auth.deleteAccount()).toBe(true);

    expect(auth.user.value).toBeNull();
    expect(forgetSyncedAccount).toHaveBeenCalledTimes(1);
  });

  it('ignores a second call while the first is running', async () => {
    const { useAuth } = await import('~/composables/useAuth');
    const auth = useAuth();
    rpc.mockClear();
    let release!: () => void;
    rpc.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve({ error: null }))));

    const first = auth.deleteAccount();
    expect(auth.deleting.value).toBe(true);
    expect(await auth.deleteAccount()).toBe(false);
    release();
    expect(await first).toBe(true);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(auth.deleting.value).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/composables/useAuth.test.ts`
Expected: FAIL — `auth.deleteAccount is not a function`.

- [ ] **Step 3: Implement**

In `app/composables/useAuth.ts`, add the import and a module-scope ref next to `error`:

```ts
import { forgetSyncedAccount } from '~core/sync/engine';
// …
const deleting = ref(false);
```

Inside `useAuth()`, after `signOut`:

```ts
  /**
   * Deletes the account and everything synced to it (`delete_my_account`,
   * supabase/migrations/0003). Local decks, cards and reviews stay; the
   * learner carries on signed out. Once the server call succeeds the account
   * is gone, so a failing local clean-up is logged, never reported as a
   * failed deletion.
   */
  async function deleteAccount(): Promise<boolean> {
    if (deleting.value) return false;
    deleting.value = true;
    error.value = '';
    try {
      const client = getSupabaseClient();
      const { error: rpcError } = await client.rpc('delete_my_account');
      if (rpcError) {
        error.value = rpcError.message;
        return false;
      }
      try {
        await client.auth.signOut({ scope: 'local' });
      } catch (err) {
        console.error('useAuth: local sign-out after account deletion failed', err);
      }
      user.value = null;
      try {
        await forgetSyncedAccount();
      } catch (err) {
        console.error('useAuth: failed to forget the sync state after account deletion', err);
      }
      return true;
    } catch (err) {
      console.error('useAuth: account deletion failed', err);
      error.value = err instanceof Error ? err.message : 'Account deletion failed';
      return false;
    } finally {
      deleting.value = false;
    }
  }
```

Add `deleting: readonly(deleting),` and `deleteAccount,` to the returned object.

Append to the table in `docs/deferred-minors.md`:

```md
| `app/plugins/sync.client.ts` | Signing in to a new account (after deleting one, or after signing out of another) does not push the rows already on the device; only changes made afterwards reach the new account | Pre-existing for account switches; deletion now resets the cursor and outbox so nothing leaks into the new account | Store readiness batch 1 design |
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/composables/useAuth.test.ts && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add app/composables/useAuth.ts test/composables/useAuth.test.ts docs/deferred-minors.md
git commit -m "Let useAuth delete the account and keep the data on the device"
```

---

### Task 3: Delete account in Settings › Account

**Files:**
- Modify: `app/pages/settings/account.vue`
- Test: `e2e/settings.spec.ts`

**Interfaces:**
- Consumes: `useAuth().deleteAccount`, `useAuth().deleting`, `useAuth().error` (Task 2).

- [ ] **Step 1: Write the e2e test (signed-out case; e2e cannot sign in without a live Supabase project)**

Append to `e2e/settings.spec.ts`:

```ts
test('account deletion is offered only to a signed-in learner', async ({ page }) => {
  await page.goto('/settings/account');
  await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send link' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete account' })).toHaveCount(0);
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test e2e/settings.spec.ts -g "account deletion"`
Expected: PASS (it guards the signed-out branch against regressions; the signed-in branch is checked manually in Step 5).

- [ ] **Step 3: Implement**

In `<script setup>`:

```ts
const { user, loading, error, displayName, signIn, signOut, updateProfile, deleteAccount, deleting } = useAuth();

const confirmingDelete = ref(false);
/** Deleting needs the server; offline the button is disabled with a hint. */
const online = ref(typeof navigator === 'undefined' || navigator.onLine);
function updateOnline(): void {
  online.value = navigator.onLine;
}
onMounted(() => {
  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);
});
onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnline);
  window.removeEventListener('offline', updateOnline);
});

async function onDeleteAccount(): Promise<void> {
  confirmingDelete.value = false;
  if (await deleteAccount()) {
    linkSent.value = false;
    email.value = '';
    toaster.success('Account deleted');
  } else if (error.value) {
    toaster.error("Couldn't delete your account", { description: error.value });
  }
}
```

In the template, inside `<template v-else>`, after the Sync `kt-form`:

```vue
    <kt-form heading="Delete account" description="Deletes your account and everything synced to it. The decks and cards on this device stay.">
      <kt-alert v-if="!online" variant="warning" description="Connect to the internet to delete your account." />
      <kt-button slot="footer" type="button" variant="danger" size="medium" icon="trash-2" :disabled="deleting || !online" @click="confirmingDelete = true">Delete account</kt-button>
    </kt-form>
    <kt-confirm-dialog
      :open="confirmingDelete"
      heading="Delete your account?"
      message="Your account and everything synced to it are deleted. The decks and cards on this device stay."
      confirm-label="Delete account"
      cancel-label="Cancel"
      variant="danger"
      @kt-confirm="onDeleteAccount"
      @kt-cancel="confirmingDelete = false"
    />
```

- [ ] **Step 4: Run the checks**

Run: `npm test && npm run typecheck && npx playwright test e2e/settings.spec.ts`
Expected: all PASS (the `Kanto first` integrity test included).

- [ ] **Step 5: Manual check (signed in, against the real Supabase project after `supabase db push`)**

1. `npm run dev`, sign in with a throwaway email, create a card, wait for "Up to date".
2. Settings › Account › Delete account → Cancel: nothing happens.
3. Delete account → Delete account: toast "Account deleted", the Sign in form shows, the card is still in Browse.
4. In the Supabase dashboard the user and their rows are gone.
5. DevTools › Network › Offline: the button is disabled and the hint shows.

- [ ] **Step 6: Commit**

```bash
git add app/pages/settings/account.vue e2e/settings.spec.ts
git commit -m "Offer account deletion in Settings, keeping the data on the device"
```

---

### Task 4: Legal layout, privacy policy and account deletion page

**Files:**
- Create: `app/layouts/legal.vue`
- Create: `app/utils/legal.ts`
- Create: `app/pages/privacy.vue`
- Create: `app/pages/delete-account.vue`
- Test: `e2e/legal.spec.ts`

**Interfaces:**
- Produces: `CONTACT_EMAIL`, `DEVELOPER`, `LAST_UPDATED`, `DATA_REGION` from `~/utils/legal`; layout name `legal` (used by Task 5).

- [ ] **Step 1: Write the failing e2e tests**

`e2e/legal.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('the privacy policy is public and names the contact address', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy policy', level: 1 })).toBeVisible();
  await expect(page.getByText('contact@arnaudmichel.fr').first()).toBeVisible();
  // The legal layout has no sidebar: its Search button (AppSidebar.vue) is absent.
  await expect(page.getByRole('button', { name: 'Search' })).toHaveCount(0);
});

test('the account deletion page explains both ways to delete', async ({ page }) => {
  await page.goto('/delete-account');
  await expect(page.getByRole('heading', { name: 'Delete your Fanka account', level: 1 })).toBeVisible();
  await expect(page.getByText('Settings › Account › Delete account')).toBeVisible();
  await expect(page.getByText('contact@arnaudmichel.fr').first()).toBeVisible();
});

test('a legal page leads back to the app', async ({ page }) => {
  await page.goto('/privacy');
  await page.getByRole('button', { name: 'Back to Fanka' }).click();
  await expect(page).toHaveURL(/\/$/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx playwright test e2e/legal.spec.ts`
Expected: FAIL — 404 / heading not found.

- [ ] **Step 3: Implement**

`app/utils/legal.ts` (`DATA_REGION` is filled with the value Arnaud confirms from the Supabase dashboard before execution starts):

```ts
/** Facts the public legal pages (/privacy, /delete-account) state. */
export const DEVELOPER = 'Arnaud Michel';
export const CONTACT_EMAIL = 'contact@arnaudmichel.fr';
export const LAST_UPDATED = '2026-10-05';
/** Where the Supabase project stores synced data, as shown in its dashboard. */
export const DATA_REGION = 'the European Union (Frankfurt, Germany)';
```

`app/layouts/legal.vue`:

```vue
<script setup lang="ts">
/**
 * Public pages Google Play links to (privacy policy, account deletion,
 * licences): no sidebar, a readable column, text that can be selected.
 */
</script>

<template>
  <div class="legal fk-selectable">
    <kt-button variant="secondary-no-bg" size="small" icon="arrow-left" @click="navigateTo('/')">Back to Fanka</kt-button>
    <main class="legal-main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
/*
  Kanto has no content-width token. 72ch is a reading measure that follows
  the font size (and Kanto's text-size setting), not a layout size.
*/
.legal {
  max-width: 72ch;
  margin: 0 auto;
  padding: var(--padding-card);
  padding-top: calc(var(--padding-card) + env(safe-area-inset-top));
  padding-bottom: calc(var(--padding-card) + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--gap-card);
  background: var(--surface-page);
  color: var(--text-body);
}
.legal-main { display: flex; flex-direction: column; gap: var(--gap-card); width: 100%; }
.legal-main :deep(h2) { font: var(--font-title-h6); margin: 0; }
.legal-main :deep(p) { font: var(--font-normal-regular); margin: 0; }
.legal-main :deep(section) { display: flex; flex-direction: column; gap: var(--gap-element); }
</style>
```

Every token above is defined in `node_modules/kanto-ds/dist/tokens/` (checked while writing this plan).

`app/pages/privacy.vue`:

```vue
<script setup lang="ts">
import { CONTACT_EMAIL, DATA_REGION, DEVELOPER, LAST_UPDATED } from '~/utils/legal';

definePageMeta({ layout: 'legal' });
useHead({ title: 'Privacy policy · Fanka' });
</script>

<template>
  <kt-page-header eyebrow="Fanka" heading="Privacy policy" :description="`Last updated ${LAST_UPDATED}.`" />

  <section>
    <h2>Without an account</h2>
    <p>Everything you create and every answer you give stays on your device. Nothing is sent anywhere.</p>
  </section>

  <section>
    <h2>With an account</h2>
    <p>
      An account syncs your study across devices. Fanka then stores your email address, used to send the sign-in link,
      and your decks, cards, review history, writing attempts and settings with Supabase, a hosted database provider,
      in {{ DATA_REGION }}. Only your account can read them.
    </p>
  </section>

  <section>
    <h2>On your device</h2>
    <p>Pronunciation uses your device's own speech engine. Reminders are notifications scheduled on your device.</p>
  </section>

  <section>
    <h2>What Fanka never does</h2>
    <p>No ads, no analytics, no tracking. Your data is never sold or shared.</p>
  </section>

  <section>
    <h2>How long data is kept</h2>
    <p>Synced data is kept until you delete your account. Data on your device is kept until you reset it or uninstall Fanka.</p>
  </section>

  <section>
    <h2>Your rights</h2>
    <p>
      Export everything from Settings › Data › Export backup. Delete your account from Settings › Account, or see
      fanka.arnaudmichel.fr/delete-account. For anything else, write to {{ CONTACT_EMAIL }}.
    </p>
  </section>

  <section>
    <h2>Who is responsible</h2>
    <p>{{ DEVELOPER }}, {{ CONTACT_EMAIL }}.</p>
  </section>
</template>
```

`app/pages/delete-account.vue`:

```vue
<script setup lang="ts">
import { CONTACT_EMAIL, DEVELOPER } from '~/utils/legal';

definePageMeta({ layout: 'legal' });
useHead({ title: 'Delete your account · Fanka' });
</script>

<template>
  <kt-page-header eyebrow="Fanka" heading="Delete your Fanka account" :description="`Fanka is developed by ${DEVELOPER}.`" />

  <section>
    <h2>In the app</h2>
    <p>Open Settings › Account › Delete account, then confirm.</p>
  </section>

  <section>
    <h2>Without the app</h2>
    <p>Write to {{ CONTACT_EMAIL }} from the email address of your account. The account is deleted within 30 days.</p>
  </section>

  <section>
    <h2>What is deleted</h2>
    <p>Your account and everything synced to it: decks, cards, review history, writing attempts and settings.</p>
  </section>

  <section>
    <h2>What stays</h2>
    <p>The data on your device. Clear it from Settings › Data › Reset, or uninstall Fanka.</p>
  </section>
</template>
```

- [ ] **Step 4: Run the checks**

Run: `npx playwright test e2e/legal.spec.ts && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/layouts/legal.vue app/utils/legal.ts app/pages/privacy.vue app/pages/delete-account.vue e2e/legal.spec.ts
git commit -m "Publish the privacy policy and the account deletion page"
```

---

### Task 5: Open source licences page and its integrity test

**Files:**
- Create: `app/utils/licences.ts`
- Create: `app/pages/licences.vue`
- Create: `test/integrity/licences.test.ts`
- Modify: `e2e/legal.spec.ts`

**Interfaces:**
- Consumes: layout `legal` (Task 4).
- Produces: `DATA_SOURCES: readonly LicenceEntry[]`, `LIBRARIES: readonly LicenceEntry[]`, `interface LicenceEntry { package: string; name: string; licence: string; url: string }` from `~/utils/licences`.

- [ ] **Step 1: Write the failing integrity test**

`test/integrity/licences.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATA_SOURCES, LIBRARIES } from '~/utils/licences';

const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe('Licences page', () => {
  it('credits every production dependency, and only those', () => {
    const deps = Object.keys(pkg.dependencies).sort();
    const listed = LIBRARIES.map((l) => l.package).sort();
    expect(listed).toEqual(deps);
  });

  it('credits data sources that are still build inputs', () => {
    const missing = DATA_SOURCES.filter((d) => !(d.package in pkg.devDependencies)).map((d) => d.package);
    expect(missing).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/integrity/licences.test.ts`
Expected: FAIL — cannot resolve `~/utils/licences`.

- [ ] **Step 3: Implement**

`app/utils/licences.ts`:

```ts
/**
 * What /licences credits. The integrity test (test/integrity/licences.test.ts)
 * fails when a production dependency is added or removed without updating
 * LIBRARIES, so the page cannot fall behind package.json.
 */
export interface LicenceEntry {
  /** The npm package name, as in package.json. */
  package: string;
  name: string;
  licence: string;
  url: string;
}

/** Data Fanka ships, derived at build time from these devDependencies. */
export const DATA_SOURCES: readonly LicenceEntry[] = [
  { package: 'hanzi-writer-data', name: 'Make Me a Hanzi stroke data', licence: 'Arphic Public License', url: 'https://github.com/skishore/makemeahanzi' },
  { package: 'opencc-data', name: 'OpenCC conversion tables', licence: 'Apache-2.0', url: 'https://github.com/BYVoid/OpenCC' },
];

export const LIBRARIES: readonly LicenceEntry[] = [
  { package: '@capacitor-community/text-to-speech', name: 'Capacitor Text to Speech', licence: 'MIT', url: 'https://github.com/capacitor-community/text-to-speech' },
  { package: '@capacitor/android', name: 'Capacitor Android', licence: 'MIT', url: 'https://capacitorjs.com' },
  { package: '@capacitor/app', name: 'Capacitor App', licence: 'MIT', url: 'https://capacitorjs.com' },
  { package: '@capacitor/core', name: 'Capacitor', licence: 'MIT', url: 'https://capacitorjs.com' },
  { package: '@capacitor/filesystem', name: 'Capacitor Filesystem', licence: 'MIT', url: 'https://capacitorjs.com' },
  { package: '@capacitor/local-notifications', name: 'Capacitor Local Notifications', licence: 'MIT', url: 'https://capacitorjs.com' },
  { package: '@capacitor/share', name: 'Capacitor Share', licence: 'MIT', url: 'https://capacitorjs.com' },
  { package: '@capacitor/status-bar', name: 'Capacitor Status Bar', licence: 'MIT', url: 'https://capacitorjs.com' },
  { package: '@supabase/supabase-js', name: 'Supabase JS', licence: 'MIT', url: 'https://github.com/supabase/supabase-js' },
  { package: 'dexie', name: 'Dexie', licence: 'Apache-2.0', url: 'https://dexie.org' },
  { package: 'kanto-ds', name: 'Kanto', licence: 'MIT', url: 'https://kanto.arnaudmichel.fr' },
  { package: 'lit', name: 'Lit', licence: 'BSD-3-Clause', url: 'https://lit.dev' },
  { package: 'lucide', name: 'Lucide', licence: 'ISC', url: 'https://lucide.dev' },
  { package: 'nuxt', name: 'Nuxt', licence: 'MIT', url: 'https://nuxt.com' },
  { package: 'ts-fsrs', name: 'ts-fsrs', licence: 'MIT', url: 'https://github.com/open-spaced-repetition/ts-fsrs' },
  { package: 'vue', name: 'Vue', licence: 'MIT', url: 'https://vuejs.org' },
  { package: 'vue-router', name: 'Vue Router', licence: 'MIT', url: 'https://router.vuejs.org' },
];
```

`app/pages/licences.vue` (the Arphic licence requires its text to accompany the data; `public/strokes/ARPHICPL.TXT` is the copy `scripts/build-stroke-data.mjs` already ships):

```vue
<script setup lang="ts">
import type { KtTableColumn } from 'kanto-ds';
import arphicLicence from '../../public/strokes/ARPHICPL.TXT?raw';
import { DATA_SOURCES, LIBRARIES } from '~/utils/licences';

definePageMeta({ layout: 'legal' });
useHead({ title: 'Open source licences · Fanka' });

const columns: KtTableColumn[] = [
  { key: 'name', label: 'Library' },
  { key: 'licence', label: 'Licence' },
  { key: 'url', label: 'Website' },
];
const rows = LIBRARIES.map((l) => ({ ...l, id: l.package }));
</script>

<template>
  <kt-page-header eyebrow="Fanka" heading="Open source licences" description="Fanka is built on the work of these projects." />

  <section>
    <h2>Data</h2>
    <p v-for="d in DATA_SOURCES" :key="d.package">{{ d.name }} — {{ d.licence }} — {{ d.url }}</p>
    <kt-collapsible heading="Arphic Public License" plain>
      <pre class="licence-text">{{ arphicLicence }}</pre>
    </kt-collapsible>
  </section>

  <section>
    <h2>Libraries</h2>
    <kt-table label="Libraries" :columns="columns" :data="rows" compact />
  </section>
</template>

<style scoped>
.licence-text {
  white-space: pre-wrap;
  font: var(--font-normal-small);
  color: var(--text-muted);
  margin: 0;
}
</style>
```

Append to `e2e/legal.spec.ts`:

```ts
test('the licences page credits the stroke data and the libraries', async ({ page }) => {
  await page.goto('/licences');
  await expect(page.getByRole('heading', { name: 'Open source licences', level: 1 })).toBeVisible();
  await expect(page.getByText('Make Me a Hanzi stroke data', { exact: false })).toBeVisible();
  await expect(page.locator('kt-table tr[part=row]', { hasText: 'Vue Router' })).toBeVisible();
});
```

- [ ] **Step 4: Run the checks**

Run: `npm test && npm run typecheck && npx playwright test e2e/legal.spec.ts`
Expected: PASS. If `typecheck` rejects the `?raw` import, create `app/types/raw.d.ts`:

```ts
declare module '*?raw' {
  const text: string;
  export default text;
}
```

and add it to the commit.

The spec named "Arphic Public License and LGPL"; `hanzi-writer-data` ships only the stroke graphics, licensed under the APL (`node_modules/hanzi-writer-data/ARPHICPL.TXT`). The LGPL covers Make Me a Hanzi's dictionary, which Fanka does not ship, so only the APL is credited.

- [ ] **Step 5: Commit**

```bash
git add app/utils/licences.ts app/pages/licences.vue test/integrity/licences.test.ts e2e/legal.spec.ts
git commit -m "Credit the stroke data and every library on a licences page"
```

---

### Task 6: Links from About, and the version code script

**Files:**
- Modify: `app/pages/settings/about.vue`
- Create: `scripts/version-code.mjs`
- Test: `test/scripts/version-code.test.ts`
- Modify: `e2e/settings.spec.ts`

**Interfaces:**
- Produces: `versionCode(version: string): number` from `scripts/version-code.mjs`; running `node scripts/version-code.mjs` prints `<code> <version>` (e.g. `10203 1.2.3`) for Task 7's Gradle.

- [ ] **Step 1: Write the failing tests**

`test/scripts/version-code.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { versionCode } from '../../scripts/version-code.mjs';

describe('versionCode', () => {
  it('packs x.y.z into one growing integer', () => {
    expect(versionCode('1.0.0')).toBe(10000);
    expect(versionCode('1.2.3')).toBe(10203);
    expect(versionCode('2.0.0')).toBeGreaterThan(versionCode('1.99.99'));
  });

  it('rejects what would collide or not be a release', () => {
    expect(() => versionCode('1.2.3-beta')).toThrow(/x\.y\.z/);
    expect(() => versionCode('1.2')).toThrow(/x\.y\.z/);
    expect(() => versionCode('1.100.0')).toThrow(/99/);
    expect(() => versionCode('1.0.100')).toThrow(/99/);
  });
});
```

Append to `e2e/settings.spec.ts`:

```ts
test('about links to the privacy policy, account deletion and licences', async ({ page }) => {
  await page.goto('/settings/about');
  await page.getByRole('button', { name: 'Privacy policy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page.goBack();
  await page.getByRole('button', { name: 'Open source licences' }).click();
  await expect(page).toHaveURL(/\/licences$/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/scripts/version-code.test.ts`
Expected: FAIL — cannot find `scripts/version-code.mjs`.

- [ ] **Step 3: Implement**

`scripts/version-code.mjs`:

```js
#!/usr/bin/env node
/**
 * Google Play's versionCode, derived from package.json's version so there is
 * one number to bump (`npm version patch|minor`). android/app/build.gradle
 * runs this script and reads `<versionCode> <versionName>` from stdout.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * `x.y.z` → `x * 10000 + y * 100 + z`.
 * @param {string} version
 * @returns {number}
 */
export function versionCode(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`version must be x.y.z with no suffix, got "${version}"`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor > 99 || patch > 99) throw new Error(`minor and patch must be 99 or less, got "${version}"`);
  return major * 10000 + minor * 100 + patch;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  process.stdout.write(`${versionCode(version)} ${version}\n`);
}
```

In `app/pages/settings/about.vue`, below the facts `kt-card`:

```vue
  <kt-card>
    <div class="links">
      <kt-button variant="secondary-no-bg" size="small" icon="shield" @click="navigateTo('/privacy')">Privacy policy</kt-button>
      <kt-button variant="secondary-no-bg" size="small" icon="user-x" @click="navigateTo('/delete-account')">Delete your account</kt-button>
      <kt-button variant="secondary-no-bg" size="small" icon="scale" @click="navigateTo('/licences')">Open source licences</kt-button>
    </div>
  </kt-card>
```

and in its `<style scoped>`:

```css
.links { display: flex; flex-wrap: wrap; gap: var(--gap-element); }
```

Check `about.vue`'s template has a single root wrapper; if two sibling `kt-card`s break its layout, wrap both in a `<div class="about">` with `display: flex; flex-direction: column; gap: var(--gap-card)`.

- [ ] **Step 4: Run the checks**

Run: `npm test && npm run typecheck && node scripts/version-code.mjs && npx playwright test e2e/settings.spec.ts`
Expected: tests PASS; the script prints `10000 1.0.0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/version-code.mjs test/scripts/version-code.test.ts app/pages/settings/about.vue e2e/settings.spec.ts
git commit -m "Link the legal pages from About and derive the version code from package.json"
```

---

### Task 7: Signed release bundle

**Files:**
- Modify: `android/app/build.gradle:6-24`
- Modify: `android/.gitignore:93-96`
- Create: `android/keystore.properties.example`
- Modify: `package.json` (scripts)
- Modify: `supabase/config.toml`
- Modify: `docs/android.md` (new "Release" section at the end)

**Interfaces:**
- Consumes: `node scripts/version-code.mjs` output `<code> <name>` (Task 6).

- [ ] **Step 1: Ignore keystores before anything else**

In `android/.gitignore`, replace

```
# Keystore files
# Uncomment the following lines if you do not want to check your keystore files in.
#*.jks
#*.keystore
```

with

```
# Keystore files and their credentials are never committed.
*.jks
*.keystore
keystore.properties
```

Run: `git status --short android` — expected: only `.gitignore` modified.

- [ ] **Step 2: Version and signing in Gradle**

At the top of `android/app/build.gradle`, after `apply plugin`:

```groovy
// One version for the web bundle, About and Play: package.json, through
// scripts/version-code.mjs, which also rejects versions that would collide.
def fankaVersion = providers.exec {
    workingDir rootProject.projectDir.parentFile
    commandLine 'node', 'scripts/version-code.mjs'
}.standardOutput.asText.get().trim().split(' ')

// Upload key for Play App Signing: FANKA_* environment variables first (CI),
// then android/keystore.properties (local, untracked). Debug builds need none.
def keystoreProps = new Properties()
def keystorePropsFile = rootProject.file('keystore.properties')
if (keystorePropsFile.exists()) keystorePropsFile.withInputStream { keystoreProps.load(it) }
def signingValue = { String env, String key -> System.getenv(env) ?: keystoreProps.getProperty(key) }
def releaseStoreFile = signingValue('FANKA_KEYSTORE_FILE', 'storeFile')
```

In `defaultConfig`, replace `versionCode 1` / `versionName "1.0"` with:

```groovy
        versionCode fankaVersion[0].toInteger()
        versionName fankaVersion[1]
```

Inside `android { }`, before `buildTypes`:

```groovy
    signingConfigs {
        if (releaseStoreFile) {
            release {
                storeFile file(releaseStoreFile)
                storePassword signingValue('FANKA_KEYSTORE_PASSWORD', 'storePassword')
                keyAlias signingValue('FANKA_KEY_ALIAS', 'keyAlias')
                keyPassword signingValue('FANKA_KEY_PASSWORD', 'keyPassword')
            }
        }
    }
```

and in `buildTypes { release { … } }` add:

```groovy
            if (releaseStoreFile) signingConfig signingConfigs.release
```

After the `android { }` block:

```groovy
gradle.taskGraph.whenReady { graph ->
    def wantsRelease = graph.allTasks.any { it.name in ['bundleRelease', 'assembleRelease'] }
    if (wantsRelease && !releaseStoreFile) {
        throw new GradleException('No upload key: create android/keystore.properties from keystore.properties.example, or set FANKA_KEYSTORE_FILE, FANKA_KEYSTORE_PASSWORD, FANKA_KEY_ALIAS and FANKA_KEY_PASSWORD.')
    }
}
```

`android/keystore.properties.example`:

```properties
# Copy to keystore.properties (untracked) and fill in. storeFile is an
# absolute path outside the repository; ~ is not expanded.
storeFile=/home/you/.android/fanka-upload.jks
storePassword=
keyAlias=fanka-upload
keyPassword=
```

- [ ] **Step 3: Scripts**

In `package.json` `scripts`, after `"android:build"`:

```json
    "android:bundle": "npm run android:sync && ([ -x \"$JAVA_HOME/bin/java\" ] || unset JAVA_HOME; cd android && ./gradlew bundleRelease)",
    "android:keystore": "echo 'Run, then back the file and both passwords up somewhere safe:' && echo 'keytool -genkeypair -v -keystore ~/.android/fanka-upload.jks -alias fanka-upload -keyalg RSA -keysize 2048 -validity 10000'",
```

- [ ] **Step 4: Production redirect**

In `supabase/config.toml`:

```toml
site_url = "https://fanka.arnaudmichel.fr"
# The magic link has to come back to the app: production, the Android deep
# link, the dev server on localhost, and the dev server on the LAN address a
# phone uses.
additional_redirect_urls = [
  "https://fanka.arnaudmichel.fr",
  "fanka://auth",
  "http://localhost:3000",
  "http://10.50.122.64:3000",
]
```

- [ ] **Step 5: Verify the build both ways**

```bash
npm run android:build                      # debug, no keystore: must succeed
npm run android:bundle                     # no keystore: must fail with the "No upload key" message
keytool -genkeypair -keystore "$TMPDIR/throwaway.jks" -alias t -keyalg RSA -keysize 2048 -validity 1 \
  -storepass throwaway -keypass throwaway -dname "CN=Test"
FANKA_KEYSTORE_FILE="$TMPDIR/throwaway.jks" FANKA_KEYSTORE_PASSWORD=throwaway FANKA_KEY_ALIAS=t FANKA_KEY_PASSWORD=throwaway \
  npm run android:bundle                   # must produce the AAB
ls -l android/app/build/outputs/bundle/release/app-release.aab
rm "$TMPDIR/throwaway.jks"
```

Use the session scratchpad for `$TMPDIR`. Expected: debug succeeds, the bare bundle fails with the message, the signed bundle exists.

- [ ] **Step 6: Document the release**

Append to `docs/android.md`:

```md
## Release

Google Play gets a signed Android App Bundle. Play App Signing holds the app
signing key; you keep only the upload key, which Google can reset if lost.

### Once: the upload key

1. `npm run android:keystore` prints the `keytool` command. Run it and choose
   two passwords.
2. Back up `~/.android/fanka-upload.jks` and both passwords outside this
   machine. Never commit them (`android/.gitignore` refuses `*.jks`).
3. `cp android/keystore.properties.example android/keystore.properties` and
   fill it in with the absolute path and passwords.

### Each release

1. `npm version patch` (or `minor`). `package.json` is the only version:
   About shows it, and `scripts/version-code.mjs` turns `x.y.z` into Play's
   `versionCode` (`x*10000 + y*100 + z`, minor and patch at most 99, no
   pre-release suffix).
2. `npm run android:bundle` →
   `android/app/build/outputs/bundle/release/app-release.aab`.
3. Upload it to a Play Console track.

CI can set `FANKA_KEYSTORE_FILE`, `FANKA_KEYSTORE_PASSWORD`,
`FANKA_KEY_ALIAS` and `FANKA_KEY_PASSWORD` instead of the properties file.

### Play Console checklist (first release)

- Privacy policy: https://fanka.arnaudmichel.fr/privacy
- Account deletion: https://fanka.arnaudmichel.fr/delete-account
- Data safety: email address collected for sign-in; study data (decks, cards,
  reviews, attempts, settings) stored to sync; nothing shared with third
  parties; data encrypted in transit; users can request deletion.
- Content rating questionnaire.
- Store listing: 512 px icon, 1024×500 feature graphic, 2–8 phone screenshots,
  short and full description.
- A new personal developer account must run a closed test with at least 12
  testers for 14 days before production.
- After merging, run `supabase db push` (migration 0003) and
  `supabase config push` (production redirect).
```

- [ ] **Step 7: Commit**

```bash
git add android/app/build.gradle android/.gitignore android/keystore.properties.example package.json supabase/config.toml docs/android.md
git commit -m "Sign release bundles with an untracked upload key and document the Play release"
```
