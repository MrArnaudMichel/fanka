<script setup lang="ts">
import type { KtNavItem, KtNavSection } from 'kanto-ds';
import { useAuth } from '~/composables/useAuth';
import { navActiveHref } from '~/composables/useNavigation';

/** `dueTotal` is Review's: this button starts Review, not Writing. */
defineProps<{ sections: KtNavSection[]; dueTotal: number }>();
defineEmits<{ search: [] }>();
const route = useRoute();
const { user, displayName } = useAuth();

/** The palette's shortcut as this platform writes it; a wrong modifier is worse than none. */
const shortcut = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';

const activeHref = computed(() => navActiveHref(route.path));

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
      <!-- Opens the command palette: the way in for a tablet with no keyboard; the tooltip teaches the shortcut. -->
      <kt-tooltip class="search" :text="`Search · ${shortcut}`" placement="bottom">
        <kt-button variant="secondary-no-bg" size="medium" icon="search" label="Search" @click="$emit('search')" />
      </kt-tooltip>
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
      :label="dueTotal === 0 ? 'Start review — nothing due right now' : ''"
      @click="navigateTo('/review')"
    >
      Start review · {{ dueTotal }}
    </kt-button>

    <kt-sub-menu-navigation flush :sections="sections" :active-href="activeHref" @kt-navigate="onNavigate" />

    <!-- Signed in only: who this is, a shortcut to Account. -->
    <kt-card v-if="user" class="profile" clickable @kt-card-click="navigateTo('/settings/account')">
      <span class="profile-row">
        <kt-avatar size="small" :name="displayName" />
        <span class="profile-name">{{ displayName }}</span>
      </span>
    </kt-card>
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
  /* An open branch (Settings) can run past a short screen; the sidebar scrolls instead of cutting it off. */
  overflow-y: auto;
}

/* kt-header takes over below its own breakpoint (900px); the two are never
   shown at once. */
@media (max-width: 899px) {
  .sidebar {
    display: none;
  }
}

.brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px; }
.search { margin-left: auto; }

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

/* Bottom of the sidebar, signed in only. */
.profile { margin-top: auto; }
.profile-row { display: flex; align-items: center; gap: var(--gap-element); min-width: 0; }
.profile-name { font: var(--font-normal-medium); color: var(--text-body); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
