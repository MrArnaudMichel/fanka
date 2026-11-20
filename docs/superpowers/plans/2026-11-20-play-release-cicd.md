# Google Play release and CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag `vX.Y.Z` → signed AAB on Play's internal track and a GitHub Release; every push/PR is checked.

**Architecture:** Two GitHub Actions workflows. CI runs typecheck, vitest and a debug build. Release reuses the existing Gradle signing (`FANKA_*` env vars) and uploads with `r0adkll/upload-google-play`.

**Tech Stack:** GitHub Actions, Node 22, Temurin JDK 21, Android SDK (preinstalled on `ubuntu-latest`), Gradle wrapper.

**Spec:** `docs/superpowers/specs/2026-11-20-play-release-cicd-design.md`

## Global Constraints

- Secrets never committed: `*.jks`, `keystore.properties`, service account JSON.
- Secret names: `FANKA_KEYSTORE_BASE64`, `FANKA_KEYSTORE_PASSWORD`, `FANKA_KEY_ALIAS`, `FANKA_KEY_PASSWORD`, `PLAY_SERVICE_ACCOUNT_JSON`, `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_ANON_KEY`.
- Package name `fr.arnaudmichel.fanka`. Default track `internal`.
- Commits authored by Arnaud Michel alone, no AI trailer.
- All copy English, sentence case, no emoji.

## Review Focus

- Tag that doesn't match `package.json` version → release job fails before building.
- First run before the app exists in Play → upload step fails with Play's error; documented in `docs/play-store.md`.
- Missing Supabase secrets → bundle still builds (empty runtime config), sign-in disabled; release job fails fast instead.
- Keystore base64 with line breaks → `base64 -d` must tolerate them (`base64 -w0` when encoding).
- Re-running a tag whose versionCode is already on Play → Play rejects; doc says bump the version.

---

### Task 1: CI workflow

**Files:** Create `.github/workflows/ci.yml`

- [ ] Triggers: `push` on `main`, `pull_request`. Concurrency group per ref, cancel in progress.
- [ ] Steps: checkout, setup-node 22 with npm cache, `npm ci`, `npm run typecheck`, `npm test`, setup-java temurin 21, `npm run android:sync`, `cd android && ./gradlew assembleDebug`, upload the debug APK as an artifact (7 days).
- [ ] Verify locally: `npm run typecheck && npm test` pass; `actionlint` (via `npx`/docker if available) reports nothing.
- [ ] Commit.

### Task 2: Release workflow

**Files:** Create `.github/workflows/release.yml`

- [ ] Triggers: `push` tags `v*.*.*`; `workflow_dispatch` with `track` choice (`internal`, `alpha`, `beta`, `production`; default `internal`) and `status` choice (`completed`, `draft`; default `completed`).
- [ ] Guard: on a tag, fail unless `v$(node -p "require('./package.json').version")` equals `$GITHUB_REF_NAME`. Fail if any required secret is empty.
- [ ] Decode `FANKA_KEYSTORE_BASE64` into `$RUNNER_TEMP/upload.jks`; export `FANKA_KEYSTORE_FILE` and the three password/alias secrets; `npm run android:bundle`.
- [ ] Upload `android/app/build/outputs/bundle/release/app-release.aab` with `r0adkll/upload-google-play@v1` (`serviceAccountJsonPlainText`, `packageName`, `track`, `status`).
- [ ] On a tag: `softprops/action-gh-release@v2` attaching the AAB, generated notes. Permissions: `contents: write`.
- [ ] Verify: `actionlint` clean. Commit.

### Task 3: Upload key and local signing

- [ ] Generate `~/.android/fanka-upload.jks` (alias `fanka-upload`, RSA 2048, 10000 days) with a random 32-char password (same for store and key).
- [ ] Write `android/keystore.properties`; confirm `git status` doesn't list it.
- [ ] `npm run android:bundle` succeeds; `jarsigner -verify` on the AAB reports signed by `fanka-upload`.
- [ ] With the developer's go-ahead: `gh secret set` for the four keystore secrets and the two Supabase values from `.env`.

### Task 4: Store assets and the Console walkthrough

**Files:** Create `store/icon-512.png`, `store/feature-graphic.png`, `scripts/build-store-graphics.mjs`, `docs/play-store.md`; modify `docs/android.md` (link to it, CI section).

- [ ] Graphics from `assets/logo.png` on `#6562F8`: 512×512 PNG (32-bit), 1024×500 PNG/JPEG without alpha. Use `@capacitor/assets`' bundled `sharp`.
- [ ] `docs/play-store.md`: Console app creation, store listing copy (title, short ≤ 80 chars, full ≤ 4000), data safety answers, content rating answers, service account setup, first manual upload, closed test with 12 testers / 14 days, day-to-day release (`npm version patch && git push --follow-tags`), promoting tracks.
- [ ] Commit.
