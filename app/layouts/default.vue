<script setup lang="ts">
import type { KtHeader, KtNavItem } from 'kanto-ui';
import { useDueCounts } from '~/composables/useDueCounts';
import { useNavigation } from '~/composables/useNavigation';

const { counts } = useDueCounts();
const { sections } = useNavigation(counts);
const reviewTotal = computed(() => counts.value.review.total);
const route = useRoute();

const header = ref<KtHeader>();
const menu = ref<HTMLElement | null>(null);
const main = ref<HTMLElement | null>(null);

// Same mapping as AppSidebar.vue's `activeHref` — kept here too so the
// mobile menu's "Decks" entry stays highlighted on `/decks/:id` the same way
// the desktop sidebar's does (ruling 8, task-13-report.md).
const activeHref = computed(() => (route.path.startsWith('/decks/') ? '/decks' : route.path));

/**
 * `kt-navigate` is cancelable specifically so a host can take over routing —
 * without `preventDefault()` the element's own `<a href>` would perform a
 * full page navigation. The collapsed menu panel then closes itself, the
 * same way choosing a link in any mobile nav does.
 *
 * Closing it hides the link that had focus, so focus would fall to
 * `<body>`. Once the navigation resolves, `main` takes it instead — but
 * only while focus is still unclaimed (on `<body>`, on the header, or in
 * the closed menu), the same rule `useFocusWhenEnabled` follows, so a page
 * that moves focus itself on mount is never overridden.
 */
async function onNavigate(event: CustomEvent<{ item: KtNavItem }>): Promise<void> {
  event.preventDefault();
  const href = event.detail.item.href;
  header.value?.closeMenu();
  if (!href) return;
  await navigateTo(href);
  await nextTick();
  const active = document.activeElement;
  const unclaimed = !active || active === document.body || active === header.value || Boolean(menu.value?.contains(active));
  if (unclaimed) main.value?.focus({ preventScroll: true });
}
</script>

<template>
  <div class="shell">
    <AppSidebar :sections="sections" :due-total="reviewTotal" />

    <kt-header ref="header" class="mobile-header" sticky label="Fanka">
      <span slot="brand" class="brand">
        <span class="mark" aria-hidden="true">繁</span>
        <span class="name">FANKA</span>
      </span>

      <!--
        Nothing in `actions` on a phone: the brand and the menu button are
        all the bar has room for. The Today page's Start buttons take the
        sidebar button's place.
      -->

      <kt-sub-menu-navigation ref="menu" slot="menu" flush :sections="sections" :active-href="activeHref" @kt-navigate="onNavigate" />
    </kt-header>

    <!-- tabindex="-1": focusable by script only (see onNavigate), never a tab stop. -->
    <main ref="main" class="main" tabindex="-1">
      <div class="page">
        <slot />
      </div>
    </main>

    <kt-toast-container></kt-toast-container>
  </div>
</template>

<style scoped>
/*
 * Column by default: below the 900px breakpoint, AppSidebar is hidden and
 * `kt-header` (full-width, on top) plus `main` (below it) are the only two
 * children left, and they need to stack, not sit side by side. Row only
 * from 900px up, where AppSidebar becomes the visible flex item beside
 * `main` and `kt-header` contributes nothing (`display: none` below).
 * `.shell` being a row at *every* width — the previous rule — is what let
 * `kt-header` and `main` sit side by side under 900px, each squeezed into a
 * sliver of the viewport and pushing the page wider than it (verified: `/`
 * and `/decks` both overflowed at 360/500px, and their own `<h1>`s came out
 * with a zero-size box — narrow enough to not register as "visible" at all).
 */
.shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--surface-page);
  color: var(--text-body);
  /* Landscape/notch clearance on Android's edge-to-edge WebView (a no-op
     everywhere else — these resolve to 0 without a WebView inset). */
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
@media (min-width: 900px) {
  .shell { flex-direction: row; }
}
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.page { flex: 1; min-width: 0; padding: 24px; padding-bottom: calc(24px + env(safe-area-inset-bottom)); max-width: 1240px; width: 100%; margin: 0 auto; }

/* AppSidebar takes over above kt-header's own collapse breakpoint (900px);
   the two are never shown at once. */
.mobile-header { display: none; }
@media (max-width: 899px) {
  .mobile-header {
    display: block;
    /* Keeps the sticky header's content clear of the status bar: the host
       element itself sticks at `top: 0` (kt-header's own shadow style), so
       this padding becomes blank space under the status bar rather than
       shifting the sticky position. */
    padding-top: env(safe-area-inset-top);
  }
  /*
    kt-header's bar is a three-column grid sized for brand · nav · actions.
    Below its breakpoint the nav column is hidden, so the brand, the
    actions and the menu button shift into those three columns instead —
    the menu button ends up in the middle one, not flush right. Two columns
    here: the brand takes the space, the menu button sits at the end.
    Logged in docs/deferred-minors.md for a fix in Kanto itself.
  */
  .mobile-header::part(bar) {
    grid-template-columns: minmax(0, 1fr) auto auto;
  }
}

.brand { display: flex; align-items: center; gap: 8px; font: var(--font-title-h6); letter-spacing: 4px; color: var(--text-body); }

.mark {
  width: 24px;
  height: 24px;
  border-radius: var(--border-radius);
  background: var(--color-primary-base);
  display: grid;
  place-items: center;
  font-family: var(--fk-font-hanzi-serif);
  font-size: 14px;
  color: var(--color-white);
}
</style>
