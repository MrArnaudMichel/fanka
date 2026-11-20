# Google Play

How Fanka gets onto Google Play and how each release ships. The build side
(signing, versions) is in `docs/android.md`.

## How a release ships

    npm version patch          # or minor; commits and tags vX.Y.Z
    git push --follow-tags

The tag starts `.github/workflows/release.yml`. It checks the tag matches
`package.json`, runs the tests, builds the signed AAB, uploads it to Play's
**internal** track and attaches it to a GitHub Release.

To send a build to another track, run **Release** by hand in GitHub › Actions
and choose the track: `alpha` is the closed test, `production` is production.
Promoting an existing release in the Play Console works too.

Play refuses a `versionCode` it has already seen. If a release run fails after
the upload, bump the version and tag again rather than re-running.

`.github/workflows/ci.yml` runs typecheck, tests and a debug APK on every push
to `main` and every pull request.

## GitHub secrets

Settings › Secrets and variables › Actions, repository secrets:

| Secret | Value |
|---|---|
| `FANKA_KEYSTORE_BASE64` | `base64 -w0 ~/.android/fanka-upload.jks` |
| `FANKA_KEYSTORE_PASSWORD` | `storePassword` in `android/keystore.properties` |
| `FANKA_KEY_ALIAS` | `fanka-upload` |
| `FANKA_KEY_PASSWORD` | `keyPassword` in `android/keystore.properties` |
| `PLAY_SERVICE_ACCOUNT_JSON` | the service account's JSON key, whole file |
| `NUXT_PUBLIC_SUPABASE_URL` | from `.env` |
| `NUXT_PUBLIC_SUPABASE_ANON_KEY` | from `.env` |

The release job runs in the `play` environment. Add a required reviewer there
(Settings › Environments › play) to approve each release by hand.

## The upload key

`~/.android/fanka-upload.jks`, alias `fanka-upload`, with its password in
`android/keystore.properties` (untracked). Keep a copy of both in a password
manager. Play App Signing holds the real signing key; if the upload key is
lost, Play Console › Test and release › App integrity › Request upload key
reset.

## First release, once

The Play API cannot create an app, so the first steps are by hand.

### 1. Create the app

Play Console › Create app:

- App name: Fanka
- Default language: English (United States) – en-US
- App or game: App
- Free or paid: Free
- Accept the declarations.

### 2. Set up the app (Dashboard › Set up your app)

- **Privacy policy:** https://fanka.arnaudmichel.fr/privacy
- **App access:** All functionality is available without special access.
  (Signing in is optional and only adds sync.)
- **Ads:** No, the app does not contain ads.
- **Content rating:** see below.
- **Target audience:** 18 and over (and 16–17 if wanted). Do not include
  under 13: that brings in the Families policy.
- **News app:** No.
- **Data safety:** see below.
- **Government app:** No. **Financial features:** none. **Health:** none.
- **App category:** Education. Contact email: contact@arnaudmichel.fr.
  Website: https://fanka.arnaudmichel.fr
- **Store listing:** see below.

### 3. Create the service account for CI

1. https://console.cloud.google.com › create a project (e.g. `fanka-play`).
2. APIs & Services › Library › **Google Play Android Developer API** › Enable.
3. IAM & Admin › Service accounts › Create: name `play-publisher`, no role.
4. On the account › Keys › Add key › JSON. Store the downloaded file in a
   password manager; it goes in `PLAY_SERVICE_ACCOUNT_JSON`, then delete the
   local copy.
5. Play Console › Users and permissions › Invite new users: the service
   account's email. App permissions › Fanka, with: View app information,
   Release apps to testing tracks, Release to production, exclude devices
   and use Play App Signing. Invite.

### 4. First upload, by hand

1. `npm run android:bundle` →
   `android/app/build/outputs/bundle/release/app-release.aab`.
2. Test and release › Testing › Internal testing › Create new release.
   Accept Play App Signing, upload the AAB, release name `1.0.0`, notes
   "First release". Save, review, roll out.
3. Testers tab: create an email list with your own address and open the
   opt-in link on the phone.

From here on the tag workflow uploads. If Play answers "Only releases with
status draft may be created on draft app", the app has not been through its
first review yet: run **Release** by hand with status `draft`, then roll it
out from the Console.

### 5. Closed test: 12 testers for 14 days

A new personal account needs a closed test with at least 12 testers opted in
for 14 days in a row before it can apply for production.

1. Test and release › Testing › Closed testing › Create track (or use
   `Alpha`). Countries: all.
2. Testers: an email list (or Google Group) of at least 12 people with Google
   accounts. Share the opt-in link; each one must accept and install.
3. Send a build: run **Release** by hand with track `alpha`, or promote the
   internal release.
4. After 14 days: Dashboard › Apply for production. Google asks how the test
   went; answer from what testers reported.
5. Once approved: run **Release** with track `production`, or promote.

## Store listing

**App name** (30): Fanka

**Short description** (80):

> Learn Traditional Chinese with spaced repetition, stroke order and audio.

**Full description** (4000):

> Fanka is a spaced-repetition app for Traditional Chinese.
>
> Review the cards that are due today, grade how well you remembered each one,
> and Fanka schedules the next review for when you are about to forget it.
>
> - Decks grouped by lesson, with characters, pinyin and translations
> - Writing practice with stroke order for every character
> - Speaking practice: answer discussion questions aloud, then hear a model
>   answer
> - The 80 most common radicals
> - Pronunciation with your device's own voice
> - Stats: retention, streak, forecast of upcoming reviews
> - Daily reminders
> - Import your own cards
>
> Fanka works offline. Without an account, everything stays on your phone. Sign
> in with your email to sync across devices; there are no ads, no tracking and
> no analytics.
>
> Traditional characters only.

**Graphics** (`store/`, rebuilt with `node scripts/build-store-graphics.mjs`):

- App icon: `store/icon-512.png`
- Feature graphic: `store/feature-graphic.png`
- Phone screenshots, 2 to 8, 9:16 or 16:9, at least 1080 px wide: take them on
  the phone (Today, Review with a card revealed, Writing, Decks, Stats).

## Data safety answers

- Does the app collect or share user data? **Yes, collects.**
- Is all data encrypted in transit? **Yes.**
- Can users request deletion? **Yes** —
  https://fanka.arnaudmichel.fr/delete-account
- Data types collected:
  - **Personal info › Email address** — collected, not shared; optional;
    purpose: Account management.
  - **App activity › Other user-generated content** (decks, cards, writing
    attempts) — collected, not shared; optional; purpose: App functionality.
  - **App activity › App interactions** (review history, settings) —
    collected, not shared; optional; purpose: App functionality.
- Collection is optional: every type above is collected only when the learner
  signs in.
- Not collected: location, contacts, photos, audio, device IDs, diagnostics,
  financial info.

## Content rating answers (IARC)

- Category: **All other app types** (reference, education).
- Violence, sexuality, language, controlled substances, gambling: **No** to
  all.
- Users interact or exchange content: **No**.
- Shares location: **No**. Digital purchases: **No**.

Expected result: Everyone / PEGI 3.
