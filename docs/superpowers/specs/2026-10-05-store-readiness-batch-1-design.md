# Store readiness, batch 1 — design

Date: 2026-10-05

## Why

Fanka is to be published on Google Play. Four things block it:

- Google requires in-app account deletion, plus a public web page that
  explains how to delete an account, for any app that lets users create one.
  Account (`app/pages/settings/account.vue`) only offers Sign out.
- Google requires a public privacy policy URL. None exists.
- `hanzi-writer-data` (Make Me a Hanzi) ships under the Arphic Public License
  and LGPL, which require the licence to be shown. Nothing credits it.
- Play only accepts a signed Android App Bundle. Only `assembleDebug` is
  scripted, `versionCode` is hard-coded to 1, and `android/.gitignore` leaves
  `*.jks` / `*.keystore` commented out, so a keystore would be committed.

Success: every URL and file the Play Console asks for in this batch exists —
privacy policy URL, account deletion URL, a signed AAB — and the in-app
deletion works end to end.

## Decisions

- Public domain: `https://fanka.arnaudmichel.fr` (Vercel).
- Public contact: `contact@arnaudmichel.fr`.
- Deleting the account keeps the decks, cards and reviews on the device; the
  learner is signed out and carries on offline, as before signing in.
- Account deletion is a `security definer` SQL function, not an Edge Function.
- Play App Signing: Google holds the app signing key; the developer keeps only
  an upload key.

## RLS audit (done while designing)

`supabase/migrations/0001_init.sql` and `0002_attempts.sql`: all six tables
(`decks`, `cards`, `items`, `reviews`, `settings`, `attempts`) enable RLS, have
select / insert / update policies on `auth.uid() = user_id` (insert-only for
`reviews` and `attempts`), no delete policy, and `user_id … references
auth.users (id) on delete cascade`. No gap. Deleting the `auth.users` row
removes every row the learner owns.

## Delivery

Three phases, each its own series of commits, in this order:

1. Account deletion
2. Privacy, account deletion and licences pages
3. Signed release build

## Phase 1 — Account deletion

### Database

`supabase/migrations/0003_delete_account.sql`:

