# Android packaging

Fanka ships as an offline Android app via [Capacitor](https://capacitorjs.com/):
the static `.output/public` bundle (Nuxt with `ssr: false`, Dexie/IndexedDB
storage) is copied into a WebView inside a thin native shell. There is no
`server.url` in `capacitor.config.ts` — the app never loads over the network,
on-device or from a dev machine.

- App ID: `fr.arnaudmichel.fanka`
- App name / label: Fanka

## Prerequisites

- **Android SDK**, with `ANDROID_HOME` set (platform-tools, at least one
  `android-3x` platform, and a matching build-tools version).
- **A JDK Gradle's own Groovy build scripts can run on.** Gradle 8.14.3
  (this project's wrapper version) launches fine on newer JDKs, but its
  Groovy layer cannot compile `build.gradle` on JDK 24/25 bytecode
  (`Unsupported class file major version 69`). This is handled already:
  `android/settings.gradle` applies the `foojay-resolver-convention`
  plugin and `android/gradle/gradle-daemon-jvm.properties` pins the
  daemon to JDK 21 — Gradle downloads that JDK itself (into
  `~/.gradle/jdks`) the first time it's needed, independent of whatever
  `JAVA_HOME`/system JDK is installed. No local JDK install or `JAVA_HOME`
  override is required; just be online for that first run so it can fetch
  the JDK (and the Gradle distribution, and AGP, the first time).
- Node ≥ 20 (per `package.json`'s `engines`), with `npm install` already run.

## Build commands

    npm run android:sync   # nuxt generate + cap sync android (copies the web bundle in)
    npm run android:build  # ./gradlew assembleDebug
    npm run android        # both of the above, in order

The debug APK lands at:

    android/app/build/outputs/apk/debug/app-debug.apk

Other scripts:

    npm run android:run    # gradlew installDebug + launch on a connected/emulated device
    npm run android:open   # opens the project in Android Studio

## Installing on a phone over USB

1. Enable Developer options and USB debugging on the phone, plug it in, and
   accept the "Allow USB debugging" prompt.
2. Confirm it's visible: `adb devices`
3. Install (replacing any previous install of the same app ID):

       adb install -r android/app/build/outputs/apk/debug/app-debug.apk

   (`npm run android:run` does the equivalent, plus launches the app, but
   needs a device already attached — it was not verified against a real
   device while building this, since none was plugged in.)

## Installing over Wi-Fi from `npm run dev`

`npm run dev` (now `nuxt dev --host`, so the dev server listens on every
network interface, not just `localhost`) adds an `/install` page — reachable
from the sidebar's "Development" section, dev only — with a QR code and a
link to the most recently built debug APK
(`android/app/build/outputs/apk/debug/app-debug.apk`), its size and build
time, and the `adb install -r …` command as a USB alternative. Scan the code
with the phone's camera while it's on the same Wi-Fi as the dev machine, then
allow installs from that source when Android asks. The page, its QR code and
the APK-serving routes are wired up in `modules/dev-install.ts` and
`server/dev/`, and exist only under `npm run dev` — none of it is reachable
from `npm run build`, `npm run build:app`, or the Android app itself.

## What's wired up for the WebView

- **Status bar clearance**: `viewport-fit=cover` (`nuxt.config.ts`) plus
  `env(safe-area-inset-*)` padding in `app/layouts/default.vue` and
  `app/assets/css/fanka.css`, for Android 15+'s enforced edge-to-edge
  layout (targetSdk 36 here).
- **Hardware/gesture Back button**: `app/plugins/back-button.client.ts`
  uses `@capacitor/app`'s `backButton` event to navigate back within the
  app, and only exits at the root route (`/`, Today).
- **Text selection**: UI chrome has `user-select: none` and no long-press
  callout; card content is selectable again via the `.fk-selectable` class
  (`ReviewCard.vue`'s `.face`, `CardDetailPanel.vue`'s `.fields`). Browse's
  table cells are not covered — see gaps below.
- **Overscroll**: `overscroll-behavior-y: contain` on `html` in
  `fanka.css` disables the rubber-band pull-to-refresh/navigate gesture.

## App icon / splash

The mark is a flashcard mid-flip, F on the back, 繁 on the front, on Kanto's
dark page colour. Its geometry lives in `app/utils/brandMark.ts`, shared by
`BrandMark.vue` (in-app, coloured with CSS tokens) and
`scripts/build-brand.mjs`, which resolves the same Kanto tokens from
`node_modules/kanto-ds/dist/tokens` and writes every image:

    node scripts/build-brand.mjs                # store/, assets/, favicon, launcher colour
    npx capacitor-assets generate --android     # every density from assets/

- `assets/icon-only.png`: the legacy launcher icon (below Android 8).
- `assets/icon-foreground.png` and `icon-background.png`: the adaptive icon;
  `mipmap-anydpi-v26` insets the foreground 16.7%, which keeps the cards
  inside a round mask.
- `assets/splash.png`, `splash-dark.png`: the pre-Android 12 splash.
- `values/ic_launcher_background.xml`: the brand colour, also the Android 12+
  splash background (`windowSplashScreenBackground` in `styles.xml`).
- `public/favicon.ico`, `store/icon-512.png`, `store/feature-graphic.png`.

The script rasterises text, so it needs Manrope and Noto Serif CJK TC
installed. Its output is committed; CI never runs it.

## Known gaps

- **Not installed on a real device.** No phone was attached in this
  environment; the APK was built and its Gradle output inspected
  (`aapt dump badging`: app ID, label, min/target SDK all correct) but
  Today/Review/Decks/deck detail/Browse/card editor/Import were not
  clicked through on-device or in an emulator. Install it and smoke-test
  each of those before relying on this build.
- **`env(safe-area-inset-top)` on the sticky mobile header** relies on the
  header's own shadow-DOM `position: sticky; top: 0`; the padding is
  applied to the host element from outside (not touching Kanto). This is
  untested on an actual notched/edge-to-edge device — verify the header
  isn't drawn under the status bar and doesn't jump on scroll.
- **Back button** exits the app from any route matching exactly `/`; it
  does not consult in-page state (e.g. an open modal). Closing a modal
  with Back first is not implemented — a minor, not chased here.
- **Browse's card table** (`CardTable.vue`) renders hanzi/translation
  cells inside a Kanto `kt-table` custom element; `.fk-selectable` was not
  threaded through it, so table text stays unselectable. Opening a row's
  detail panel (`CardDetailPanel.vue`) is selectable.
- **No release signing / release build** — only `assembleDebug` was
  requested and built. A Play-ready release build needs a keystore and
  signing config, not set up here.

## Release

Day to day, a `vX.Y.Z` tag ships through CI: see `docs/play-store.md` for the
workflow, the secrets and the Play Console walkthrough. The steps below are
the local equivalent.

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

Without an upload key, `bundleRelease` stops with "No upload key"; debug
builds never need one. CI sets `FANKA_KEYSTORE_FILE`,
`FANKA_KEYSTORE_PASSWORD`, `FANKA_KEY_ALIAS` and `FANKA_KEY_PASSWORD` instead
of the properties file (`.github/workflows/release.yml`).

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
