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

Generated from `assets/logo.png` (the 繁 mark, Noto Serif CJK TC Bold, white
on transparent) via `@capacitor/assets` in Easy Mode, with the Kanto brand
primary colour (`#6562F8`) as the icon/splash background:

    npx capacitor-assets generate --android \
      --iconBackgroundColor '#6562F8' --iconBackgroundColorDark '#6562F8' \
      --splashBackgroundColor '#6562F8' --splashBackgroundColorDark '#6562F8'

This covers the adaptive icon (`mipmap-anydpi-v26`, what every Android 8+
device shows) and the splash screen. It does not touch the legacy flat
`ic_launcher.png` fallback used only below Android 8 — see gaps below.

## Known gaps

- **Not installed on a real device.** No phone was attached in this
  environment; the APK was built and its Gradle output inspected
  (`aapt dump badging`: app ID, label, min/target SDK all correct) but
  Today/Review/Decks/deck detail/Browse/card editor/Import were not
  clicked through on-device or in an emulator. Install it and smoke-test
  each of those before relying on this build.
- **Legacy (pre-Android 8) launcher icon** is the bare white 繁 glyph with
  a transparent background rather than the brand colour — only the
  adaptive icon (Android 8+, i.e. effectively every real device) got the
  purple background baked in. `minSdkVersion` is 24, so this only shows on
  Android 7.0/7.1, which is not worth chasing for a prototype.
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