```sql
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

The cascades remove the six tables' rows. `auth.uid()` is null for an anonymous
caller, so the delete matches nothing even if the grant were wrong.

### Client

`useAuth().deleteAccount(): Promise<boolean>`, in `app/composables/useAuth.ts`:

1. `client.rpc('delete_my_account')`. On error: set `error`, return `false`,
   change nothing locally.
2. `client.auth.signOut({ scope: 'local' })` — the server-side session is gone
   with the user, so only the local one is cleared.
3. Clear the sync cursor (`lastPulledAt`, `core/sync/engine.ts`) and the
   outbox, through a function in `core/db` (pages and composables never write
   Dexie tables inline). Both pointed at the deleted account.
4. Return `true`.

It never throws, matching `signIn` / `signOut`.

### UI

In `settings/account.vue`, signed in only, below the Sign out form:
a "Delete account" form with a danger `kt-button`. It opens a
`kt-confirm-dialog`, `variant="danger"` (as `UnsavedChangesDialog` does):

- Heading: "Delete your account?"
- Message: "Your account and everything synced to it are deleted. The decks
  and cards on this device stay."
- Confirm: "Delete account"; cancel: "Cancel".

While the call runs the button is disabled. Success: toast "Account deleted".
Failure: toast "Couldn't delete your account" with `error` as description.
Offline (`navigator.onLine === false`): the button is disabled with the hint
"Connect to the internet to delete your account."

### Tests

- `deleteAccount` with a mocked Supabase client: success clears session,
  cursor and outbox; RPC failure leaves all three untouched and sets `error`.
- Account page: the block shows only when signed in; confirm calls
  `deleteAccount`; cancel does not.

### Out of scope

Re-pushing every local row to a new account after signing in again. The same
gap exists today when signing out and into another account; it goes to
`docs/deferred-minors.md`.

## Phase 2 — Privacy, account deletion and licences pages

### Routes and layout

- `/privacy`, `/delete-account`, `/licences`, each with
  `definePageMeta({ layout: 'legal' })`.
- `app/layouts/legal.vue`: no sidebar; the logo, a readable text column and a
  "Back to Fanka" link to `/`.
- Settings › About gets three links to them.
- English, sentence case, Kanto tokens only. Check Kanto components before any
  native element; any native element gets an entry in
  `test/integrity/native-elements.allowlist.ts`.
- Rendered client-side like the rest of the SPA; no prerendering.

### `/privacy`

Facts the code makes true, short:

- Without an account, everything stays on the device (IndexedDB); nothing is
  sent anywhere.
- With an account: the email address (for the sign-in link) and decks, cards,
  review history, writing attempts and settings are stored with Supabase, in
  the project's region (read from the Supabase dashboard when writing the page).
- Pronunciation uses the device's own speech engine. Reminders are local
  notifications.
- No ads, no analytics, no tracking, no sale or sharing of data.
- Kept until the account is deleted.
- Rights: access, export (Settings › Data › Export backup), deletion
  (`/delete-account`). Contact `contact@arnaudmichel.fr`.
- "Last updated" date.

### `/delete-account`

- App name (Fanka) and developer (Arnaud Michel).
- In the app: Settings › Account › Delete account.
- Without the app: email `contact@arnaudmichel.fr` from the account's address;
  handled within 30 days.
- Deleted: everything stored with Supabase. Kept: the data on the device, which
  Settings › Data › Reset clears.

### `/licences`

- Source of truth: `app/utils/licences.ts`, a hand-written list of
  `{ name, licence, url, notice? }`.
- Data first: Make Me a Hanzi via `hanzi-writer-data` (Arphic Public License
  and LGPL, with the APL text included), `opencc-data` (Apache 2.0).
- Then every production dependency in `package.json` with its licence.
- Integrity test: fails when a `dependencies` entry in `package.json` has no
  entry in the list, or when the list names a package that is no longer a
  dependency (data packages from `devDependencies` are allowed explicitly).

### Tests

- Each page renders its heading and the contact address where relevant.
- About links to the three routes.
- The licences integrity test.

## Phase 3 — Signed release build

### Version

- `package.json`'s `version` stays the single source. About already reads it.
- `scripts/version-code.mjs`: `x.y.z` → `x * 10000 + y * 100 + z`. Rejects a
  pre-release suffix and any of `y`, `z` above 99. Prints the code when run
  with `node`; exports the function for tests.
- `android/app/build.gradle` sets `versionName` from `package.json` and
  `versionCode` from `node ../../scripts/version-code.mjs`, so the rule lives
  in one place.

### Signing

- `android/keystore.properties` (`storeFile`, `storePassword`, `keyAlias`,
  `keyPassword`), not committed; `android/keystore.properties.example` is.
  The `FANKA_KEYSTORE_FILE`, `FANKA_KEYSTORE_PASSWORD`, `FANKA_KEY_ALIAS` and
  `FANKA_KEY_PASSWORD` environment variables take precedence, for a later CI.
- A `release` signing config only when credentials are present. A release
  task without them fails with a message naming the file and variables. Debug
  builds are unchanged.
- The keystore lives outside the repository (e.g. `~/.android/fanka-upload.jks`).
- `android/.gitignore`: uncomment `*.jks` and `*.keystore`, add
  `keystore.properties`.

### Scripts

- `android:bundle`: `android:sync`, then `./gradlew bundleRelease`; output
  `android/app/build/outputs/bundle/release/app-release.aab`.
- `android:keystore`: prints the `keytool -genkeypair` command to run by hand.
  It never generates the key itself.

### Production auth redirect

`supabase/config.toml`: `site_url = "https://fanka.arnaudmichel.fr"`, and the
domain added to `additional_redirect_urls`. `supabase config push` is run by
the developer.

### Documentation

`docs/android.md` gains a "Release" section: create and back up the upload
key, bump the version (`npm version patch|minor`), build the AAB, upload it.
Then a Play Console checklist: privacy policy URL, account deletion URL, Data
safety answers (email collected, study data stored for sync, nothing shared,
deletion available), content rating, store listing, closed test with 12
testers for 14 days.

### Tests

- `version-code.mjs`: `1.0.0` → `10000`, `1.2.3` → `10203`, rejects
  `1.2.3-beta`, `1.100.0`, `1.2`.
- Manual: `bundleRelease` signed with a throwaway keystore produces an AAB;
  `assembleDebug` still works without any keystore.

### Out of scope

R8 / minify, CI, verified App Links: batch 2.
