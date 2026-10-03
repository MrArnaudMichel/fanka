<script setup lang="ts">
import type { KtBreadcrumbItem } from 'kanto-ds';
import { useCompactLayout } from '~/composables/useCompactLayout';

const props = defineProps<{ heading: string; description: string }>();
const { compact } = useCompactLayout();

/** On a phone the way back to the list of sections; from 900px up the sidebar shows them. */
const trail = computed<KtBreadcrumbItem[]>(() => [{ label: 'Settings', href: '/settings' }, { label: props.heading }]);

function onNavigate(event: CustomEvent<{ item: KtBreadcrumbItem }>): void {
  event.preventDefault();
  // Replace, so the hardware back button does not return to the section just left.
  if (event.detail.item.href) void navigateTo(event.detail.item.href, { replace: true });
}
</script>

<template>
  <div class="settings-header">
    <kt-breadcrumb v-if="compact" label="Settings" :items="trail" @kt-navigate="onNavigate" />
    <kt-page-header :eyebrow="compact ? '' : 'Settings'" :heading="heading" :description="description" />
  </div>
</template>

<style scoped>
.settings-header { display: flex; flex-direction: column; gap: var(--gap-element); }
</style>
