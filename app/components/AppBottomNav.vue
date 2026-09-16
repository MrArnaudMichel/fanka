<script setup lang="ts">
import type { NavEntry } from '~/composables/useNavigation';

defineProps<{ entries: NavEntry[] }>();
const route = useRoute();
</script>

<template>
  <nav class="bar" aria-label="Primary">
    <NuxtLink v-for="entry in entries" :key="entry.to" :to="entry.to" class="tab" :class="{ active: route.path === entry.to }">
      <kt-icon :name="entry.icon" size="18" />
      <span>{{ entry.label }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
.bar {
  position: fixed;
  inset: auto 0 0 0;
  z-index: var(--z-dropdown);
  display: flex;
  gap: 2px;
  padding: 8px 8px 10px;
  border-top: var(--border-width) solid var(--border-subtle);
  background: var(--surface-card);
}

.tab {
  flex: 1;
  /* 52px keeps the target inside the thumb zone on a phone. */
  min-height: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: var(--border-radius);
  text-decoration: none;
  font: var(--font-normal-small);
  color: var(--text-muted);
}

.tab.active { background: var(--color-primary-soft); color: var(--text-body); }
</style>
