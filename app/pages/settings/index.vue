<script setup lang="ts">
import type { KtNavItem } from 'kanto-ds';
import { useCompactLayout } from '~/composables/useCompactLayout';
import { SETTINGS_SECTIONS } from '~/composables/useNavigation';

const { compact } = useCompactLayout();
const sections = [{ items: SETTINGS_SECTIONS }];

// On a wide screen the menu is already beside the page, so open the first section.
watch(compact, (isCompact) => {
  if (!isCompact) void navigateTo('/settings/account', { replace: true });
}, { immediate: true });

function onNavigate(event: CustomEvent<{ item: KtNavItem }>): void {
  event.preventDefault();
  if (event.detail.item.href) void navigateTo(event.detail.item.href);
}
</script>

<template>
  <kt-page-header eyebrow="Preferences" heading="Settings" />
  <kt-sub-menu-navigation flush :sections="sections" @kt-navigate="onNavigate" />
</template>
