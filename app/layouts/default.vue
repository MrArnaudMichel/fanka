<script setup lang="ts">
import type { KtHeader, KtNavItem } from 'kanto-ds';
import { useDueCounts } from '~/composables/useDueCounts';
import { useCommands } from '~/composables/useCommands';
import { flatNavItems, navActiveHref, useNavigation } from '~/composables/useNavigation';

const { counts } = useDueCounts();
const { sections } = useNavigation(counts);
const { commands, run: runCommand, refreshDecks } = useCommands(sections);

/** Mirrors the palette's own state, so the sidebar's Search button can open it on a device without a keyboard. */
const paletteOpen = ref(false);
watch(paletteOpen, (open) => {
  if (open) void refreshDecks();
});

function onCommand(event: CustomEvent<{ id: string }>): void {
  void runCommand(event.detail.id);
}
const reviewTotal = computed(() => counts.value.review.total);
const route = useRoute();

/** The current page's nav label; "Fanka" for routes the menu does not list (e.g. /cards/:id). */
const pageTitle = computed(() => {
  const label = flatNavItems(sections.value).find((item) => item.href === activeHref.value)?.label;
  return label ?? (route.path === '/settings' ? 'Settings' : 'Fanka');
});

const header = ref<KtHeader>();
const menu = ref<HTMLElement | null>(null);
const main = ref<HTMLElement | null>(null);

const activeHref = computed(() => navActiveHref(route.path));

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
    <AppSidebar :sections="sections" :due-total="reviewTotal" @search="paletteOpen = true" />

    <kt-header ref="header" class="mobile-header" sticky label="Fanka">
      <span slot="brand" class="brand">
        <BrandMark size="small" />
        <span class="name">{{ pageTitle }}</span>
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

    <!-- Cmd/Ctrl+K from anywhere; `commands` is an array, so it goes in as a property. -->
    <kt-command-palette
      :commands="commands"
      :open="paletteOpen"
      placeholder="Go to a page or run an action"
      @kt-select="onCommand"
      @kt-open="paletteOpen = true"
      @kt-close="paletteOpen = false"
    />

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
  .mobile-header { display: block; }
  /*
    Keeps the bar clear of the status bar on Android's edge-to-edge WebView.
    The padding goes on the inner <header> (`base`), not on the host: the
    host is transparent, so padding there left a clear strip under the
    status bar through which scrolled content showed. `base` carries the
    header's translucent, blurred background, so the strip is blurred too.
  */
  .mobile-header::part(base) {
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

.brand { display: flex; align-items: center; gap: 8px; min-width: 0; font: var(--font-title-h6); color: var(--text-body); }
.brand .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
