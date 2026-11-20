# Google Play release and CI/CD — design

Date: 2026-11-20

## Why

The developer account exists. Fanka should reach Google Play, and every later
release should go out from a git tag without manual Gradle work.

Success: a `vX.Y.Z` tag produces a signed AAB on Play's internal track and on a
GitHub Release; every push and PR runs typecheck, tests and a debug build.

## Constraints

- The Play Developer API cannot create an app. The app is created in the
  Console and the first AAB is uploaded by hand; CI takes over afterwards.
- New personal account: a closed test with at least 12 testers for 14 days
  before production access.
- Signing already reads `FANKA_KEYSTORE_FILE`, `FANKA_KEYSTORE_PASSWORD`,
  `FANKA_KEY_ALIAS`, `FANKA_KEY_PASSWORD` (`android/app/build.gradle`).
- `versionCode` comes from `package.json` through `scripts/version-code.mjs`.
- Secrets (keystore, passwords, service account JSON) never enter the repo.

## Approaches

- **GitHub Actions + `r0adkll/upload-google-play`** — picked. No Ruby, one step,
  supports tracks and release status.
- fastlane `supply` — also manages listing metadata, but adds Ruby/Bundler and
  a Fastfile for a single upload.
- Gradle Play Publisher plugin — ties publishing to the Gradle build and its
  plugin upgrades; harder to reason about in CI.

## Design

- `.github/workflows/ci.yml` — on push to `main` and on PRs: `npm ci`,
  `npm run typecheck`, `npm test`, `npm run android:sync`, `assembleDebug`.
- `.github/workflows/release.yml` — on tag `v*.*.*`, and `workflow_dispatch`
  with a `track` input (internal by default; alpha = closed test, production):
  checks the tag matches `package.json`, decodes the keystore from a base64
  secret, builds `bundleRelease`, uploads to Play, attaches the AAB to a GitHub
  Release.
- Secrets: `FANKA_KEYSTORE_BASE64`, `FANKA_KEYSTORE_PASSWORD`,
  `FANKA_KEY_ALIAS`, `FANKA_KEY_PASSWORD`, `PLAY_SERVICE_ACCOUNT_JSON`, and the
  two public Supabase values the web bundle needs at build time.
- Upload key generated locally at `~/.android/fanka-upload.jks`, passwords in
  `android/keystore.properties` (untracked); the developer backs both up.
- `docs/play-store.md` — the Console walkthrough (app creation, service
  account, first upload, testers) and the listing copy, data safety and
  content rating answers.
- `store/` — 512 px icon and 1024×500 feature graphic generated from
  `assets/logo.png`.

## Left to the builder

Action versions, caching, and the exact graphic layout (brand primary
`#6562F8`, the 繁 mark).
