<script setup lang="ts">
import type { KtNavItem } from 'kanto-ds';
import { useCompactLayout } from '~/composables/useCompactLayout';
import { SETTINGS_SECTIONS } from '~/composables/useNavigation';

const route = useRoute();
const { compact } = useCompactLayout();
const menuSections = [{ items: SETTINGS_SECTIONS }];

function onNavigate(event: CustomEvent<{ item: KtNavItem }>): void {
  event.preventDefault();
  if (event.detail.item.href) void navigateTo(event.detail.item.href);
}
</script>

<template>
  <div class="settings-shell">
    <!-- From 900px up the sections sit beside the page; below, /settings itself is the list. -->
    <kt-sub-menu-navigation
      v-if="!compact"
      class="settings-menu"
      :sections="menuSections"
      :active-href="route.path"
      @kt-navigate="onNavigate"
    />
    <div class="settings-page">
      <NuxtPage />
    </div>
  </div>
</template>

<style scoped>
.settings-shell { display: flex; gap: var(--gap-card); align-items: flex-start; }
.settings-menu { flex: none; position: sticky; top: var(--gap-card); }
.settings-page { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--gap-card); }
</style>
