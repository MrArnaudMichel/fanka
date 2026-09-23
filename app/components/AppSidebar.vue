<script setup lang="ts">
import type { KtNavItem, KtNavSection } from 'kanto-ui';

defineProps<{ sections: KtNavSection[]; dueTotal: number }>();
const route = useRoute();

/**
 * `kt-sub-menu-navigation` matches `activeHref` by exact equality against an
 * item's `href` (kt-sub-menu-navigation.ts's `isActive`), so the deck detail
 * page's `/decks/:id` would otherwise light up nothing at all. Map any
 * `/decks/...` path back to `/decks` so the "Decks" entry stays highlighted
 * there (ruling 8, task-13-report.md) — this never touches kt-sub-menu-navigation
 * itself.
 */
const activeHref = computed(() => (route.path.startsWith('/decks/') ? '/decks' : route.path));

/**
 * `kt-navigate` is cancelable specifically so a host can take over routing —
 * without `preventDefault()` the element's own `<a href>` would perform a
 * full page navigation.
 */
function onNavigate(event: CustomEvent<{ item: KtNavItem }>): void {
  event.preventDefault();
  if (event.detail.item.href) navigateTo(event.detail.item.href);
}
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <span class="mark" aria-hidden="true">繁</span>
      <span class="wordmark">
        <span class="name">FANKA</span>
        <span class="tagline">Traditional Chinese</span>
      </span>
    </div>

    <!--
      Secondary, not primary: every page already carries its own primary
      action (Start session, Show answer, Back to today), and a screen gets
      exactly one. Disabled with its reason as the accessible name when
      nothing is due, the same treatment as the Today page's Start session.
    -->
    <kt-button
      variant="secondary"
      size="medium"
      icon="play"
      full-width
      :disabled="dueTotal === 0"
      :label="dueTotal === 0 ? 'Today\'s session — nothing due right now' : ''"
      @click="navigateTo('/review')"
    >
      Today's session · {{ dueTotal }}
    </kt-button>

    <kt-sub-menu-navigation flush :sections="sections" :active-href="activeHref" @kt-navigate="onNavigate" />
  </aside>
</template>

<style scoped>
.sidebar {
  width: 252px;
  flex: 0 0 252px;
  border-right: var(--border-width) solid var(--border-subtle);
  background: var(--surface-card);
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 20px 16px;
  position: sticky;
  top: 0;
  height: 100vh;
}

/* kt-header takes over below its own breakpoint (900px); the two are never
   shown at once. */
@media (max-width: 899px) {
  .sidebar {
    display: none;
  }
}

.brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px; }

.mark {
  width: 32px;
  height: 32px;
  border-radius: var(--border-radius);
  background: var(--color-primary-base);
  display: grid;
  place-items: center;
  font-family: var(--fk-font-hanzi-serif);
  font-size: 19px;
  color: var(--color-white);
}

.wordmark { display: flex; flex-direction: column; }
.name { font: var(--font-title-h6); letter-spacing: 4px; color: var(--text-body); }
.tagline { font: var(--font-normal-small); color: var(--text-muted); }
</style>
