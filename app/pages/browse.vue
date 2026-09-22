<script setup lang="ts">
import CardTable from '~/components/CardTable.vue';

const route = useRoute();
// Ruling 1: `?deck=<id>` only presets the deck filter — it stays a filter a
// learner can change, unlike Task 13's `scope`, which fixes it. CardTable
// validates this against the live deck list itself before applying it.
const defaultDeckId = computed(() => (typeof route.query.deck === 'string' ? route.query.deck : undefined));
</script>

<template>
  <div class="browse">
    <kt-page-header eyebrow="Collection" heading="Browse" description="Search, filter and manage every card across your decks." />
    <CardTable :default-deck-id="defaultDeckId" />
  </div>
</template>

<style scoped>
.browse { display: flex; flex-direction: column; gap: 24px; }
</style>
