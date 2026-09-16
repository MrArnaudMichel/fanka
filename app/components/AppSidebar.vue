<script setup lang="ts">
import type { NavEntry } from '~/composables/useNavigation';

defineProps<{ main: NavEntry[]; library: NavEntry[]; dueTotal: number }>();
const route = useRoute();
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <span class="mark">繁</span>
      <span class="wordmark">
        <span class="name">FANKA</span>
        <span class="tagline">Traditional Chinese</span>
      </span>
    </div>

    <kt-button variant="primary" size="medium" icon="play" full-width @click="navigateTo('/review')">
      Today's session · {{ dueTotal }}
    </kt-button>

    <nav>
      <p class="overline">Learn</p>
      <NuxtLink v-for="entry in main" :key="entry.to" :to="entry.to" class="entry" :class="{ active: route.path === entry.to }">
        <kt-icon :name="entry.icon" size="16" />
        <span class="label">{{ entry.label }}</span>
        <span v-if="entry.badge" class="badge">{{ entry.badge }}</span>
      </NuxtLink>

      <p class="overline">Collection</p>
      <NuxtLink v-for="entry in library" :key="entry.to" :to="entry.to" class="entry" :class="{ active: route.path === entry.to }">
        <kt-icon :name="entry.icon" size="16" />
        <span class="label">{{ entry.label }}</span>
      </NuxtLink>
    </nav>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 252px;
  flex: 0 0 252px;
  border-right: var(--border-width) solid var(--border-subtle);
  background: var(--color-dark-8);
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 20px 16px;
  position: sticky;
  top: 0;
  height: 100vh;
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
.name { font: var(--font-title-h6); letter-spacing: 4px; color: var(--color-white); }
.tagline { font: var(--font-normal-small); color: var(--text-muted); }

nav { display: flex; flex-direction: column; gap: 2px; }

.overline {
  margin: 16px 8px 4px;
  font: var(--font-title-overline);
  letter-spacing: var(--letter-spacing-overline);
  text-transform: uppercase;
  color: var(--text-muted);
}

.overline:first-child { margin-top: 8px; }

.entry {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 8px;
  border-radius: var(--border-radius);
  text-decoration: none;
  font: var(--font-normal-medium);
  color: var(--text-muted);
  background: transparent;
}

.entry:hover { background: var(--surface-hover); color: var(--color-white); }
.entry.active { background: var(--color-primary-soft); color: var(--color-white); }
.label { flex: 1; }
.badge { font: var(--font-normal-small); font-family: var(--font-family-code); color: var(--color-primary-base); }
</style>
