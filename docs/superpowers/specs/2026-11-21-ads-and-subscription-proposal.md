# Ads and a paid subscription — proposal

Date: 2026-11-21. Status: **proposal, not approved.** Project 2 of 3 in the
public-release work; it starts once the curriculum (project 1) ships. Every
choice below is open for the developer to change.

## What it should achieve

Fanka becomes a public app with real costs (Supabase, Vercel, Play fees) and
weeks of content work. Revenue should come from learners who get the most out
of it, without making the free app feel crippled or hostile. The anti-goals:

- Ads inside a review or an exercise, or anything that breaks concentration
  mid-task.
- Paywalling something a current user already has for free (their decks,
  import, reviews, writing).
- Dark patterns: a trial that renews silently, a hidden cancel, a paywall on
  launch.

## Three models

| | A. Free + ads, Plus removes ads (recommended base) | B. Free levels, Plus unlocks the rest (recommended on top of A) | C. Ads only |
|---|---|---|---|
| Free | Everything, with ads at natural breaks | Levels 1–3 of the bundle, all reviews, own decks | Everything, with ads |
| Paid | No ads, sync, full statistics | All levels, no ads, sync, full statistics | — |
| Revenue | Low per user, scales with audience | Higher conversion (HelloChinese works this way) | Lowest |
| Risk | Ads must stay unobtrusive | Learners hit a wall at level 4 | Feels cheap |

**Recommendation: A + B.** Free covers HSK 1–3 / Taiwan 1–3, which is about
1,000–1,300 words and months of study, plus every review, writing, the
learner's own decks and import. Fanka Plus unlocks levels 4 and up, removes
ads, and adds sync across devices and full statistics. Data licences allow
this: TBCL (CC BY) and the HSK list (MIT) permit commercial use; CC-CEDICT
meanings are CC BY-SA 4.0, so the meaning data stays under that licence (a
paywall is allowed; the attribution and licence are already on /licences).

## Price

Comparable: HelloChinese Premium is about $11.99 a month or $69.99 a year in
the US (2026 store listings). Fanka is narrower (no video, no speech grading).

- **Fanka Plus: $4.99 a month, $34.99 a year**, 7-day free trial on the yearly
  plan only, Play's regional pricing for other countries.
- No lifetime plan at launch (it caps revenue from the most engaged learners
  and complicates the sync cost); reconsider after six months of data.

Play takes about 15% on subscriptions through Play Billing (10% service + 5%
billing in the 2026 fee structure; verify in Play Console).

## Ads

- **Interstitial after a lesson's summary**, at most one per 10 minutes and
  never in the first 3 lessons of an install. Never during discovery,
  exercises, reviews or writing.
- **Rewarded ad, optional**: on a locked level-4+ lesson, "Watch an ad to
  unlock this lesson today" — lets free learners sample Plus content.
- **No banners.** They shrink an already dense phone layout.
- **Web: no ads.** The web build stays ad-free (it is also the privacy and
  account-deletion host).

Consent: AdMob requires Google's UMP consent form for the EEA and UK. The
consent flow runs before `AdMob.initialize`, offers non-personalised ads on
refusal, and Settings › Account gets "Ad privacy choices" (UMP's privacy
options form).

## How it is built

- **Purchases: RevenueCat** (`@revenuecat/purchases-capacitor`) on top of Play
  Billing. It validates receipts, handles renewals, grace periods and refunds,
  and sends webhooks. Alternative without a third party: a Capacitor billing
  plugin plus a Supabase Edge Function that verifies purchases with the Play
  Developer API (more work, no extra vendor). Check that the chosen plugin
  ships Play Billing Library 8 or later: version 7 is blocked for new uploads
  after 31 August 2026.
- **Entitlement:** one `plus` entitlement. RevenueCat's webhook writes
  `profiles.plus_until` in Supabase, so a signed-in learner keeps Plus on the
  web and on a second device. Offline, the last known entitlement holds for 7
  days.
- **Ads: `@capacitor-community/admob` v8** (Capacitor 8), with the UMP bridge
  it documents, or Capawesome's AdMob plugin, which wraps UMP in one call.
- **Gating in code:** one composable, `usePlus()`, returning `isPlus`,
  `canOpen(levelRef)`, `shouldShowInterstitial(now)`. Pages never check
  purchases directly. `core/curriculum` stays unaware of money.
- **Paywall screen:** `/plus`, reached from a locked lesson, Settings and
  About; states price, renewal, trial terms and "Cancel anytime in Google
  Play" with a direct link to Play's subscription page.

## Store and legal changes

- Play Console: "Contains ads" = yes; in-app products; Data safety adds
  Device or other IDs (advertising ID) collected and shared with Google
  AdMob for advertising, and purchase history for app functionality.
- `AndroidManifest.xml`: the `com.google.android.gms.permission.AD_ID`
  permission (AdMob adds it; keep it).
- Privacy policy and listing: today they say "no ads, no tracking"; both
  change before the first build with ads, and the listing names what is free.
- Target audience stays 18+, which keeps the Families ads policy out of scope.

## Delivery, once approved

1. Entitlement and paywall (RevenueCat, `usePlus`, `/plus`, level gate,
   Supabase `plus_until`), shipped to the internal track with test purchases.
2. Ads with consent (interstitial, rewarded unlock, UMP, settings entry).
3. Store, privacy and listing updates; closed test; production.

## Open questions for the developer

1. A + B as proposed, or A only (nothing locked, Plus just removes ads and
   adds sync)?
2. Where the free line sits: levels 1–3, or 1–2?
3. Price: $4.99 / $34.99, or closer to HelloChinese?
4. RevenueCat (faster, a vendor) or own verification on Supabase (no vendor)?
